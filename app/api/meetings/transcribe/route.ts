import { NextResponse, type NextRequest } from "next/server";
import { getRole } from "@/lib/role";
import { canAccessModule } from "@/lib/moduleAccess";
import { speechToText, isTranscribableFile } from "@/lib/videoTranscribe";
import { extractFileText, isReadableFile } from "@/lib/fileText";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * A TRANSCRIPT YOU DO NOT HAVE TO TYPE.
 *
 * Suren, Aug 28, looking at the Transcript tab on a meeting: "what is this?
 * This should be like an upload thing, or it should be an option at least."
 * It was a bare textarea — fine if somebody already has the text on a
 * clipboard, useless if what they have is the recording, which is what people
 * actually walk out of a call holding.
 *
 * So: hand it a file. A recording goes through the same Whisper path the
 * offering videos use and comes back as timestamped lines; a document goes
 * through the same reader the materials use and comes back as its words.
 * Either way the text lands in the box for the person to read and correct
 * BEFORE it is saved — nothing is written to the meeting by this route.
 */

/**
 * A SUBTITLE FILE IS A TRANSCRIPT SOMEBODY ALREADY MADE.
 *
 * Teams, Zoom and Meet all hand you a .vtt or .srt when a call is recorded,
 * which makes it the single most likely thing to be dropped on this box. It
 * was in the accept list and nothing could read it: the generic reader has no
 * case for either, so it came back empty and the box said "that file had no
 * readable text in it" about a file that is nothing but readable text.
 *
 * Both formats are the same three-part shape — an optional counter, a
 * `start --> end` line, then the words — so one parser handles both. The
 * timestamps are kept, in the same [m:ss] form the Whisper path produces, and
 * a caption repeated across consecutive cues (how rolling captions are
 * written) is only kept once.
 */
function fromSubtitles(raw: string): string {
  const lines = raw.replace(/\r/g, "").split("\n");
  const out: string[] = [];
  let stamp: string | null = null;
  let last = "";

  for (const line of lines) {
    const time = line.match(
      /^\s*(\d{1,2}:)?(\d{1,2}):(\d{2})[.,](\d{1,3})\s*-->/
    );
    if (time) {
      const h = time[1] ? parseInt(time[1], 10) : 0;
      stamp = clock(h * 3600 + parseInt(time[2], 10) * 60 + parseInt(time[3], 10));
      continue;
    }
    const text = line
      .replace(/<[^>]+>/g, "")
      .replace(/^\s*\d+\s*$/, "")
      .trim();
    if (!text || /^(WEBVTT|NOTE|STYLE|REGION)\b/.test(text)) continue;
    if (text === last) continue;
    last = text;
    out.push(stamp ? `[${stamp}] ${text}` : text);
    stamp = null;
  }
  return out.join("\n");
}

/** 3742 seconds reads as 1:02:22 — the shape a transcript is expected in. */
function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(rest).padStart(2, "0")}`;
}

export async function POST(req: NextRequest) {
  if (!canAccessModule("/meetings", await getRole()))
    return NextResponse.json(
      { error: "Not available on this account." },
      { status: 403 }
    );

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0)
    return NextResponse.json({ error: "No file came through." }, { status: 400 });

  const bytes = Buffer.from(await file.arrayBuffer());
  const name = file.name || "recording";

  try {
    if (/\.(vtt|srt|sbv)$/i.test(name)) {
      const text = fromSubtitles(bytes.toString("utf8"));
      if (!text)
        return NextResponse.json(
          { error: "That subtitle file had no captions in it." },
          { status: 422 }
        );
      return NextResponse.json({ ok: true, text, kind: "document" });
    }

    if (isTranscribableFile(name)) {
      const heard = await speechToText(bytes, name);
      if (!heard.ok)
        return NextResponse.json(
          {
            /* A refusal we caused ("no credit", "no ffmpeg") is worth
               retrying and says so; a silent file is not. */
            error: heard.blocked
              ? `That could not be transcribed right now: ${heard.reason}. The recording is fine — try again.`
              : `Nothing could be heard in that file: ${heard.reason}`,
            retryable: heard.blocked,
          },
          { status: heard.blocked ? 503 : 422 }
        );

      const text = heard.segments
        .map((s) => `[${clock(s.start)}] ${s.text.trim()}`)
        .filter((line) => line.length > 10)
        .join("\n");

      return NextResponse.json({
        ok: true,
        text,
        kind: "recording",
        minutes: Math.round(heard.duration / 60),
      });
    }

    if (isReadableFile(name)) {
      const text = extractFileText(bytes, name).trim();
      if (!text)
        /* SAY WHICH KIND OF EMPTY IT IS. "No readable text" about a PDF is a
           dead end; a PDF of scans has no text layer to read and the way out
           is to upload the recording or paste the words, which the message
           now says. */
        return NextResponse.json(
          {
            error: /\.pdf$/i.test(name)
              ? "That PDF is scanned images, so there are no words to pull out. Upload the recording instead, or paste the text."
              : `No text could be pulled out of ${name}. Upload the recording instead, or paste the text.`,
          },
          { status: 422 }
        );
      return NextResponse.json({ ok: true, text, kind: "document" });
    }

    return NextResponse.json(
      {
        error:
          `${name.split(".").pop()?.toUpperCase() || "That"} files cannot be read. Upload a recording (mp4, mov, m4a, mp3, wav), a captions file (vtt, srt) or a document (docx, pdf, txt).`,
      },
      { status: 415 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "That file could not be read.",
      },
      { status: 500 }
    );
  }
}
