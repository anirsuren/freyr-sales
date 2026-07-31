import { NextResponse } from "next/server";
import { getOffering, initializeLiveOfferings } from "@/lib/offerings";
import { hasDocsStorage } from "@/lib/docsStorage";
import {
  MaterialArchiveError,
  readMaterialArchiveMember,
} from "@/lib/materialArchive";
import { verifiedWorkflowActor } from "@/lib/workflowAuthorization";
import { canViewOfferingMaterial } from "@/lib/materialAccess";

export const dynamic = "force-dynamic";

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

/**
 * OPEN ONE FILE FROM A ZIP WITHOUT MAKING THE REP DOWNLOAD AND UNPACK IT.
 *
 * The archive itself remains a normal offering material in Freya.Docs. This
 * route authenticates the rep, proves the archive belongs to this offering,
 * extracts one exact member on demand, and returns only those bytes. `view=1`
 * feeds the existing in-app viewer; without it the selected member downloads.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const actor = await verifiedWorkflowActor(req as never);
  if (!actor)
    return NextResponse.json(
      { error: "Sign in to open sales materials" },
      { status: 403 }
    );

  await initializeLiveOfferings();
  const offering = getOffering(id);
  if (!offering)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const search = new URL(req.url).searchParams;
  const path = search.get("path");
  const member = search.get("member");
  if (!path || !member)
    return NextResponse.json(
      { error: "Which archive file?" },
      { status: 400 }
    );
  if (!path.startsWith(`${id}/`))
    return NextResponse.json(
      { error: "That archive does not belong to this offering" },
      { status: 403 }
    );

  const material = offering.materials.find((item) => item.docsPath === path);
  if (
    !material ||
    !canViewOfferingMaterial(offering, material, actor.userId) ||
    extensionOf(path) !== "zip"
  )
    return NextResponse.json(
      { error: "That ZIP is not on this offering" },
      { status: 404 }
    );

  if (!(await hasDocsStorage()))
    return NextResponse.json(
      { error: "Document storage is not configured here" },
      { status: 503 }
    );

  try {
    const { bytes, name } = await readMaterialArchiveMember(path, member);
    const full = Buffer.from(bytes);
    const range = req.headers.get("range");
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
      const requestedEnd = match[2]
        ? Number(match[2])
        : full.byteLength - 1;
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
      `${search.get("view") === "1" ? "inline" : "attachment"}; filename="${safeFilename(name)}"`
    );
    return new NextResponse(body, { status, headers });
  } catch (error) {
    const status =
      error instanceof MaterialArchiveError ? error.status : 502;
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
