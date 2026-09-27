/**
 * A WHATSAPP VOICE NOTE, TURNED INTO TEXT (Anir, Sep 27: "I should be able to
 * do a voice recording and send it that way as well").
 *
 * Voice notes arrive as short Opus-in-OGG files, well under Whisper's size
 * limit, so they go straight to the transcription API as they are: no ffmpeg,
 * no splitting, none of lib/videoTranscribe's meeting-length machinery. The
 * key is the same OPENAI_API_KEY that transcribes meeting recordings.
 */

const WHISPER_URL = "https://api.openai.com/v1/audio/transcriptions";
/** Whisper takes 25 MB; a minute of WhatsApp voice is well under 1 MB. */
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
  return Boolean(env.OPENAI_API_KEY);
}

export type VoiceNoteResult = { ok: true; text: string } | { ok: false; reason: string };

export async function transcribeVoiceNote(
  bytes: Buffer,
  mimeType: string,
  fetchImpl: typeof fetch = fetch,
  env: NodeJS.ProcessEnv = process.env
): Promise<VoiceNoteResult> {
  const key = env.OPENAI_API_KEY;
  if (!key) return { ok: false, reason: "transcription is not configured (OPENAI_API_KEY)" };
  if (!bytes.length) return { ok: false, reason: "empty audio" };
  if (bytes.length > MAX_BYTES) return { ok: false, reason: "voice note too large" };
  const type = (mimeType || "audio/ogg").split(";")[0].trim().toLowerCase();
  const form = new FormData();
  form.append("model", "whisper-1");
  form.append("response_format", "text");
  form.append("file", new Blob([new Uint8Array(bytes)], { type }), `voice-note.${EXTENSION[type] ?? "ogg"}`);
  const response = await fetchImpl(WHISPER_URL, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form });
  if (!response.ok) return { ok: false, reason: `transcription failed (${response.status})` };
  const text = (await response.text()).trim();
  return text ? { ok: true, text } : { ok: false, reason: "nothing was said" };
}
