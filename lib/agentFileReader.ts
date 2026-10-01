import "server-only";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, open, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type JSZip from "jszip";
import { extractFileContent } from "@/lib/fileText";
import { withoutProseDashes } from "@/lib/agentProse";
import { isVertexConfigured, vertexReadParts, type VertexReadPart } from "@/lib/vertex";

/**
 * THE AGENT READS WHATEVER IT IS GIVEN (Anir, Sep 30: "it should be able to read
 * files, videos, audio... PDFs even if it's all visuals... literally anything").
 *
 * One entry point, readFileForAgent(), turns any file into text the agent can
 * answer from:
 *   - documents (Word, PowerPoint, Excel, CSV, text, HTML, JSON): their own
 *     words, read locally by lib/fileText (and SheetJS for spreadsheets, which
 *     keeps sheet names and formulas);
 *   - anything visual (PDF pages, scans, photos, screenshots, charts, the
 *     pictures inside a deck or a Word file): read by Gemini on Vertex, which
 *     sees the page the way a person does, so an image-only PDF reads as well
 *     as a typed one;
 *   - speech (audio, and the sound of a video): cut into five-minute pieces
 *     and transcribed in parallel, with timestamps from the start of the
 *     recording. One pass over a 30-minute call stopped at 6:15 (tested Sep 30),
 *     so a long recording is never sent whole;
 *   - video: the transcript plus what is ON SCREEN, from frames sampled through
 *     the recording, so a number shown on a slide and never said aloud is read.
 *
 * It never throws for a bad file: an empty, locked, damaged or unknown file
 * comes back with a plain note saying so, which the agent passes on.
 */

export type FileKind = "pdf" | "image" | "audio" | "video" | "word" | "slides" | "sheet" | "text" | "archive" | "email" | "unknown";

export type FileReading = {
  kind: FileKind;
  name: string;
  mime: string;
  bytes: number;
  durationSeconds?: number;
  pages?: number;
  /** Everything read, in order: page text, a timestamped transcript, on-screen text. */
  text: string;
  /** Three to five sentences, for when the full text is too long to show. */
  summary: string;
  /** Plain words about anything that could not be read, for the agent to pass on. */
  notes: string[];
  /** How it was read: "text", "gemini", "transcript", "frames". */
  readBy: string[];
};

/** Base64 grows a third; Vertex takes about 20MB inline per request. */
const INLINE_MAX = 14 * 1024 * 1024;
/** A five-minute piece is what one transcription pass reliably finishes. */
const AUDIO_PIECE_SECONDS = 300;
const PARALLEL = 3;
const MAX_TEXT = 900_000;

const EXT_MIME: Record<string, string> = {
  pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
  heic: "image/heic", heif: "image/heif", bmp: "image/bmp", tif: "image/tiff", tiff: "image/tiff",
  mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", wav: "audio/wav", ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg",
  flac: "audio/flac", amr: "audio/amr", aiff: "audio/aiff", aif: "audio/aiff", weba: "audio/webm",
  mp4: "video/mp4", mov: "video/quicktime", m4v: "video/mp4", webm: "video/webm", mkv: "video/x-matroska", avi: "video/x-msvideo", "3gp": "video/3gpp", wmv: "video/x-ms-wmv",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", xlsm: "application/vnd.ms-excel.sheet.macroEnabled.12",
  xls: "application/vnd.ms-excel", ods: "application/vnd.oasis.opendocument.spreadsheet",
  csv: "text/csv", tsv: "text/tab-separated-values", txt: "text/plain", md: "text/markdown", json: "application/json",
  html: "text/html", htm: "text/html", xml: "application/xml", rtf: "application/rtf", log: "text/plain", yml: "text/yaml", yaml: "text/yaml",
  zip: "application/zip", eml: "message/rfc822", msg: "application/vnd.ms-outlook",
};

const extOf = (name: string) => (name.split(".").pop() || "").toLowerCase();

/** What kind of file this is, from its first bytes first and its name second. */
export function fileKind(name: string, head: Buffer, mime = ""): FileKind {
  const ext = extOf(name);
  const sig = head.subarray(0, 16);
  const ascii = sig.toString("latin1");
  if (ascii.startsWith("%PDF")) return "pdf";
  if (sig[0] === 0xff && sig[1] === 0xd8) return "image";
  if (ascii.startsWith("\x89PNG") || ascii.startsWith("GIF8") || (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP")) return "image";
  if (["png", "jpg", "jpeg", "gif", "webp", "heic", "heif", "bmp", "tif", "tiff"].includes(ext)) return "image";
  if (["eml", "msg"].includes(ext) || mime === "message/rfc822" || mime === "application/vnd.ms-outlook") return "email";
  if (["docx", "doc", "odt"].includes(ext)) return "word";
  if (["pptx", "ppt", "odp"].includes(ext)) return "slides";
  if (["xlsx", "xlsm", "xls", "ods", "csv", "tsv"].includes(ext)) return "sheet";
  if (["mp4", "mov", "m4v", "webm", "mkv", "avi", "3gp", "wmv"].includes(ext) || mime.startsWith("video/")) return "video";
  if (["mp3", "m4a", "aac", "wav", "ogg", "oga", "opus", "flac", "amr", "aiff", "aif", "weba"].includes(ext) || mime.startsWith("audio/")) return "audio";
  if (ext === "zip" || (ascii.startsWith("PK") && !["docx", "pptx", "xlsx", "xlsm"].includes(ext))) return "archive";
  if (["txt", "md", "markdown", "json", "xml", "html", "htm", "rtf", "log", "yml", "yaml"].includes(ext) || mime.startsWith("text/")) return "text";
  if (mime.startsWith("image/")) return "image";
  return "unknown";
}

const stamp = (seconds: number) => {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${String(m).padStart(2, "0")}:${ss}`;
};

/* ---------------------------------------------------------------- ffmpeg */

function ffmpegBin(): string | null {
  const candidates: (string | undefined)[] = [process.env.FFMPEG_BIN];
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    candidates.push(require("ffmpeg-static") as string);
  } catch {
    // Not bundled here; fall through to the other places it can live.
  }
  candidates.push(path.join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg"));
  return candidates.find((c) => c && existsSync(c)) ?? null;
}

function ffmpeg(args: string[], timeoutMs = 30 * 60_000): Promise<{ ok: boolean; stderr: string }> {
  const bin = ffmpegBin();
  if (!bin) return Promise.resolve({ ok: false, stderr: "ffmpeg is missing from this build" });
  return new Promise((resolve) => {
    const child = spawn(bin, ["-hide_banner", "-nostdin", ...args], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr?.on("data", (d) => (stderr = (stderr + d.toString()).slice(-20_000)));
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("error", (e) => (clearTimeout(timer), resolve({ ok: false, stderr: String(e) })));
    child.on("close", (code) => (clearTimeout(timer), resolve({ ok: code === 0, stderr })));
  });
}

/** Duration and which streams a media file has, from ffmpeg's own report. */
async function probe(file: string): Promise<{ seconds: number | null; video: boolean; audio: boolean }> {
  const { stderr } = await ffmpeg(["-i", file], 60_000);
  const d = /Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(stderr);
  return {
    seconds: d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : null,
    // Cover art in an audio file is a still picture, not a video to watch.
    video: /Stream #[^\n]*Video:/.test(stderr) && !/Video:[^\n]*\(attached pic\)/.test(stderr),
    audio: /Stream #[^\n]*Audio:/.test(stderr),
  };
}

async function inParallel<T, R>(items: T[], limit: number, work: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await work(items[i], i);
    }
  }));
  return out;
}

const inline = (mimeType: string, bytes: Buffer): VertexReadPart => ({ inlineData: { mimeType, data: bytes.toString("base64") } });

/**
 * One read, retried patiently. Vertex throttles (429) when several pieces of a
 * long recording are read at once alongside everything else; one quick retry
 * gave up and silently dropped minutes 15 to 30 of a call (found testing Sep
 * 30). Throttling and Google's own hiccups are waited out, up to about a minute
 * and a half; a refusal for any other reason fails at once.
 */
async function gemini(parts: VertexReadPart[], maxOutputTokens = 8192): Promise<string> {
  return (await geminiRead(parts, maxOutputTokens)).text;
}

/** The same read, also saying whether the answer hit its length limit (so the caller can read less at a time). */
async function geminiRead(parts: VertexReadPart[], maxOutputTokens = 8192, timeoutMs?: number): Promise<{ text: string; cutOff: boolean }> {
  let wait = 2000;
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await vertexReadParts(parts, { maxOutputTokens, ...(timeoutMs ? { timeoutMs } : {}) });
      if (r.text.trim()) return { text: r.text.trim(), cutOff: r.finishReason === "MAX_TOKENS" };
      if (attempt >= 2) return { text: "", cutOff: false };
    } catch (error) {
      const status = (error as { status?: number }).status;
      const retryable = status === 429 || status === 500 || status === 503 || status === 504 ||
        /RESOURCE_EXHAUSTED|UNAVAILABLE|DEADLINE|ECONNRESET|ETIMEDOUT|fetch failed|socket hang up/i.test(String(error));
      if (!retryable || attempt >= 6) throw error;
    }
    await new Promise((s) => setTimeout(s, wait + Math.random() * 1000));
    wait = Math.min(wait * 2, 30_000);
  }
}

/* ---------------------------------------------------------------- speech */

type TimedLine = { at: number; text: string };

const TRANSCRIBE = "Transcribe everything said in this audio clip, word for word. Start a new line at each change of speaker. " +
  "Begin every line with [mm:ss], the time from the start of THIS clip, then the speaker as Speaker 1, Speaker 2 and so on, then a colon. " +
  "Write names, numbers, amounts and dates exactly as said. Do not summarise, translate, explain or skip anything. If nobody speaks, write only: (no speech).";

/** "[12:05] Speaker 2: ..." lines, moved by the clip's offset into the whole recording. */
export function timedLines(raw: string, offsetSeconds: number): TimedLine[] {
  const lines: TimedLine[] = [];
  for (const rawLine of raw.split("\n")) {
    const line = rawLine.replace(/\*\*/g, "").trim();
    if (!line || /^\(no speech\)$/i.test(line)) continue;
    const m = /^\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]\s*(.*)$/.exec(line);
    if (m) {
      const seconds = m[3] !== undefined ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : Number(m[1]) * 60 + Number(m[2]);
      if (m[4].trim()) lines.push({ at: offsetSeconds + seconds, text: m[4].trim() });
    } else if (lines.length && !/^(here is|an accurate|transcript|verbatim)/i.test(line)) {
      lines[lines.length - 1].text += ` ${line}`;
    }
  }
  return lines;
}

/** Whisper's timed segments for one piece: the second opinion when Gemini is throttled or empty. */
async function whisperPiece(bytes: Buffer): Promise<TimedLine[] | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  try {
    const form = new FormData();
    form.append("model", "whisper-1");
    form.append("response_format", "verbose_json");
    form.append("timestamp_granularities[]", "segment");
    form.append("file", new Blob([new Uint8Array(bytes)], { type: "audio/mpeg" }), "piece.mp3");
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(180_000) });
    if (!response.ok) return null;
    const data = (await response.json()) as { segments?: { start: number; text: string }[] };
    return (data.segments ?? []).map((seg) => ({ at: seg.start, text: seg.text.trim() })).filter((l) => l.text);
  } catch {
    return null;
  }
}

/**
 * The speech in any audio or video file, as timestamped lines across the whole recording.
 *
 * Pieces are read in parallel first. Any piece Gemini could not read (throttled
 * past its retries, or an empty answer) is tried again on its own after a
 * pause, then by Whisper, and only then reported as unheard. A forwarded
 * 30-minute call lost three pieces to throttling and the agent then said the
 * call "does not mention" what was in them (found testing Sep 30). Silence
 * ("(no speech)") is silence, not a failure.
 */
async function transcribe(file: string, dir: string, notes: string[]): Promise<TimedLine[]> {
  const out = path.join(dir, "speech_%03d.mp3");
  const cut = await ffmpeg(["-y", "-i", file, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "32k",
    "-f", "segment", "-segment_time", String(AUDIO_PIECE_SECONDS), "-reset_timestamps", "1", out]);
  const files = (await readdir(dir)).filter((f) => /^speech_\d{3}\.mp3$/.test(f)).sort();
  if (!cut.ok || !files.length) {
    notes.push(/missing/.test(cut.stderr) ? "The audio could not be opened on this server (ffmpeg is missing)." : "The sound could not be read from this file.");
    return [];
  }
  const readPiece = async (name: string, index: number): Promise<TimedLine[] | null> => {
    try {
      const raw = await gemini([inline("audio/mpeg", await readFile(path.join(dir, name))), { text: TRANSCRIBE }], 8192);
      if (!raw.trim()) return null;
      return /^\(no speech\)$/i.test(raw.trim()) ? [] : timedLines(raw, index * AUDIO_PIECE_SECONDS);
    } catch {
      return null;
    }
  };
  const first = await inParallel(files, PARALLEL, readPiece);
  for (const [index, lines] of first.entries()) {
    if (lines !== null) continue;
    await new Promise((s) => setTimeout(s, 15_000));
    let again = await readPiece(files[index], index);
    if (again === null) {
      const whispered = await whisperPiece(await readFile(path.join(dir, files[index])));
      again = whispered ? whispered.map((l) => ({ at: l.at + index * AUDIO_PIECE_SECONDS, text: l.text })) : null;
    }
    if (again === null) notes.push(`Minutes ${stamp(index * AUDIO_PIECE_SECONDS)} to ${stamp((index + 1) * AUDIO_PIECE_SECONDS)} could not be transcribed.`);
    first[index] = again ?? [];
  }
  return first.flat() as TimedLine[];
}

/* ---------------------------------------------------------------- frames */

const ON_SCREEN = "These are frames from a video, each labelled with its time. For every frame that shows something new, write one line " +
  "starting with its [mm:ss] label, then every word, number and label visible on screen, exactly as shown, and a short description of any chart, " +
  "table, diagram, person or scene (with the values a chart or table shows). Skip frames that only repeat the previous one. No other text.";

/** The picture at one moment: ffmpeg jumps there and decodes only from the keyframe before it. */
async function frameAt(file: string, at: number, out: string): Promise<boolean> {
  const run = await ffmpeg(["-y", "-ss", String(at), "-i", file, "-frames:v", "1", "-vf", "scale='min(960,iw)':-2", "-q:v", "5", out], 120_000);
  return run.ok && existsSync(out);
}

async function screenReading(file: string, dir: string, seconds: number | null, notes: string[]): Promise<TimedLine[]> {
  // About ninety looks through any recording, never closer than 4s or further apart than 30s.
  const every = Math.min(30, Math.max(4, Math.round((seconds ?? 600) / 90)));
  /* Jump to each moment rather than decode every frame. Decoding a 2-minute
     4K phone clip whole took 142s on one core and jumping took 5s; a 10-minute
     one would have run past the server's patience (measured Oct 1). */
  let frames: { name: string; at: number }[] = [];
  if (seconds) {
    const times = Array.from({ length: Math.max(1, Math.ceil(seconds / every)) }, (_, i) => i * every);
    const got = await inParallel(times, 2, async (at, i) => {
      const name = `frame_${String(i + 1).padStart(5, "0")}.jpg`;
      return (await frameAt(file, at, path.join(dir, name))) ? { name, at } : null;
    });
    frames = got.filter((f): f is { name: string; at: number } => f !== null);
  }
  if (!frames.length) {
    // No length to jump by (a browser recording often has none), or jumping failed: decode it straight through.
    const run = await ffmpeg(["-y", "-i", file, "-vf", `fps=1/${every},scale='min(960,iw)':-2`, "-q:v", "5", path.join(dir, "frame_%05d.jpg")]);
    frames = (await readdir(dir)).filter((f) => /^frame_\d{5}\.jpg$/.test(f)).sort().map((name, i) => ({ name, at: i * every }));
    if (!run.ok || !frames.length) {
      notes.push("The picture could not be read from this video.");
      return [];
    }
  }
  /* Slides and screen shares hold still: keep a frame when it changed, and at
     least once a minute regardless. "Changed" counts pixels that moved sharply:
     an average over the whole frame called two text slides with the same
     layout identical and dropped three slides of a training video, with the
     deadline on one of them (found testing Sep 30). */
  const { default: sharp } = await import("sharp");
  const kept: { at: number; bytes: Buffer }[] = [];
  let last: Buffer | null = null;
  let lastAt = -Infinity;
  for (const { name, at } of frames) {
    const bytes = await readFile(path.join(dir, name));
    const thumb = await sharp(bytes).resize(160, 90, { fit: "fill" }).greyscale().raw().toBuffer();
    let changed = 1;
    if (last) {
      let moved = 0;
      for (let k = 0; k < thumb.length; k++) if (Math.abs(thumb[k] - last[k]) > 48) moved++;
      changed = moved / thumb.length;
    }
    if (changed > 0.004 || at - lastAt >= 60) {
      kept.push({ at, bytes });
      last = thumb;
      lastAt = at;
    }
  }
  const batches: { at: number; bytes: Buffer }[][] = [];
  for (let i = 0; i < kept.length; i += 16) batches.push(kept.slice(i, i + 16));
  const results = await inParallel(batches, PARALLEL, async (batch) => {
    const parts: VertexReadPart[] = [];
    for (const frame of batch) parts.push({ text: `[${stamp(frame.at)}]` }, inline("image/jpeg", frame.bytes));
    parts.push({ text: ON_SCREEN });
    try {
      return timedLines(await gemini(parts, 6000), 0);
    } catch {
      notes.push(`What was on screen around ${stamp(batch[0].at)} could not be read.`);
      return [];
    }
  });
  return results.flat().map((l) => ({ at: l.at, text: `On screen: ${l.text}` }));
}

/* ---------------------------------------------------------------- documents */

const PAGE_RULES = "then all of its text exactly as written (keep tables as rows with | between cells), then for every chart, picture, " +
  "diagram, stamp, signature or handwriting, what it shows including every number and label. Do not summarise or skip pages.";
const READ_PAGES = (from: number, to: number, total: number) =>
  `This PDF holds ${from === to ? `page ${from}` : `pages ${from} to ${to}`} of a ${total}-page document. For each page write a line ` +
  `"--- Page N ---" with its page number in the whole document (the first page here is page ${from}), ${PAGE_RULES}`;
const READ_EVERY_PAGE = `Read every page of this document. For each page write a line "--- Page N ---", ${PAGE_RULES}`;

/** Pages per read: a scanned page can be a megabyte, and ten dense pages is about what one answer holds. */
const PDF_PIECE_PAGES = 10;
const PDF_MAX_PAGES = 150;
/** Writing out a long document is what takes the time (120 typed pages: 4 minutes three at a time), so more pieces run at once. */
const PDF_PARALLEL = 6;

type PdfSplit = { total: number; make: (from: number, to: number) => Promise<Buffer> };

/**
 * A PDF opened so any run of its pages can be cut out as its own small PDF.
 * Only the typed text of a PDF over 14MB used to be read, so a 40MB scanned
 * contract came back as "nothing could be read" (found Oct 1). null when it
 * will not open this way (a password, damage); the caller then sends it whole.
 */
async function splitPdf(buf: Buffer): Promise<PdfSplit | null> {
  try {
    const { PDFDocument } = await import("pdf-lib");
    const source = await PDFDocument.load(buf, { updateMetadata: false, throwOnInvalidObject: false });
    const total = source.getPageCount();
    if (!total) return null;
    return {
      total,
      make: async (from, to) => {
        const piece = await PDFDocument.create({ updateMetadata: false });
        const pages = await piece.copyPages(source, Array.from({ length: to - from + 1 }, (_, i) => from - 1 + i));
        pages.forEach((page) => piece.addPage(page));
        return Buffer.from(await piece.save());
      },
    };
  } catch {
    return null;
  }
}

/**
 * Pages from..to, read by Gemini. A piece over the inline limit, or one whose
 * reading ran past the answer's length, is halved and each half read; a page
 * that still cannot be read is named in the notes, so the agent never says it
 * holds nothing.
 */
async function readPdfPages(split: PdfSplit, from: number, to: number, notes: string[], whole?: Buffer): Promise<string> {
  const halves = async () => {
    const mid = Math.floor((from + to) / 2);
    return [await readPdfPages(split, from, mid, notes), await readPdfPages(split, mid + 1, to, notes)].filter(Boolean).join("\n\n");
  };
  let bytes: Buffer;
  try {
    bytes = whole ?? (await split.make(from, to));
  } catch {
    notes.push(`Pages ${from} to ${to} could not be cut out to read.`);
    return "";
  }
  if (bytes.length > INLINE_MAX) {
    if (to > from) return halves();
    notes.push(`Page ${from} is too large a picture to read.`);
    return "";
  }
  try {
    const { text, cutOff } = await geminiRead([inline("application/pdf", bytes), { text: READ_PAGES(from, to, split.total) }], 30_000, 300_000);
    if (cutOff && to > from) return halves();
    if (cutOff) notes.push(`Page ${from} was too long to read in full.`);
    if (!text) notes.push(from === to ? `Page ${from} could not be read.` : `Pages ${from} to ${to} could not be read.`);
    return text;
  } catch {
    notes.push(from === to ? `Page ${from} could not be read.` : `Pages ${from} to ${to} could not be read.`);
    return "";
  }
}

/** Pages in a PDF, from its page objects; null when they are packed where a regex cannot see. */
function pdfPageCount(buf: Buffer): number | null {
  const text = buf.toString("latin1");
  const count = (text.match(/\/Type\s*\/Page(?![a-zA-Z])/g) ?? []).length;
  return count || null;
}

async function readPdf(buf: Buffer, name: string, notes: string[], readBy: string[]): Promise<{ text: string; pages?: number }> {
  const raw = buf.toString("latin1");
  const locked = /\/Encrypt\b/.test(raw);
  let pages = pdfPageCount(buf) ?? undefined;
  const local = extractFileContent(buf, `${name.replace(/\.[^.]+$/, "")}.pdf`).text;
  if (!raw.includes("%%EOF")) notes.push("This PDF looks cut short or damaged; only what could be read is below.");
  if (isVertexConfigured()) {
    let text = "";
    const split = await splitPdf(buf);
    if (split) {
      pages = split.total;
      const last = Math.min(split.total, PDF_MAX_PAGES);
      const ranges: [number, number][] = [];
      for (let from = 1; from <= last; from += PDF_PIECE_PAGES) ranges.push([from, Math.min(last, from + PDF_PIECE_PAGES - 1)]);
      // A short, small PDF goes exactly as it came; anything else in pieces of its own pages.
      const whole = split.total <= PDF_PIECE_PAGES && buf.length <= INLINE_MAX ? buf : undefined;
      text = (await inParallel(ranges, PDF_PARALLEL, ([from, to]) => readPdfPages(split, from, to, notes, whole))).filter(Boolean).join("\n\n");
      if (split.total > PDF_MAX_PAGES) notes.push(`Only the first ${PDF_MAX_PAGES} of ${split.total} pages were read closely; the rest is its plain text.`);
    } else if (buf.length <= INLINE_MAX) {
      text = await gemini([inline("application/pdf", buf), { text: READ_EVERY_PAGE }], 30_000).catch(() => "");
    } else {
      notes.push(`This PDF is ${Math.round(buf.length / 1048576)}MB and would not open to be read page by page, so its pictures and scanned pages were not read; only its typed text is below.`);
    }
    if (text) {
      readBy.push("gemini");
      return { text: pages && pages > PDF_MAX_PAGES && local ? `${text}\n\n${local}` : text, pages };
    }
  }
  if (local) {
    readBy.push("text");
    return { text: local, pages };
  }
  notes.push(locked ? "This PDF is password protected. Send a copy without the password." : "Nothing could be read from this PDF.");
  return { text: "", pages };
}

const DESCRIBE_IMAGE = "Read this image for a sales team. Transcribe every word, number and label in it exactly (keep tables as rows with | between cells). " +
  "If it is a chart, give each value it shows. If it is a photo, say what it shows. Do not guess at anything you cannot read.";

async function readImage(buf: Buffer, name: string, mime: string, notes: string[], readBy: string[]): Promise<string> {
  if (!isVertexConfigured()) {
    notes.push("Pictures cannot be read on this server.");
    return "";
  }
  let bytes = buf;
  let type = mime.startsWith("image/") ? mime : EXT_MIME[extOf(name)] ?? "image/jpeg";
  // A phone photo can be 12MB; 2048px is plenty to read a whiteboard. HEIC goes as it is.
  if (!/heic|heif/.test(type)) {
    try {
      const { default: sharp } = await import("sharp");
      bytes = await sharp(buf).rotate().resize(2048, 2048, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
      type = "image/jpeg";
    } catch {
      // Unusual formats go as they are; Gemini reads more than sharp writes.
    }
  }
  if (bytes.length > INLINE_MAX) {
    notes.push("This picture is too large to read.");
    return "";
  }
  try {
    const text = await gemini([inline(type, bytes), { text: DESCRIBE_IMAGE }], 4000);
    if (text) readBy.push("gemini");
    return text;
  } catch {
    notes.push("This picture could not be read.");
    return "";
  }
}

/**
 * A deck's words, slide by slide, with each slide's OWN speaker notes. Notes
 * files are numbered in the order they were made, not by slide, so "notes 1"
 * can belong to slide 2; the agent said "speaker notes on slide 1" about notes
 * that sat on slide 2 until each was mapped through its slide (Sep 30).
 */
const unescapeXml = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

const xmlWords = (xml: string) =>
  unescapeXml(xml.replace(/<\/a:p>/g, "\n").replace(/<a:br\b[^>]*\/?>/g, "\n").replace(/<[^>]+>/g, ""))
    .split("\n").map((l) => l.trim()).filter(Boolean).join("\n");

/**
 * A chart drawn in PowerPoint or Word, from the values the file keeps with it.
 * It is not a picture, so neither the slide's words nor a look at its pictures
 * ever saw its numbers.
 */
export function chartText(xml: string): string {
  const head = xml.split(/<c:plotArea\b/)[0];
  const title = /<c:title>([\s\S]*?)<\/c:title>/.exec(head);
  const type = /<c:(\w+?)(?:3D)?Chart>/.exec(xml)?.[1];
  const points = (part: string | undefined) => {
    const out = new Map<number, string>();
    for (const m of (part ?? "").matchAll(/<c:pt idx="(\d+)"[^>]*>\s*<c:v>([^<]*)<\/c:v>/g)) if (!out.has(Number(m[1]))) out.set(Number(m[1]), unescapeXml(m[2]));
    return out;
  };
  const series: string[] = [];
  for (const [, ser] of xml.matchAll(/<c:ser>([\s\S]*?)<\/c:ser>/g)) {
    const name = /<c:v>([^<]*)<\/c:v>/.exec(/<c:tx>([\s\S]*?)<\/c:tx>/.exec(ser)?.[1] ?? "")?.[1];
    const cats = points(/<c:(?:cat|xVal)>([\s\S]*?)<\/c:(?:cat|xVal)>/.exec(ser)?.[1]);
    const valPart = /<c:(?:val|yVal)>([\s\S]*?)<\/c:(?:val|yVal)>/.exec(ser)?.[1];
    const percent = /<c:formatCode>[^<]*%[^<]*<\/c:formatCode>/.test(valPart ?? "");
    const shown = [...points(valPart)].sort((a, b) => a[0] - b[0]).map(([idx, v]) => {
      const n = Number(v);
      const value = !Number.isFinite(n) ? v : percent ? `${Math.round(n * 1000) / 10}%` : n.toLocaleString("en-US", { maximumFractionDigits: 2 });
      return cats.has(idx) ? `${cats.get(idx)} ${value}` : value;
    });
    if (shown.length) series.push(`${name ? `${unescapeXml(name)}: ` : ""}${shown.join(", ")}`);
  }
  if (!series.length) return "";
  const label = title ? xmlWords(title[1]).replace(/\n/g, " ") : "";
  return `Chart${label ? ` "${label}"` : ""}${type ? ` (${type})` : ""}: ${series.join("; ")}`;
}

/** A SmartArt diagram's words, in order. */
const diagramText = (xml: string) => {
  const words = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => unescapeXml(m[1]).trim()).filter(Boolean);
  return words.length ? `Diagram: ${words.join(" / ")}` : "";
};

/** Charts and diagrams a slide or document points to, through its relationships file. */
async function linkedParts(zip: JSZip, rels: string | undefined, folder: string): Promise<string[]> {
  const out: string[] = [];
  for (const m of (rels ?? "").matchAll(/Target="(?:\.\.\/)?((?:charts\/chart|diagrams\/data)\d+\.xml)"/g)) {
    const xml = await zip.file(`${folder}${m[1]}`)?.async("string");
    const text = xml ? (m[1].startsWith("charts/") ? chartText(xml) : diagramText(xml)) : "";
    if (text) out.push(text);
  }
  return out;
}

async function deckText(buf: Buffer): Promise<string> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(buf).catch(() => null);
  if (!zip) return "";
  const slides = Object.keys(zip.files)
    .map((n) => /^ppt\/slides\/slide(\d+)\.xml$/.exec(n))
    .filter((m): m is RegExpExecArray => Boolean(m))
    .sort((a, b) => Number(a[1]) - Number(b[1]));
  const out: string[] = [];
  for (const [index, m] of slides.entries()) {
    const body = xmlWords(await zip.file(m[0])!.async("string"));
    const rels = await zip.file(`ppt/slides/_rels/slide${m[1]}.xml.rels`)?.async("string");
    const notesFile = rels ? /Target="\.\.\/notesSlides\/(notesSlide\d+\.xml)"/.exec(rels)?.[1] : undefined;
    const notes = notesFile ? xmlWords(await zip.file(`ppt/notesSlides/${notesFile}`)?.async("string") ?? "").replace(/^\d+$/gm, "").trim() : "";
    const drawn = await linkedParts(zip, rels, "ppt/");
    if (body || notes || drawn.length) {
      out.push(`Slide ${index + 1}: ${body}${drawn.map((d) => `\nSlide ${index + 1} ${d}`).join("")}${notes ? `\nSlide ${index + 1} speaker notes: ${notes}` : ""}`);
    }
  }
  return out.join("\n\n");
}

/** A Word file's charts and diagrams, in the order the document links them. */
async function wordDrawings(buf: Buffer): Promise<string> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(buf).catch(() => null);
  if (!zip) return "";
  return (await linkedParts(zip, await zip.file("word/_rels/document.xml.rels")?.async("string"), "word/")).join("\n");
}

const MAX_OFFICE_PICTURES = 40;

/** Pictures stored inside an Office file, read as images (a chart pasted into a slide is only a picture). */
async function officePictures(buf: Buffer, kind: "word" | "slides", notes: string[], readBy: string[]): Promise<string> {
  if (!isVertexConfigured()) return "";
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(buf).catch(() => null);
  if (!zip) return "";
  const folder = kind === "slides" ? "ppt/media/" : "word/media/";
  // Which slide each picture sits on, from the slide's own relationships.
  const where = new Map<string, number>();
  if (kind === "slides") {
    for (const rel of Object.keys(zip.files).filter((n) => /^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/.test(n))) {
      const slide = Number(/slide(\d+)\.xml\.rels$/.exec(rel)?.[1]);
      const xml = await zip.file(rel)!.async("string");
      for (const m of xml.matchAll(/Target="\.\.\/media\/([^"]+)"/g)) if (!where.has(m[1])) where.set(m[1], slide);
    }
  }
  /* In slide order (then by number: image10 after image9), and up to 40: a
     deck exported from a design tool is often a picture per slide, and the
     first 12 in the zip were neither all of it nor the first 12 slides. */
  const number = (n: string) => Number(/(\d+)\.\w+$/.exec(n)?.[1] ?? 0);
  const media = Object.keys(zip.files)
    .filter((n) => n.startsWith(folder) && /\.(png|jpe?g|gif|webp|bmp)$/i.test(n))
    .sort((a, b) => (where.get(path.basename(a)) ?? 1e6) - (where.get(path.basename(b)) ?? 1e6) || number(a) - number(b))
    .slice(0, MAX_OFFICE_PICTURES);
  const lines = await inParallel(media, PARALLEL, async (file) => {
    const bytes = Buffer.from(await zip.file(file)!.async("uint8array"));
    if (bytes.length < 4000) return ""; // bullets, logos and lines
    const label = kind === "slides" && where.get(path.basename(file)) ? `Picture on slide ${where.get(path.basename(file))}` : `Picture ${path.basename(file)}`;
    const text = await readImage(bytes, file, "", [], []).catch(() => "");
    return text ? `${label}: ${text}` : "";
  });
  const found = lines.filter(Boolean);
  if (found.length) readBy.push("gemini");
  const pictures = Object.keys(zip.files).filter((n) => n.startsWith(folder) && /\.(png|jpe?g|gif|webp|bmp)$/i.test(n)).length;
  if (pictures > MAX_OFFICE_PICTURES) notes.push(`Only the first ${MAX_OFFICE_PICTURES} of ${pictures} pictures in this file were read.`);
  return found.join("\n\n");
}

async function readSheet(buf: Buffer, name: string, notes: string[]): Promise<string> {
  const XLSX = await import("xlsx");
  const ext = extOf(name);
  const book = ext === "csv" || ext === "tsv"
    ? XLSX.read(buf.toString("utf8"), { type: "string", ...(ext === "tsv" ? { FS: "\t" } : {}) })
    : XLSX.read(buf, { type: "buffer", cellFormula: true, cellDates: true, sheetStubs: true });
  const parts: string[] = [];
  for (const sheetName of book.SheetNames) {
    const sheet = book.Sheets[sheetName];
    if (!sheet["!ref"]) continue;
    const range = XLSX.utils.decode_range(sheet["!ref"]);
    const rows: string[] = [];
    for (let r = range.s.r; r <= range.e.r && rows.length < 5000; r++) {
      const cells: string[] = [];
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })];
        // A formula saved without its result (a stub, "z") still says what it adds up; its 0 is not a result.
        if (!cell) cells.push("");
        else if (cell.t === "z") cells.push(cell.f ? `=${cell.f}` : "");
        else cells.push(String(cell.w ?? cell.v ?? ""));
      }
      if (cells.some((x) => x.trim())) rows.push(cells.join(" | "));
    }
    if (range.e.r - range.s.r + 1 > 5000) notes.push(`Sheet "${sheetName}" has more than 5,000 rows; the first 5,000 are below.`);
    parts.push(`Sheet: ${sheetName}\n${rows.join("\n")}`);
  }
  return parts.join("\n\n");
}

async function readArchive(buf: Buffer, name: string, depth: number, notes: string[], readBy: string[]): Promise<string> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(buf).catch(() => null);
  if (!zip) {
    notes.push("This archive could not be opened.");
    return "";
  }
  const members = Object.values(zip.files).filter((f) => !f.dir && !/(^|\/)(__MACOSX|\.DS_Store)/.test(f.name));
  const listed = `Files inside ${name}:\n${members.map((f) => `- ${f.name}`).join("\n")}`;
  if (depth >= 1) return listed;
  const read = await inParallel(members.slice(0, 10), 2, async (member) => {
    const bytes = Buffer.from(await member.async("uint8array"));
    if (bytes.length > 50 * 1024 * 1024) return `--- ${member.name} ---\n(too large to open inside an archive)`;
    const inner = await readFileForAgentInternal({ bytes, name: path.basename(member.name) }, depth + 1);
    inner.readBy.forEach((r) => readBy.includes(r) || readBy.push(r));
    return `--- ${member.name} (${inner.kind}) ---\n${inner.text || inner.notes.join(" ") || "(nothing readable)"}`;
  });
  if (members.length > 10) notes.push(`Only the first 10 of ${members.length} files in this archive were opened.`);
  return `${listed}\n\n${read.join("\n\n")}`;
}

type Mail = { from?: string; to?: string; cc?: string; date?: string; subject?: string; body: string; attachments: { name: string; bytes: Buffer; inline: boolean }[] };

const person = (name?: string, address?: string) => (name && address && name !== address ? `${name} <${address}>` : name || address || "");

/** An Outlook .msg: a compound file of message properties, read by msgreader. */
async function outlookMail(buf: Buffer): Promise<Mail> {
  const { default: MsgReader } = await import("@kenjiuno/msgreader");
  const reader = new MsgReader(new DataView(buf.buffer, buf.byteOffset, buf.byteLength));
  const data = reader.getFileData();
  if (data.error) throw new Error(data.error);
  const people = (type: "to" | "cc") =>
    (data.recipients ?? []).filter((r) => (r.recipType ?? "to") === type).map((r) => person(r.name, r.smtpAddress ?? r.email)).filter(Boolean).join(", ");
  const attachments: Mail["attachments"] = [];
  for (const a of (data.attachments ?? []).slice(0, 12)) {
    try {
      const got = reader.getAttachment(a);
      if (got?.content?.length) attachments.push({ name: got.fileName || a.fileName || "attachment", bytes: Buffer.from(got.content), inline: Boolean(a.attachmentHidden || a.pidContentId) });
    } catch {
      // One unreadable attachment never loses the email itself.
    }
  }
  return {
    from: person(data.senderName, data.senderSmtpAddress ?? data.senderEmail),
    to: people("to"),
    cc: people("cc"),
    date: data.messageDeliveryTime ?? data.clientSubmitTime,
    subject: data.subject,
    body: data.body || (data.bodyHtml ? extractFileContent(Buffer.from(data.bodyHtml), "body.html").text : ""),
    attachments,
  };
}

/** A saved .eml (MIME), read by postal-mime: every charset and encoding, nested parts and attachments. */
async function mimeMail(buf: Buffer): Promise<Mail> {
  const { default: PostalMime } = await import("postal-mime");
  const mail = await PostalMime.parse(buf);
  const one = (a: { name: string; address?: string; group?: { name: string; address: string }[] } | undefined): string =>
    !a ? "" : a.group ? a.group.map((m) => person(m.name, m.address)).join(", ") : person(a.name, a.address);
  return {
    from: one(mail.from),
    to: (mail.to ?? []).map(one).filter(Boolean).join(", "),
    cc: (mail.cc ?? []).map(one).filter(Boolean).join(", "),
    date: mail.date,
    subject: mail.subject,
    body: mail.text || (mail.html ? extractFileContent(Buffer.from(mail.html), "body.html").text : ""),
    attachments: mail.attachments.slice(0, 12).map((a) => ({
      name: a.filename || `attachment.${a.mimeType.split("/").pop() || "bin"}`,
      bytes: typeof a.content === "string" ? Buffer.from(a.content) : Buffer.from(a.content instanceof ArrayBuffer ? new Uint8Array(a.content) : a.content),
      inline: Boolean(a.related || a.contentId) && a.mimeType.startsWith("image/"),
    })),
  };
}

/**
 * An email forwarded or saved as a file (Outlook .msg, or .eml): who wrote to
 * whom and when, what it says, and each attachment read like any other file.
 * A sales team's most common file after decks and PDFs, and the agent used to
 * answer "cannot open" (Oct 1).
 */
async function readEmail(buf: Buffer, name: string, depth: number, notes: string[], readBy: string[]): Promise<string> {
  let mail: Mail;
  try {
    mail = extOf(name) === "msg" || buf.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0])) ? await outlookMail(buf) : await mimeMail(buf);
  } catch {
    notes.push("This email could not be opened.");
    return "";
  }
  const head = [
    mail.from && `From: ${mail.from}`,
    mail.to && `To: ${mail.to}`,
    mail.cc && `Cc: ${mail.cc}`,
    mail.date && `Date: ${mail.date}`,
    mail.subject && `Subject: ${mail.subject}`,
  ].filter(Boolean).join("\n");
  readBy.push("text");
  // Signature logos and pasted-in icons are pictures inside the message, not attachments anyone sent.
  const sent = mail.attachments.filter((a) => !(a.inline && a.bytes.length < 60_000));
  const listed = sent.length ? `\n\nAttachments: ${sent.map((a) => a.name).join(", ")}` : "";
  if (depth >= 1 || !sent.length) return `${head}\n\n${mail.body.trim()}${listed}`;
  const read = await inParallel(sent.slice(0, 10), 2, async (a) => {
    if (a.bytes.length > 50 * 1024 * 1024) return `--- Attachment: ${a.name} ---\n(too large to open inside an email)`;
    const inner = await readFileForAgentInternal({ bytes: a.bytes, name: a.name }, depth + 1);
    inner.readBy.forEach((r) => readBy.includes(r) || readBy.push(r));
    return `--- Attachment: ${a.name} (${inner.kind}) ---\n${inner.text || inner.notes.join(" ") || "(nothing readable)"}`;
  });
  if (sent.length > 10) notes.push(`Only the first 10 of ${sent.length} attachments were opened.`);
  return `${head}\n\n${mail.body.trim()}${listed}\n\n${read.join("\n\n")}`;
}

/* ---------------------------------------------------------------- the whole file */

const SUMMARISE = "Summarise this file for a sales team in three to five plain sentences: what it is, who and what it is about, " +
  "the numbers, dates and decisions that matter, and any next steps. Use only what is in it.";

async function summarise(kind: FileKind, text: string): Promise<string> {
  if (!text.trim() || !isVertexConfigured()) return "";
  try {
    return withoutProseDashes(await gemini([{ text: `${SUMMARISE}\n\nFILE (${kind}):\n${text.slice(0, 200_000)}` }], 600));
  } catch {
    return "";
  }
}

/** Past this a document is not loaded into memory to be read (recordings stream from disk at any size). */
const MAX_DOCUMENT_BYTES = 200 * 1024 * 1024;

/**
 * Read a file given as bytes, or as a path on disk for a big upload. A
 * recording is read straight from disk, so a long phone video never has to fit
 * in memory; anything else is loaded (up to 200MB).
 */
export async function readFileForAgent(input: { bytes?: Buffer; filePath?: string; name: string; mime?: string }): Promise<FileReading> {
  if (input.bytes) return readFileForAgentInternal({ bytes: input.bytes, name: input.name, mime: input.mime }, 0);
  if (!input.filePath) throw new Error("readFileForAgent needs bytes or a filePath");
  const size = (await stat(input.filePath)).size;
  const handle = await open(input.filePath, "r");
  const head = Buffer.alloc(16);
  await handle.read(head, 0, 16, 0).finally(() => handle.close());
  const kind = fileKind(input.name, head, input.mime ?? "");
  if (kind === "audio" || kind === "video") {
    return readFileForAgentInternal({ bytes: Buffer.alloc(0), name: input.name, mime: input.mime, filePath: input.filePath, size }, 0);
  }
  if (size > MAX_DOCUMENT_BYTES) {
    return { kind, name: input.name, mime: input.mime || EXT_MIME[extOf(input.name)] || "application/octet-stream", bytes: size, text: "", summary: "", notes: [`This file is ${Math.round(size / 1048576)}MB, too large to read. Send a smaller copy or the part that matters.`], readBy: [] };
  }
  return readFileForAgentInternal({ bytes: await readFile(input.filePath), name: input.name, mime: input.mime }, 0);
}

async function readFileForAgentInternal(
  input: { bytes: Buffer; name: string; mime?: string; filePath?: string; size?: number },
  depth: number,
): Promise<FileReading> {
  const { bytes, name } = input;
  const kind = input.filePath ? fileKind(name, Buffer.alloc(0), input.mime ?? "") : fileKind(name, bytes.subarray(0, 16), input.mime ?? "");
  const mime = input.mime || EXT_MIME[extOf(name)] || "application/octet-stream";
  const notes: string[] = [];
  const readBy: string[] = [];
  const size = input.size ?? bytes.length;
  const base: FileReading = { kind, name, mime, bytes: size, text: "", summary: "", notes, readBy };
  if (!size) {
    notes.push("This file is empty.");
    return base;
  }
  let text = "";
  let pages: number | undefined;
  let durationSeconds: number | undefined;
  try {
    if (kind === "pdf") {
      const read = await readPdf(bytes, name, notes, readBy);
      text = read.text;
      pages = read.pages;
    } else if (kind === "image") {
      text = await readImage(bytes, name, input.mime ?? "", notes, readBy);
    } else if (kind === "word" || kind === "slides") {
      const own = extOf(name) === "pptx"
        ? await deckText(bytes)
        : extOf(name) === "docx" ? [extractFileContent(bytes, name).text, await wordDrawings(bytes)].filter(Boolean).join("\n\n") : "";
      if (own) readBy.push("text");
      const pictures = ["docx", "pptx"].includes(extOf(name)) ? await officePictures(bytes, kind, notes, readBy) : "";
      if (!["docx", "pptx"].includes(extOf(name))) notes.push(`The older .${extOf(name)} format cannot be opened here. Save it as .${kind === "word" ? "docx" : "pptx"} and send it again.`);
      text = [own, pictures].filter(Boolean).join("\n\n");
    } else if (kind === "sheet") {
      text = await readSheet(bytes, name, notes);
      if (text) readBy.push("text");
    } else if (kind === "text") {
      text = extractFileContent(bytes, /\.(txt|md|markdown|csv|tsv|json|xml|html?|rtf|log|yml|yaml)$/i.test(name) ? name : `${name}.txt`).text || bytes.toString("utf8");
      if (extOf(name) === "json") {
        try {
          text = JSON.stringify(JSON.parse(bytes.toString("utf8")), null, 1);
        } catch {
          // Not valid JSON: the raw text is still the best reading.
        }
      }
      if (text) readBy.push("text");
    } else if (kind === "archive") {
      text = await readArchive(bytes, name, depth, notes, readBy);
    } else if (kind === "email") {
      text = await readEmail(bytes, name, depth, notes, readBy);
    } else if (kind === "audio" || kind === "video") {
      const dir = await mkdtemp(path.join(tmpdir(), "agent-file-"));
      try {
        let file = input.filePath ?? "";
        if (!file) {
          file = path.join(dir, `input.${extOf(name) || (kind === "video" ? "mp4" : "mp3")}`);
          await writeFile(file, bytes);
        }
        const info = await probe(file);
        durationSeconds = info.seconds ?? undefined;
        if (!isVertexConfigured()) notes.push("Recordings cannot be transcribed on this server.");
        const [speech, screen] = await Promise.all([
          info.audio && isVertexConfigured() ? transcribe(file, dir, notes) : Promise.resolve([] as TimedLine[]),
          info.video && kind === "video" && isVertexConfigured() ? screenReading(file, dir, durationSeconds ?? null, notes) : Promise.resolve([] as TimedLine[]),
        ]);
        if (!info.audio) notes.push(kind === "video" ? "This video has no sound, so there is nothing to transcribe." : "No sound could be found in this file.");
        else if (!speech.length) notes.push("Nobody could be heard speaking in this recording.");
        if (speech.length) readBy.push("transcript");
        if (screen.length) readBy.push("frames");
        text = [...speech, ...screen].sort((a, b) => a.at - b.at).map((l) => `[${stamp(l.at)}] ${l.text}`).join("\n");
      } finally {
        await rm(dir, { recursive: true, force: true }).catch(() => undefined);
      }
    } else {
      notes.push(`This is a .${extOf(name) || "unknown"} file, which the agent cannot open. Send it as a PDF, an Office file, an email, a picture, a recording or text.`);
    }
  } catch (error) {
    notes.push(`Reading stopped part way: ${error instanceof Error ? error.message.slice(0, 160) : "unknown error"}.`);
  }
  text = text.replace(/\u0000/g, "").trim();
  if (text.length > MAX_TEXT) {
    text = `${text.slice(0, MAX_TEXT)}\n…`;
    notes.push("This file is very long; only the first part was kept.");
  }
  const summary = depth === 0 ? await summarise(kind, text) : "";
  return { ...base, text, summary, ...(pages ? { pages } : {}), ...(durationSeconds ? { durationSeconds } : {}) };
}
