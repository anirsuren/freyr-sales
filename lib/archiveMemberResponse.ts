import "server-only";
import { NextResponse } from "next/server";
import {
  MaterialArchiveError,
  readMaterialArchiveMember,
} from "@/lib/materialArchive";

/**
 * ONE FILE OUT OF A ZIP, AS A RESPONSE. The sales-materials archive route has
 * done this since August; every other module that takes documents (meetings,
 * solutioning, contracts, accounts) opened a ZIP's listing fine and then
 * failed on the file inside it, because the viewer only knew the offerings
 * route for members ("This PDF could not be opened here", Sep 7 test loop, a
 * PDF inside a ZIP on a request comment). The caller has already resolved
 * `docsPath` through its own record and proved the reader may open it; this
 * only inflates the member and answers with the bytes, with the same size
 * ceilings, range support and content types as the offerings route.
 */

function extensionOf(path: string): string {
  return (path.split(".").pop() || "").toLowerCase();
}

function contentTypeOf(path: string): string {
  const types: Record<string, string> = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    csv: "text/csv; charset=utf-8",
    txt: "text/plain; charset=utf-8",
    md: "text/markdown; charset=utf-8",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
  };
  return types[extensionOf(path)] || "application/octet-stream";
}

function safeFilename(path: string): string {
  return (path.split("/").pop() || "file").replace(/["\r\n]/g, "'");
}

export async function archiveMemberResponse(
  docsPath: string,
  member: string,
  { inline, range }: { inline: boolean; range: string | null }
): Promise<NextResponse> {
  if (extensionOf(docsPath) !== "zip")
    return NextResponse.json(
      { error: "That document is not a ZIP archive" },
      { status: 400 }
    );
  try {
    const { bytes, name } = await readMaterialArchiveMember(docsPath, member);
    const full = Buffer.from(bytes);
    let body = full;
    let status = 200;
    const headers = new Headers({
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=60",
      "Content-Type": contentTypeOf(name),
      "X-Content-Type-Options": "nosniff",
    });

    if (range) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(range);
      if (!match)
        return new NextResponse(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${full.byteLength}` },
        });
      const start = Number(match[1]);
      const requestedEnd = match[2] ? Number(match[2]) : full.byteLength - 1;
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(requestedEnd) ||
        start < 0 ||
        start >= full.byteLength ||
        requestedEnd < start
      )
        return new NextResponse(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${full.byteLength}` },
        });
      const end = Math.min(requestedEnd, full.byteLength - 1);
      body = full.subarray(start, end + 1);
      status = 206;
      headers.set("Content-Range", `bytes ${start}-${end}/${full.byteLength}`);
    }

    headers.set("Content-Length", String(body.byteLength));
    headers.set(
      "Content-Disposition",
      `${inline ? "inline" : "attachment"}; filename="${safeFilename(name)}"`
    );
    return new NextResponse(body, { status, headers });
  } catch (error) {
    const status = error instanceof MaterialArchiveError ? error.status : 502;
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not open that archive file",
      },
      { status }
    );
  }
}
