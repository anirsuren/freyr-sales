import "server-only";

import { extractAudioParts } from "./audioExtract";
import { saveMaterialText } from "./materialText";

/**
 * VIDEOS GET TRANSCRIBED, AND AN OWNER'S OWN TRANSCRIPT MAKES THEM BETTER.
 *
 * The app used to tell owners "Freyr AI cannot watch video", which was true
 * and useless: a demo recording is often the single best explanation of an
 * offering that exists, and it reached the assistant as a filename. Anir,
 * Aug 14: "there has to be AI used here... it'll transcribe it either way,
 * but it'll cross-reference it if they have a better transcript".
 *
 * So there are two passes:
 *
 *   1. SPEECH TO TEXT. OpenAI Whisper, the cheaper of the two options at
 *      about $0.36 per hour of audio. It bills against Anir's key, which is
 *      why nothing here runs on a dev server and why it is called once per
 *      uploaded video and never on a loop.
 *
 *   2. RECONCILIATION, only when the owner supplied their own transcript.
 *      Speech recognition mangles exactly the words that matter here:
 *      Freya.GRR-PAC, eCTD, Pharmacovigilance, a customer's name. The owner's
 *      copy usually has those right and the machine copy usually has better
 *      coverage. Claude merges them into one, preferring the owner on proper
 *      nouns and the machine on anything the owner's copy is missing.
 *
 * Never throws. A failed transcription costs searchability on one file, and
 * the video is still there to watch.
 */

/**
 * WHISPER. Anir picked it (Aug 14: "just do whisper who cares about the other
 * one"), it is the cheaper of the two at about $0.36 per hour of audio, and
 * one provider is one thing to reason about.
 *
 * Claude is not an option here: it does not do speech-to-text. It does the
 * reconciliation pass below, which is the part it is actually good at.
 *
 * The real saving is not the provider anyway: it is transcribing each file
 * exactly once, which is why this runs on upload and never as a sweep.
 */
const WHISPER_URL = "https://api.openai.com/v1/audio/transcriptions";

/**
 * NO SIZE LIMIT (Anir, Aug 14: "no cap is mandatory").
 *
 * Whisper's endpoint refuses anything over 25MB, but the video never reaches
 * it: extractAudioParts strips the picture down to 16kHz mono MP3 and cuts
 * that into parts if it is still large. Each part is well inside Whisper's
 * limit, they are transcribed in order, and the text is joined. A four-hour
 * recording is simply more parts.
 */

export type TranscribeOutcome = {
  transcribed: boolean;
  reconciled: boolean;
  words: number;
  reason?: string;
};

export function transcriptionConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

/** Is this the kind of file that has audio worth transcribing? */
export function isTranscribableFile(filename: string): boolean {
  return /\.(mp4|mov|m4v|webm|mkv|avi|mp3|m4a|wav|aac|ogg|flac)$/i.test(
    filename
  );
}

/** One call to Whisper. Returns the plain text, or null. */
export async function speechToText(
  bytes: Buffer,
  filename: string
): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;

  // Strip the picture and, if the audio is still long, cut it into parts.
  // This is what removes the size ceiling; see lib/audioExtract.ts.
  const parts = await extractAudioParts(bytes, filename);
  if (!parts.length) {
    console.warn(`[transcribe] no audio could be extracted from ${filename}`);
    return null;
  }

  const pieces: string[] = [];
  for (const [index, part] of parts.entries()) {
    const text = await whisperOnce(key, part.bytes, part.name);
    if (text) pieces.push(text);
    else
      console.error(
        `[transcribe] part ${index + 1}/${parts.length} of ${filename} returned nothing`
      );
  }
  if (parts.length > 1)
    console.log(
      `[transcribe] ${filename}: ${pieces.length}/${parts.length} parts transcribed`
    );
  const joined = pieces.join("\n").trim();
  return joined || null;
}

/** A single Whisper request. Every caller sends an already-small audio part. */
async function whisperOnce(
  key: string,
  bytes: Buffer,
  filename: string
): Promise<string | null> {
  try {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(bytes)]), filename);
    form.append("model", "whisper-1");
    const res = await fetch(WHISPER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    if (!res.ok) {
      console.error(
        `[transcribe] whisper ${res.status} for ${filename}: ${(await res.text()).slice(0, 200)}`
      );
      return null;
    }
    const data = (await res.json()) as { text?: string };
    const text = (data.text || "").trim();
    return text || null;
  } catch (error) {
    console.error("[transcribe] whisper call failed:", error);
    return null;
  }
}

/**
 * Merge the machine transcript with the owner's. Deliberately conservative:
 * the instruction is to correct and fill, never to summarise, because the
 * whole value of a transcript is that it is what was actually said.
 */
export async function reconcileTranscripts(
  machine: string,
  owner: string
): Promise<string | null> {
  try {
    const { agentAnswer } = await import("./claude");
    const merged = await agentAnswer(
      [
        "You reconcile two transcripts of the same recording into one.",
        "One is machine speech-to-text: good coverage, but it mangles product",
        "names, acronyms and people's names. The other was supplied by the",
        "person who owns the recording: usually right about those names, but it",
        "may be partial, tidied up, or missing sections.",
        "",
        "Rules:",
        "- Output the reconciled transcript only. No preamble, no commentary.",
        "- Prefer the owner's spelling for any name, product, acronym or number.",
        "- Keep anything the machine captured that the owner's copy is missing.",
        "- Never summarise, never paraphrase, never invent a line neither has.",
        "- Keep the speaking order and any speaker labels that exist.",
      ].join("\n"),
      `MACHINE TRANSCRIPT:\n${machine}\n\n---\n\nOWNER'S TRANSCRIPT:\n${owner}`
    );
    const text = (merged || "").trim();
    return text || null;
  } catch (error) {
    console.error("[transcribe] reconciliation failed:", error);
    return null;
  }
}

/**
 * The whole job for one video: transcribe it, reconcile if the owner gave us
 * their own, and store the result as this material's text so the assistant
 * answers from what was said.
 *
 * PRODUCTION ONLY. The same reasoning as the monthly mailer: a dev server
 * carries the real key in .env.local, and this one bills per minute of audio.
 */
export async function transcribeMaterial(args: {
  offeringId: string;
  path: string;
  filename: string;
  bytes: Buffer;
  /** The owner's own transcript, already extracted to text, when they gave one. */
  ownerTranscript?: string | null;
  /** Escape hatch for a deliberate local run. */
  force?: boolean;
}): Promise<TranscribeOutcome> {
  const idle: TranscribeOutcome = {
    transcribed: false,
    reconciled: false,
    words: 0,
  };
  if (process.env.NODE_ENV !== "production" && !args.force)
    return { ...idle, reason: "transcription is production-only" };
  if (!transcriptionConfigured())
    return { ...idle, reason: "OPENAI_API_KEY is not set" };
  if (!isTranscribableFile(args.filename))
    return { ...idle, reason: "no audio track expected in this file" };

  const machine = await speechToText(args.bytes, args.filename);
  if (!machine) return { ...idle, reason: "speech-to-text returned nothing" };

  const owner = (args.ownerTranscript || "").trim();
  let finalText = machine;
  let reconciled = false;
  if (owner.length > 40) {
    const merged = await reconcileTranscripts(machine, owner);
    if (merged) {
      finalText = merged;
      reconciled = true;
    }
  }

  const words = finalText.match(/\S+/g)?.length ?? 0;
  await saveMaterialText(args.path, {
    offeringId: args.offeringId,
    filename: args.filename,
    text: finalText,
    extractedAt: new Date().toISOString(),
  }).catch(() => undefined);

  console.log(
    `[transcribe] ${args.filename}: ${words} words${reconciled ? ", reconciled with the owner's transcript" : ""}`
  );
  return { transcribed: true, reconciled, words };
}
