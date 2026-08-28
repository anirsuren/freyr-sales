import "server-only";

import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * THERE IS NO FILE-SIZE CAP ON TRANSCRIPTION. Anir, Aug 14: "you can't cap it
 * at 25 MB. figure it out. no cap is mandatory."
 *
 * Whisper's endpoint rejects anything over 25MB, and a screen-recorded demo
 * passes that in about two minutes. So the video never goes to Whisper at all.
 * Two steps happen first, and between them they take the ceiling off:
 *
 *   1. THROW AWAY THE PICTURE. A transcript only needs the audio, and the
 *      audio is a rounding error next to the video: 16kHz mono MP3 at 32kbps
 *      is about 14MB per HOUR. A 2GB screen recording becomes a few MB.
 *
 *   2. SPLIT WHAT IS STILL TOO BIG. Past roughly 1.7 hours even the audio
 *      crosses 25MB, so it is cut into fixed-length parts, each transcribed on
 *      its own, and the text is joined back in order. There is no length at
 *      which this stops working; a longer recording is just more parts.
 *
 * ffmpeg comes from ffmpeg-static, a normal dependency, so it ships inside the
 * image and needs nothing installed on the host.
 */

/** Comfortably under Whisper's 25MB so a chunk never lands on the boundary. */
const CHUNK_TARGET_BYTES = 20 * 1024 * 1024;
/** 32kbps mono ≈ 14MB/hour, so this many seconds lands near the target. */
const CHUNK_SECONDS = 45 * 60;
/** A cut-off for a genuinely stuck ffmpeg, not a limit on the input. */
const FFMPEG_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * FINDING FFMPEG, WHICH IS HARDER THAN IT SOUNDS AND WAS THE WHOLE BUG.
 *
 * ffmpeg-static does not export a path; it COMPUTES one at load time from
 * `path.join(__dirname, "ffmpeg")`. Inside a Next server bundle `__dirname` is
 * the bundle's directory, not the package's, so the module cheerfully handed
 * back a path to a file that has never existed there. `Boolean(path)` was
 * true, ffmpeg was declared available, spawn failed, and the failure came back
 * as the indistinguishable "no audio could be extracted from this file" —
 * which the indexer then recorded as "this video has no readable text",
 * permanently, for every video anyone had ever uploaded.
 *
 * So: try the candidates in order and return the first that is REALLY THERE.
 * Never trust a computed path without looking at the disk.
 *
 *   1. FFMPEG_BIN — ffmpeg-static's own override, and the escape hatch if a
 *      host ever wants to point at a system build.
 *   2. Whatever the package computed, when it happens to be right (a plain
 *      `node` process, where __dirname is the package).
 *   3. node_modules, resolved from the working directory — the standalone
 *      server's own layout, and where outputFileTracingIncludes puts it.
 */
function ffmpegPath(): string | null {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("node:fs") as typeof import("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("node:path") as typeof import("node:path");

  const candidates: (string | null | undefined)[] = [process.env.FFMPEG_BIN];
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    candidates.push(require("ffmpeg-static") as string);
  } catch {
    // The package itself may not be bundled; the path below still finds it.
  }
  candidates.push(
    path.join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg")
  );

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      // An unreadable path is simply not the one.
    }
  }
  return null;
}

export function audioExtractionAvailable(): boolean {
  return Boolean(ffmpegPath());
}

/** The reason extraction cannot run, or null when it can. Callers use this to
 *  tell "our packaging is broken" from "this file has no sound in it". */
export function audioExtractionProblem(): string | null {
  return ffmpegPath()
    ? null
    : "the audio extractor (ffmpeg) is missing from this build";
}

function run(args: string[]): Promise<boolean> {
  const bin = ffmpegPath();
  if (!bin) return Promise.resolve(false);
  return new Promise((resolve) => {
    const child = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr?.on("data", (d) => {
      // Keep only the tail: ffmpeg is extremely chatty and only the last
      // lines say why it gave up.
      stderr = (stderr + d.toString()).slice(-2000);
    });
    const timer = setTimeout(() => child.kill("SIGKILL"), FFMPEG_TIMEOUT_MS);
    child.on("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) console.error(`[audio] ffmpeg exited ${code}: ${stderr}`);
      resolve(code === 0);
    });
  });
}

export type AudioPart = { name: string; bytes: Buffer };

/**
 * Video or audio in, one or more small MP3 parts out, in playing order.
 * Returns an empty array when ffmpeg is unavailable or the file has no audio,
 * which callers treat as "nothing to transcribe" rather than an error.
 */
export async function extractAudioParts(
  bytes: Buffer,
  filename: string
): Promise<AudioPart[]> {
  if (!ffmpegPath()) return [];
  const dir = await mkdtemp(join(tmpdir(), "freyr-audio-"));
  try {
    const ext = (filename.match(/\.[^.]+$/)?.[0] || ".bin").toLowerCase();
    const input = join(dir, `in${ext}`);
    await writeFile(input, bytes);

    // One pass: drop the video stream, downmix to mono, 16kHz, 32kbps. Those
    // are speech-recognition settings, not music ones, and Whisper resamples
    // to 16kHz anyway so nothing is lost that it would have used.
    const whole = join(dir, "audio.mp3");
    const ok = await run([
      "-hide_banner",
      "-loglevel", "error",
      "-i", input,
      "-vn",
      "-ac", "1",
      "-ar", "16000",
      "-b:a", "32k",
      "-y", whole,
    ]);
    if (!ok) return [];

    const audio = await readFile(whole).catch(() => null);
    if (!audio || audio.length === 0) return [];
    if (audio.length <= CHUNK_TARGET_BYTES)
      return [{ name: "audio.mp3", bytes: audio }];

    // Still too big, so cut it. -c copy keeps this cheap: the parts are just
    // slices of the MP3 that was already produced.
    const partPattern = join(dir, "part-%03d.mp3");
    const split = await run([
      "-hide_banner",
      "-loglevel", "error",
      "-i", whole,
      "-f", "segment",
      "-segment_time", String(CHUNK_SECONDS),
      "-c", "copy",
      "-y", partPattern,
    ]);
    if (!split) return [{ name: "audio.mp3", bytes: audio }];

    const names = (await readdir(dir))
      .filter((n) => /^part-\d+\.mp3$/.test(n))
      .sort();
    const parts: AudioPart[] = [];
    for (const name of names) {
      const buf = await readFile(join(dir, name)).catch(() => null);
      if (buf?.length) parts.push({ name, bytes: buf });
    }
    return parts.length ? parts : [{ name: "audio.mp3", bytes: audio }];
  } catch (error) {
    console.error("[audio] extraction failed:", error);
    return [];
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
