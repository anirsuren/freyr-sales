import { NextResponse } from "next/server";
import { getOffering } from "@/lib/offerings";
import { canEditOffering } from "@/lib/offeringOwnership";
import { docsStorage, hasDocsStorage } from "@/lib/docsStorage";
import { formatFromFilename } from "@/lib/materialStorage";
import { isReadableFile } from "@/lib/fileText";
import { indexStoredMaterialInBackground } from "@/lib/materialIndexing";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * FINISH A DIRECT-TO-S3 UPLOAD, then read the file so the assistant can answer
 * from it.
 *
 * Two phases are the Docs API's own contract: without `complete` the object
 * stays pending and its path can never be reused. Once it is committed we pull
 * the text out — but only for formats that HAVE text, and only up to a budget.
 * A 3GB demo recording is stored happily and simply isn't searchable; reading
 * it would mean downloading 3GB into this process to find no words at all.
 */

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const offering = getOffering(id);
  if (!offering)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canEditOffering(offering)))
    return NextResponse.json(
      { error: "Ask a workspace admin to assign you as an owner before uploading materials" },
      { status: 403 }
    );
  if (!(await hasDocsStorage()))
    return NextResponse.json(
      { error: "Document storage is not configured here" },
      { status: 503 }
    );

  const body = ((await req.json().catch(() => ({}))) ?? {}) as {
    path?: string;
    filename?: string;
    /** Whether the browser's PUT failed — then we abort instead of commit. */
    failed?: boolean;
  };
  const path = (body.path || "").trim();
  const filename = (body.filename || "").trim() || "file";
  // Same rule as the download route: the path must belong to THIS offering.
  if (!path || !path.startsWith(`${id}/`))
    return NextResponse.json(
      { error: "That file does not belong to this offering" },
      { status: 403 }
    );

  // A failed browser upload leaves the path pending, which blocks re-sending
  // the same file until it is cleared.
  if (body.failed) {
    await docsStorage.abortUpload(path).catch(() => undefined);
    return NextResponse.json({ ok: true, aborted: true });
  }

  try {
    await docsStorage.completeUpload(path);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not finish the upload" },
      { status: 502 }
    );
  }

  /**
   * THE FILE IS IN. ANSWER NOW; READ IT AFTERWARDS.
   *
   * completeUpload() above is the last step that decides whether the object
   * exists. Everything that used to follow — downloading it back, extracting
   * text, mirroring it — is the SECOND job (Anir, Aug 13: "get it in the
   * fucking system" first, "then train the AI on it"). It ran inline, so a
   * slow read-back or a throw on a malformed file turned a finished upload
   * into a red error in the rep's face.
   */
  indexStoredMaterialInBackground({ offeringId: id, path, filename });

  return NextResponse.json({
    ok: true,
    // The format CAN hold text. Whether words came out is settled in the
    // background now, so this response is purely about storage.
    supported: isReadableFile(filename),
    failed: false,
    indexing: true,
    // Downloads go through our own route, which mints a fresh signed URL per
    // click — a stored presign would expire and rot in the record.
    url: `/api/offerings/${id}/materials/download?path=${encodeURIComponent(path)}`,
    docsPath: path,
    kind: formatFromFilename(filename),
    filename,
  });
}
