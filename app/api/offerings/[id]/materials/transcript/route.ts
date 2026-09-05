import { NextResponse } from "next/server";
import { getMaterialServeUrl } from "@/lib/materialStorage";
import { getOffering, initializeLiveOfferings } from "@/lib/offerings";
import { canEditOffering } from "@/lib/offeringOwnership";
import { docsStorage, hasDocsStorage } from "@/lib/docsStorage";
import {
  materialTextEntry,
  saveMaterialText,
  transcriptToText,
  type MaterialTranscript,
  type TranscriptSegment,
} from "@/lib/materialText";
import { getCurrentUser } from "@/lib/currentUser";
import {
  isTranscribableFile,
  transcribeMaterial,
  transcriptionConfigured,
} from "@/lib/videoTranscribe";

export const dynamic = "force-dynamic";
/** Whisper on a long recording is slow, and it is the whole point of the call. */
export const maxDuration = 300;

/**
 * THE TRANSCRIPT OF ONE RECORDING: read it, correct it, or ask for it again.
 *
 * Anir, Aug 28: "I should definitely be able to see the transcript for these
 * videos, and not only that, I should be able to edit it. Whoever uploaded it,
 * or admins, should be able to edit the video transcript."
 *
 * GET is open to anyone who can see the offering — reading a transcript is
 * reading the material, and the material is already on the page. POST (edit,
 * retry) needs the same ownership an upload does, which is exactly "whoever
 * uploaded it, or admins": canEditOffering is that rule, in one place.
 */

const MAX_TRANSCRIBE_BYTES = 2 * 1024 * 1024 * 1024;

async function resolve(id: string, rawPath: unknown) {
  await initializeLiveOfferings();
  const offering = getOffering(id);
  if (!offering) return { error: "Not found", status: 404 as const };
  const path = typeof rawPath === "string" ? rawPath.trim() : "";
  if (!path || !path.startsWith(`${id}/`))
    return { error: "Choose an uploaded file from this offering", status: 400 as const };
  const material = offering.materials.find((item) => item.docsPath === path);
  if (!material)
    return { error: "That file is not on this offering", status: 404 as const };
  return { offering, material, path };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const found = await resolve(id, new URL(req.url).searchParams.get("path"));
  if ("error" in found)
    return NextResponse.json({ error: found.error }, { status: found.status });

  const entry = await materialTextEntry(found.path);
  return NextResponse.json({
    transcript: entry?.transcript ?? null,
    /* A file with words but no timings — an owner's uploaded transcript, a
       deck — still has something worth showing beside it, so say so rather
       than pretending the panel is empty. */
    text: entry?.transcript ? undefined : entry?.text || undefined,
    reason: entry?.unreadableReason,
    canEdit: await canEditOffering(found.offering),
    transcribable: isTranscribableFile(found.path),
    configured: transcriptionConfigured(),
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as {
    path?: string;
    op?: "save" | "retry";
    segments?: unknown;
  } | null;

  const found = await resolve(id, body?.path);
  if ("error" in found)
    return NextResponse.json({ error: found.error }, { status: found.status });
  if (!(await canEditOffering(found.offering)))
    return NextResponse.json(
      { error: "Only an offering owner or an admin can change a transcript" },
      { status: 403 }
    );

  const { path, material } = found;
  const filename = path.split("/").pop() || material.label || path;

  if (body?.op === "save") {
    const segments = normalizeSegments(body.segments);
    if (!segments)
      return NextResponse.json(
        { error: "That transcript could not be read" },
        { status: 400 }
      );
    const existing = await materialTextEntry(path);
    const transcript: MaterialTranscript = {
      segments,
      source: "edited",
      ...(existing?.transcript?.duration
        ? { duration: existing.transcript.duration }
        : {}),
      editedBy: (await getCurrentUser()).name || "Someone",
      editedAt: new Date().toISOString(),
    };
    await saveMaterialText(path, {
      offeringId: id,
      filename,
      /* The flat text is what the agent searches, so it is rebuilt from the
         corrected lines. Editing the transcript has to change the answers, or
         correcting it is theatre. */
      text: transcriptToText(transcript),
      ...(existing?.bytes ? { bytes: existing.bytes } : {}),
      transcript,
      extractedAt: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true, transcript });
  }

  // --- retry -------------------------------------------------------------
  if (!isTranscribableFile(path))
    return NextResponse.json(
      { error: "That file has no audio to transcribe" },
      { status: 422 }
    );
  if (!transcriptionConfigured())
    return NextResponse.json(
      { error: "Transcription is not configured on this server" },
      { status: 503 }
    );
  if (!(await hasDocsStorage()))
    return NextResponse.json(
      { error: "Document storage is not configured here" },
      { status: 503 }
    );

  try {
    const presignUrl = await getMaterialServeUrl(path);
    const upstream = await fetch(presignUrl);
    if (!upstream.ok)
      return NextResponse.json(
        { error: "Could not read that uploaded file" },
        { status: 502 }
      );
    const bytes = Buffer.from(await upstream.arrayBuffer());
    if (bytes.byteLength > MAX_TRANSCRIBE_BYTES)
      return NextResponse.json({ error: "That file is too large" }, { status: 413 });

    const outcome = await transcribeMaterial({
      offeringId: id,
      path,
      filename,
      bytes,
      /* Asked for by hand, so it runs wherever it was asked — the
         production-only default exists to stop a dev server transcribing
         every upload, not to stop a person retrying one. */
      force: true,
    });
    if (!outcome.transcribed)
      return NextResponse.json(
        { error: outcome.reason || "Nothing could be transcribed" },
        { status: outcome.failure === "blocked" ? 503 : 422 }
      );
    return NextResponse.json({
      ok: true,
      words: outcome.words,
      transcript: outcome.transcript,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not transcribe that file",
      },
      { status: 500 }
    );
  }
}

/** Accept only well-formed, ordered segments; never store a broken timeline. */
function normalizeSegments(raw: unknown): TranscriptSegment[] | null {
  if (!Array.isArray(raw)) return null;
  const out: TranscriptSegment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const s = item as { start?: unknown; end?: unknown; text?: unknown };
    const start = Number(s.start);
    const end = Number(s.end);
    const text = typeof s.text === "string" ? s.text.trim() : "";
    if (!Number.isFinite(start) || start < 0) return null;
    if (!text) continue;
    out.push({ start, end: Number.isFinite(end) ? end : start, text });
  }
  return out.length ? out.sort((a, b) => a.start - b.start) : null;
}
