import { NextResponse } from "next/server";
import { getOffering } from "@/lib/offerings";
import { canEditOffering } from "@/lib/offeringOwnership";
import { docsStorage, hasDocsStorage } from "@/lib/docsStorage";
import { formatFromFilename } from "@/lib/materialStorage";
import { extractFileText, isReadableFile } from "@/lib/fileText";
import { saveMaterialText } from "@/lib/materialText";

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

/** Documents get read; anything past this is stored but not indexed. No real
 *  deck or transcript comes close, and the ceiling keeps one enormous file
 *  from stalling the request. */
const EXTRACT_LIMIT_BYTES = 150 * 1024 * 1024;

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
      { error: "Take ownership of this offering to upload its materials" },
      { status: 403 }
    );
  if (!hasDocsStorage())
    return NextResponse.json(
      { error: "Document storage is not configured here" },
      { status: 503 }
    );

  const body = (await req.json().catch(() => ({}))) as {
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

  let readable = false;
  let words = 0;
  let text = "";
  if (isReadableFile(filename)) {
    try {
      const { presignUrl } = await docsStorage.getDownloadUrl(path);
      const res = await fetch(presignUrl);
      const size = Number(res.headers.get("content-length") || 0);
      if (res.ok && size <= EXTRACT_LIMIT_BYTES) {
        text = extractFileText(
          Buffer.from(await res.arrayBuffer()),
          filename
        );
        readable = text.length > 0;
        words = text.match(/\S+/g)?.length ?? 0;
      }
    } catch {
      // The file is stored and downloadable either way; it just won't inform
      // an answer. Never fail the upload over this.
    }
  }
  await saveMaterialText(path, {
    offeringId: id,
    filename,
    text,
    extractedAt: new Date().toISOString(),
  }).catch(() => undefined);

  return NextResponse.json({
    ok: true,
    // Downloads go through our own route, which mints a fresh signed URL per
    // click — a stored presign would expire and rot in the record.
    url: `/api/offerings/${id}/materials/download?path=${encodeURIComponent(path)}`,
    docsPath: path,
    kind: formatFromFilename(filename),
    filename,
    readable,
    words,
  });
}
