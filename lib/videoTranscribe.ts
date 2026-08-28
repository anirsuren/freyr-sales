import "server-only";

import { audioExtractionProblem, extractAudioParts } from "./audioExtract";
import {
  saveMaterialText,
  transcriptToText,
  type MaterialTranscript,
  type TranscriptSegment,
} from "./materialText";

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
  /**
   * "blocked" means we never got a verdict on this file — no key, no credits,
   * no ffmpeg, the API refused. The file is fine and this is worth retrying,
   * so callers must NOT record it as unreadable.
   * "silent" means the audio was transcribed and there were genuinely no
   * words in it. That is an answer, and asking again gets the same one.
   */
  failure?: "blocked" | "silent";
  transcript?: MaterialTranscript;
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

export type SpeechResult =
  | { ok: true; segments: TranscriptSegment[]; duration: number }
  | { ok: false; blocked: true; reason: string }
  | { ok: false; blocked: false; reason: string };

/**
 * Audio in, timed segments out.
 *
 * It returns a RESULT rather than null-or-text because the caller has to tell
 * "there was nothing said" apart from "we could not ask" — those two used to
 * arrive as the same `null` and got written down as the same permanent answer.
 */
export async function speechToText(
  bytes: Buffer,
  filename: string
): Promise<SpeechResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key)
    return { ok: false, blocked: true, reason: "OPENAI_API_KEY is not set" };

  // Strip the picture and, if the audio is still long, cut it into parts.
  // This is what removes the size ceiling; see lib/audioExtract.ts.
  const parts = await extractAudioParts(bytes, filename);
  if (!parts.length) {
    const why = audioExtractionProblem() ?? "no audio track in this file";
    console.warn(`[transcribe] no audio from ${filename}: ${why}`);
    // A missing ffmpeg is our problem; a silent file is the file's.
    return audioExtractionProblem()
      ? { ok: false, blocked: true, reason: why }
      : { ok: false, blocked: false, reason: why };
  }

  const segments: TranscriptSegment[] = [];
  let offset = 0;
  let duration = 0;
  let blocked: string | null = null;

  for (const [index, part] of parts.entries()) {
    const heard = await whisperOnce(key, part.bytes, part.name);
    if (!heard.ok) {
      // One refused part means the rest will refuse too (a bad key, an empty
      // balance), so stop rather than burn the whole file against it.
      blocked = heard.reason;
      console.error(
        `[transcribe] part ${index + 1}/${parts.length} of ${filename}: ${heard.reason}`
      );
      break;
    }
    /* Each part was cut from the same recording, so its timings restart at
       zero. Shifting them by everything already transcribed is what keeps a
       four-hour recording's timestamps true at the end. */
    for (const seg of heard.segments)
      segments.push({
        start: seg.start + offset,
        end: seg.end + offset,
        text: seg.text,
      });
    offset += heard.duration;
    duration += heard.duration;
  }

  if (blocked && !segments.length)
    return { ok: false, blocked: true, reason: blocked };
  if (parts.length > 1)
    console.log(`[transcribe] ${filename}: ${segments.length} segments`);
  if (!segments.length)
    return { ok: false, blocked: false, reason: "no speech in the audio" };
  return { ok: true, segments, duration };
}

type WhisperReply =
  | { ok: true; segments: TranscriptSegment[]; duration: number }
  | { ok: false; reason: string };

/**
 * A single Whisper request. Every caller sends an already-small audio part.
 *
 * `verbose_json` with segment granularity, not plain text, because the
 * transcript is shown beside the video and every line needs the moment it was
 * said (Anir: "it'll obviously be timestamped, kind of like a Zoom meeting").
 */
async function whisperOnce(
  key: string,
  bytes: Buffer,
  filename: string
): Promise<WhisperReply> {
  try {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(bytes)]), filename);
    form.append("model", "whisper-1");
    form.append("response_format", "verbose_json");
    form.append("timestamp_granularities[]", "segment");
    const res = await fetch(WHISPER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 400);
      console.error(`[transcribe] whisper ${res.status} for ${filename}: ${body}`);
      return { ok: false, reason: whisperReason(res.status, body) };
    }
    const data = (await res.json()) as {
      text?: string;
      duration?: number;
      segments?: { start?: number; end?: number; text?: string }[];
    };
    const segments = (data.segments ?? [])
      .map((s) => ({
        start: Number(s.start) || 0,
        end: Number(s.end) || 0,
        text: (s.text || "").trim(),
      }))
      .filter((s) => s.text);
    if (segments.length)
      return {
        ok: true,
        segments,
        duration: Number(data.duration) || segments[segments.length - 1].end,
      };
    /* Older responses, and very short clips, can come back as one blob with
       no segment list. One segment covering the whole part is still a usable
       transcript, so it is not treated as a failure. */
    const flat = (data.text || "").trim();
    if (flat)
      return {
        ok: true,
        segments: [{ start: 0, end: Number(data.duration) || 0, text: flat }],
        duration: Number(data.duration) || 0,
      };
    return { ok: false, reason: "whisper returned no words" };
  } catch (error) {
    console.error("[transcribe] whisper call failed:", error);
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "the transcriber could not be reached",
    };
  }
}

/** A sentence a person can act on, not an HTTP code. */
function whisperReason(status: number, body: string): string {
  if (/insufficient_quota|credit_balance_exhausted|no credits/i.test(body))
    return "the OpenAI account has no credits left, so nothing can be transcribed until it is topped up";
  if (status === 401)
    return "the OpenAI key was rejected";
  if (status === 429)
    return "the transcriber is rate limited right now";
  if (status >= 500)
    return "the transcriber is down right now";
  return `the transcriber refused this file (${status})`;
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
        "- The machine transcript is NUMBERED, one line per line. Return exactly",
        "  the same count, in the same order, each still numbered the same way.",
        "  Never merge two lines, never split one, never drop one. If a line has",
        "  nothing to correct, return it unchanged.",
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
    return {
      ...idle,
      failure: "blocked",
      reason: "transcription is production-only",
    };
  if (!transcriptionConfigured())
    return { ...idle, failure: "blocked", reason: "OPENAI_API_KEY is not set" };
  if (!isTranscribableFile(args.filename))
    return { ...idle, reason: "no audio track expected in this file" };


  const heard = await speechToText(args.bytes, args.filename);
  if (!heard.ok)
    return {
      ...idle,
      failure: heard.blocked ? "blocked" : "silent",
      reason: heard.reason,
    };

  /* THE OWNER'S OWN COPY WINS ON NAMES. Speech recognition mangles exactly
     the words that matter here — Freya.GRR-PAC, eCTD, a customer's name — and
     the owner's copy usually has them right. Only the words change; the
     timings stay the machine's, because only the machine measured them. */
  const owner = (args.ownerTranscript || "").trim();
  let segments = heard.segments;
  let source: MaterialTranscript["source"] = "machine";
  if (owner.length > 40) {
    const merged = await reconcileSegments(segments, owner);
    if (merged) {
      segments = merged;
      source = "reconciled";
    }
  }

  const transcript: MaterialTranscript = {
    segments,
    source,
    duration: heard.duration,
  };
  const finalText = transcriptToText(transcript);
  const words = finalText.match(/\S+/g)?.length ?? 0;
  await saveMaterialText(args.path, {
    offeringId: args.offeringId,
    filename: args.filename,
    text: finalText,
    bytes: args.bytes.length,
    transcript,
    extractedAt: new Date().toISOString(),
  }).catch(() => undefined);

  console.log(
    `[transcribe] ${args.filename}: ${words} words in ${segments.length} segments${source === "reconciled" ? ", reconciled with the owner's transcript" : ""}`
  );
  return { transcribed: true, reconciled: source === "reconciled", words, transcript };
}

/**
 * Reconcile the machine's timed segments against the owner's flat transcript.
 *
 * The timings are never up for negotiation — the owner's copy has none — so
 * Claude is given the numbered lines and asked to return the same lines with
 * the same numbering, corrected. A reply that changes the line count is
 * discarded rather than guessed at: a transcript whose timings have slipped is
 * worse than one with a misspelled product name.
 */
async function reconcileSegments(
  segments: TranscriptSegment[],
  owner: string
): Promise<TranscriptSegment[] | null> {
  const numbered = segments.map((s, i) => `${i + 1}. ${s.text}`).join("\n");
  const merged = await reconcileTranscripts(numbered, owner);
  if (!merged) return null;
  const lines = merged
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.replace(/^\d+\.\s*/, ""));
  if (lines.length !== segments.length) {
    console.warn(
      `[transcribe] reconciliation returned ${lines.length} lines for ${segments.length} segments; keeping the machine copy`
    );
    return null;
  }
  return segments.map((s, i) => ({ ...s, text: lines[i] }));
}
