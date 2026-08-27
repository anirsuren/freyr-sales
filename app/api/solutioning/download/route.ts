import { NextResponse, type NextRequest } from "next/server";
import { docsStorage, hasDocsStorage } from "@/lib/docsStorage";
import { streamStoredFile } from "@/lib/storedFileResponse";
import { reachableSolutioningDoc } from "@/lib/solutioningDocAccess";

/**
 * THE BYTES OF A SOLUTIONING DOCUMENT.
 *
 * A fresh signed URL per click rather than a stored presign, which would
 * expire and rot in the record — the same reasoning as the sales-material
 * download route. `view=1` is what the viewer embeds for the formats a browser
 * renders itself, so it must not force a download.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const search = new URL(req.url).searchParams;
  const requestId = search.get("requestId") ?? "";
  const docId = search.get("docId") ?? "";
  const inline = search.get("view") === "1";
  if (!requestId || !docId)
    return NextResponse.json({ error: "Which document?" }, { status: 400 });

  const access = await reachableSolutioningDoc(requestId, docId);
  if (!access.ok)
    return NextResponse.json({ error: access.error }, { status: access.status });

  if (!(await hasDocsStorage()))
    return NextResponse.json(
      { error: "Document storage is not configured here" },
      { status: 503 }
    );

  const name = access.doc.fileName || access.doc.name;
  const { presignUrl } = await docsStorage.getDownloadUrl(access.docsPath);
  /* Inline streams through us so the browser renders it in the tab; otherwise
     the presigned URL's own attachment disposition saves it to disk. */
  if (inline)
    return streamStoredFile(presignUrl, {
      filename: name,
      range: req.headers.get("range"),
    });
  return NextResponse.redirect(presignUrl, 302);
}
