import { NextResponse, type NextRequest } from "next/server";
import { docsStorage, hasDocsStorage } from "@/lib/docsStorage";
import { streamStoredFile } from "@/lib/storedFileResponse";
import { getRole } from "@/lib/role";
import { readMeetings } from "@/lib/meetings";
import { sampleDocUrl } from "@/lib/sampleDocuments";
import { canOpenModule } from "@/lib/moduleAccessServer";

/**
 * THE BYTES OF A DOCUMENT ON A MEETING.
 *
 * A meeting could take a file and then never give it back: the card listed a
 * filename, who added it and when, and a delete button — no way to open the
 * thing. Found in the browser on Aug 28, uploading a file and then looking for
 * the way back to it. Anir had already said this about the other place a
 * document is chosen ("if I choose that document I should be able to like open
 * it or something lol"); a deck you cannot open is a filename, not a document.
 *
 * Same shape as the solutioning and sales-material routes: a fresh signed URL
 * per click rather than a stored presign that would expire and rot in the
 * record, and `view=1` streams inline for the formats a browser renders
 * itself, so opening a PDF does not force a download.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await canOpenModule("/meetings")))
    return NextResponse.json(
      { error: "Not available on this account." },
      { status: 403 }
    );

  const search = new URL(req.url).searchParams;
  const meetingId = search.get("meetingId") ?? "";
  const docId = search.get("docId") ?? "";
  const inline = search.get("view") === "1";
  if (!meetingId || !docId)
    return NextResponse.json({ error: "Which document?" }, { status: 400 });

  /* Resolved through the meeting rather than trusted from the query, so a
     docsPath cannot be guessed at and read out of the bucket. */
  const state = await readMeetings();
  const meeting = state.meetings.find((m) => m.id === meetingId);
  const doc = meeting?.docs.find((d) => d.id === docId);
  if (!doc) return NextResponse.json({ error: "That file is gone." }, { status: 404 });

  if (doc.url && !doc.docsPath) return NextResponse.redirect(doc.url, 302);
  if (!doc.docsPath)
    return NextResponse.json(
      { error: "There is no file behind this one." },
      { status: 404 }
    );

  /* A MOCK DOCUMENT IS A REAL FILE THAT SHIPS WITH THE APP. It is not in
     Freya.Docs and needs no signed URL — the static route serves it, with the
     right content type, so a PDF still opens inline in the viewer. */
  const sample = sampleDocUrl(doc.docsPath);
  if (sample) return NextResponse.redirect(new URL(sample, req.url), 302);

  if (!(await hasDocsStorage()))
    return NextResponse.json(
      { error: "Document storage is not configured here" },
      { status: 503 }
    );

  const { presignUrl } = await docsStorage.getDownloadUrl(doc.docsPath);
  if (inline)
    return streamStoredFile(presignUrl, {
      filename: doc.label,
      range: req.headers.get("range"),
    });
  return NextResponse.redirect(presignUrl, 302);
}
