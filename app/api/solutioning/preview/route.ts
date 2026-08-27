import { NextResponse, type NextRequest } from "next/server";
import { buildMaterialPreview, extensionOf } from "@/lib/materialPreview";
import { hasDocsStorage } from "@/lib/docsStorage";
import { reachableSolutioningDoc } from "@/lib/solutioningDocAccess";

/**
 * READ A SOLUTIONING DOCUMENT WITHOUT DOWNLOADING IT.
 *
 * Anir, Aug 26: "if the customer documents are the sales material, then... copy
 * all that shit. Every single part of it, like the preview, the hover."
 *
 * So it is the same renderer, lib/materialPreview — Word through mammoth,
 * Excel through the workbook reader that resolves borders and theme colours,
 * PowerPoint as real slides, PDF and video natively. This route only decides
 * whether the reader is allowed the file; what it looks like is not this
 * file's business, which is the whole reason the two surfaces cannot drift.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const search = new URL(req.url).searchParams;
  const requestId = search.get("requestId") ?? "";
  const docId = search.get("docId") ?? "";
  const member = search.get("member");
  if (!requestId || !docId)
    return NextResponse.json({ error: "Which document?" }, { status: 400 });

  const access = await reachableSolutioningDoc(requestId, docId);
  if (!access.ok)
    return NextResponse.json({ error: access.error }, { status: access.status });

  if (member && extensionOf(access.docsPath) !== "zip")
    return NextResponse.json(
      { error: "That document is not a ZIP archive" },
      { status: 400 }
    );

  if (!(await hasDocsStorage()))
    return NextResponse.json(
      { error: "Document storage is not configured here" },
      { status: 503 }
    );

  const inlineUrl = `/api/solutioning/download?requestId=${encodeURIComponent(
    requestId
  )}&docId=${encodeURIComponent(docId)}&view=1`;

  const { body, status } = await buildMaterialPreview({
    path: access.docsPath,
    member,
    inlineUrl,
    label: access.label,
  });
  return NextResponse.json(body, status ? { status } : undefined);
}
