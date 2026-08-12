import { NextResponse } from "next/server";
import { getOffering } from "@/lib/offerings";
import { canEditOffering } from "@/lib/offeringOwnership";
import { docsStorage, hasDocsStorage } from "@/lib/docsStorage";
import {
  contentTypeForFilename,
  formatFromFilename,
  mirrorMaterialToSupabase,
} from "@/lib/materialStorage";
import {
  extractFileContent,
  isReadableFile,
  type ExtractedFileContent,
} from "@/lib/fileText";
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
      { error: "Ask a workspace admin to assign you as an owner before uploading materials" },
      { status: 403 }
    );
  if (!(await hasDocsStorage()))
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

  const supported = isReadableFile(filename);
  let readable = false;
  let words = 0;
  let text = "";
  let extracted: ExtractedFileContent = { text: "" };
  /** Bytes already in hand from the read-back, reused for the mirror below so
   *  documents cost no second download. */
  let mirrorBytes: Buffer | null = null;
  // `failed` means we could not READ it this time — a different thing from a
  // format that has no text in it, and the two must never be reported as the
  // same thing (see the response below).
  let failed = false;

  if (supported) {
    // READ IT BACK WITH RETRIES.
    //
    // The object was committed a moment ago and the download is a fresh
    // presign against it; asking for it immediately can lose that race, and
    // the first version of this treated one unlucky GET as "this file has no
    // text", wrote an empty entry, and told the owner their PDF was an
    // unreadable file type. It happened to Anir on a PDF that extracts
    // perfectly (Jul 29) — 0 words stored, 195 words on a retry of the very
    // same file 108 seconds later.
    for (const waitMs of [0, 400, 1200, 3000]) {
      if (waitMs) await new Promise((r) => setTimeout(r, waitMs));
      try {
        const { presignUrl } = await docsStorage.getDownloadUrl(path);
        const res = await fetch(presignUrl);
        if (!res.ok) {
          failed = true;
          continue;
        }
        const size = Number(res.headers.get("content-length") || 0);
        if (size > EXTRACT_LIMIT_BYTES) {
          failed = false;
          break;
        }
        const bytes = Buffer.from(await res.arrayBuffer());
        mirrorBytes = bytes;
        extracted = extractFileContent(bytes, filename);
        text = extracted.text;
        readable = text.length > 0;
        words = text.match(/\S+/g)?.length ?? 0;
        failed = false;
        break;
      } catch {
        failed = true;
      }
    }
  }

  // Only record what we actually read. Writing an empty entry for a file we
  // simply could not fetch would cache the failure: the assistant would treat
  // a perfectly readable deck as wordless for good.
  if (!failed) {
    await saveMaterialText(path, {
      offeringId: id,
      filename,
      text,
      extractedAt: new Date().toISOString(),
      ...(extracted.contentDate ? { contentDate: extracted.contentDate } : {}),
      ...(extracted.archiveMembers
        ? { archiveMembers: extracted.archiveMembers }
        : {}),
    }).catch(() => undefined);
  }

  // MIRROR INTO THE WORKSPACE'S OWN SUPABASE BUCKET (Anir, Aug 12: "store
  // them in supabase storage as well"). Fire-and-forget: this container keeps
  // running after the response, and a mirror failure must never turn a
  // finished upload into an error. Files the read-back already downloaded
  // reuse those bytes; everything else (videos, oversize) is fetched once.
  void (async () => {
    try {
      let bytes = mirrorBytes;
      if (!bytes) {
        const { presignUrl } = await docsStorage.getDownloadUrl(path);
        const res = await fetch(presignUrl);
        if (!res.ok) return;
        const size = Number(res.headers.get("content-length") || 0);
        if (size > EXTRACT_LIMIT_BYTES * 3) return; // bucket cap ~ upload cap
        bytes = Buffer.from(await res.arrayBuffer());
      }
      await mirrorMaterialToSupabase(path, bytes, contentTypeForFilename(filename));
    } catch {
      // Freya.Docs remains the source of truth; the mirror retries on the
      // next backfill run.
    }
  })();

  return NextResponse.json({
    ok: true,
    // Three distinct outcomes, because one flag cannot carry them and the
    // owner deserves the true one.
    supported,
    failed,
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
