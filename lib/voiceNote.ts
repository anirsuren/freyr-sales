/**
 * A WHATSAPP VOICE NOTE, TURNED INTO TEXT (Anir, Sep 27: "I should be able to
 * do a voice recording and send it that way as well").
 *
 * Voice notes arrive as short Opus-in-OGG files, well under either provider's
 * size limit, so they go straight to the transcription API as they are: no
 * ffmpeg, no splitting, none of lib/videoTranscribe's meeting-length
 * machinery.
 *
 * TWO PROVIDERS, tried in order, both on keys the workspace already holds:
 * OpenAI Whisper (the same OPENAI_API_KEY that transcribes meeting
 * recordings), then ElevenLabs Scribe. One provider running out of credit is
 * the failure that actually happens: on Sep 27 the OpenAI balance was empty,
 * every transcription came back 429, and a person who recorded a voice note
 * just got told it could not be made out. A second provider means a voice note
 * still becomes text on the day that happens.
 */

const WHISPER_URL = "https://api.openai.com/v1/audio/transcriptions";
const SCRIBE_URL = "https://api.elevenlabs.io/v1/speech-to-text";
/** Whisper takes 25 MB, Scribe more; a minute of WhatsApp voice is well under 1 MB. */
const MAX_BYTES = 20 * 1024 * 1024;

const EXTENSION: Record<string, string> = {
  "audio/ogg": "ogg",
  "audio/opus": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/amr": "amr",
  "audio/wav": "wav",
  "audio/webm": "webm",
};

export function voiceNoteConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.OPENAI_API_KEY || env.ELEVENLABS_API_KEY);
}

export type VoiceNoteResult = { ok: true; text: string } | { ok: false; reason: string };

type Attempt = { ok: true; text: string } | { ok: false; reason: string };

/** A fresh Blob per attempt: a FormData body is consumed by the fetch that sends it. */
function audioFile(bytes: Buffer, type: string): Blob {
  return new Blob([new Uint8Array(bytes)], { type });
}

async function viaWhisper(bytes: Buffer, type: string, name: string, key: string, fetchImpl: typeof fetch): Promise<Attempt> {
  const form = new FormData();
  form.append("model", "whisper-1");
  form.append("response_format", "text");
  form.append("file", audioFile(bytes, type), name);
  const response = await fetchImpl(WHISPER_URL, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form });
  if (!response.ok) return { ok: false, reason: `whisper ${response.status}` };
  const text = (await response.text()).trim();
  return text ? { ok: true, text } : { ok: false, reason: "whisper heard nothing" };
}

async function viaScribe(bytes: Buffer, type: string, name: string, key: string, fetchImpl: typeof fetch): Promise<Attempt> {
  const form = new FormData();
  form.append("model_id", "scribe_v1");
  form.append("file", audioFile(bytes, type), name);
  const response = await fetchImpl(SCRIBE_URL, { method: "POST", headers: { "xi-api-key": key }, body: form });
  if (!response.ok) return { ok: false, reason: `scribe ${response.status}` };
  const body = (await response.json().catch(() => null)) as { text?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  return text ? { ok: true, text } : { ok: false, reason: "scribe heard nothing" };
}

export async function transcribeVoiceNote(
  bytes: Buffer,
  mimeType: string,
  fetchImpl: typeof fetch = fetch,
  env: NodeJS.ProcessEnv = process.env
): Promise<VoiceNoteResult> {
  if (!voiceNoteConfigured(env)) return { ok: false, reason: "transcription is not configured (OPENAI_API_KEY or ELEVENLABS_API_KEY)" };
  if (!bytes.length) return { ok: false, reason: "empty audio" };
  if (bytes.length > MAX_BYTES) return { ok: false, reason: "voice note too large" };
  const type = (mimeType || "audio/ogg").split(";")[0].trim().toLowerCase();
  const name = `voice-note.${EXTENSION[type] ?? "ogg"}`;
  const reasons: string[] = [];
  const providers: Array<() => Promise<Attempt>> = [];
  if (env.OPENAI_API_KEY) providers.push(() => viaWhisper(bytes, type, name, env.OPENAI_API_KEY as string, fetchImpl));
  if (env.ELEVENLABS_API_KEY) providers.push(() => viaScribe(bytes, type, name, env.ELEVENLABS_API_KEY as string, fetchImpl));
  for (const attempt of providers) {
    const result = await attempt().catch((error) => ({ ok: false as const, reason: error instanceof Error ? error.message : "transcription threw" }));
    if (result.ok) return result;
    reasons.push(result.reason);
  }
  return { ok: false, reason: reasons.join("; ") || "transcription failed" };
}
