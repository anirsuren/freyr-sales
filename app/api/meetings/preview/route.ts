import { NextResponse, type NextRequest } from "next/server";
import { buildMaterialPreview, extensionOf } from "@/lib/materialPreview";
import { hasDocsStorage } from "@/lib/docsStorage";
import { getRole } from "@/lib/role";
import { canAccessModule } from "@/lib/moduleAccess";
import { readMeetings } from "@/lib/meetings";
import { readPublicFile } from "@/lib/publicFile";
import { sampleDocUrl } from "@/lib/sampleDocuments";

/**
 * READ A MEETING'S DOCUMENT WITHOUT DOWNLOADING IT.
 *
 * Anir, Aug 28: "I can't even open a document... you're gonna have to do it in
 * another viewer, just like you have on sales materials. Literally copy it...
 * whenever there are files, bro, you have to do this same exact thing. You
 * already have it built."
 *
 * So it is the same renderer the sales materials and the solutioning documents
 * use — lib/materialPreview: Word through mammoth, Excel through the workbook
 * reader that resolves borders and theme colours, PowerPoint as real slides,
 * PDF and video natively. This route only decides whether the reader is
 * allowed the file; what it looks like is not this file's business, which is
 * the whole reason the three surfaces cannot drift apart.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!canAccessModule("/meetings", await getRole()))
    return NextResponse.json(
      { error: "Not available on this account." },
      { status: 403 }
    );

  const search = new URL(req.url).searchParams;
  const meetingId = search.get("meetingId") ?? "";
  const docId = search.get("docId") ?? "";
  const member = search.get("member");
  if (!meetingId || !docId)
    return NextResponse.json({ error: "Which document?" }, { status: 400 });

  /* Resolved through the meeting, the same as the download route: a docsPath
     is never trusted from the query. */
  const state = await readMeetings();
  const meeting = state.meetings.find((m) => m.id === meetingId);
  const doc = meeting?.docs.find((d) => d.id === docId);
  if (!doc?.docsPath)
    return NextResponse.json({ error: "That file is gone." }, { status: 404 });

  if (member && extensionOf(doc.docsPath) !== "zip")
    return NextResponse.json(
      { error: "That document is not a ZIP archive" },
      { status: 400 }
    );

  /* MOCK'S DOCUMENTS ARE FILES THAT SHIP WITH THE APP, not storage — so they
     preview on a machine with no Freya.Docs configured at all, which is most
     of the point of mock. PDFs render from the inline URL; Word and Excel are
     converted here and get their bytes off disk. */
  const sample = sampleDocUrl(doc.docsPath);
  if (!sample && !(await hasDocsStorage()))
    return NextResponse.json(
      { error: "Document storage is not configured here" },
      { status: 503 }
    );

  const inlineUrl = `/api/meetings/download?meetingId=${encodeURIComponent(
    meetingId
  )}&docId=${encodeURIComponent(docId)}&view=1`;

  const { body, status } = await buildMaterialPreview({
    path: sample ?? doc.docsPath,
    member,
    inlineUrl,
    label: doc.label,
    ...(sample ? { readBytes: () => readPublicFile(sample) } : {}),
  });
  return NextResponse.json(body, status ? { status } : undefined);
}
