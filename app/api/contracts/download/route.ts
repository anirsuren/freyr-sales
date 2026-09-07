import { NextResponse, type NextRequest } from "next/server";
import { docsStorage, hasDocsStorage } from "@/lib/docsStorage";
import { streamStoredFile } from "@/lib/storedFileResponse";
import { readContracts } from "@/lib/contracts";
import { sampleDocUrl } from "@/lib/sampleDocuments";
import { canOpenModule } from "@/lib/moduleAccessServer";
import { archiveMemberResponse } from "@/lib/archiveMemberResponse";

/**
 * THE BYTES OF A DOCUMENT ON A CONTRACT.
 *
 * A contract could take files — the create dialog has had a drop zone since
 * August, and they saved onto the record — and then never give them back:
 * there was no download route and the list never showed them, so an uploaded
 * agreement was a filename in a database column. The row's one button opened
 * `documentUrl`, a link somebody pastes to wherever legal keeps the executed
 * PDF, which is a different thing entirely.
 *
 * Anir, Sep 6: "the exact same thing that you have on meetings — it looks like
 * I can open the documents — has to be on... pretty much anywhere else there
 * is a document to be attached to anything."
 *
 * Deliberately identical to the meetings route: the path is resolved through
 * the CONTRACT and the document id, never trusted from the query, so a
 * docsPath cannot be guessed at and read out of the bucket. A fresh signed URL
 * per click, rather than a stored presign that would expire and rot inside the
 * record, and `view=1` streams inline so a PDF opens in the app's own viewer
 * instead of forcing a download.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await canOpenModule("/contracts")))
    return NextResponse.json(
      { error: "Not available on this account." },
      { status: 403 }
    );

  const search = new URL(req.url).searchParams;
  const contractId = search.get("contractId") ?? "";
  const docId = search.get("docId") ?? "";
  const inline = search.get("view") === "1";
  const member = search.get("member");
  if (!contractId || !docId)
    return NextResponse.json({ error: "Which document?" }, { status: 400 });

  const state = await readContracts();
  const contract = state.contracts.find((c) => c.id === contractId);
  const doc = contract?.docs?.find((d) => d.id === docId);
  if (!doc)
    return NextResponse.json({ error: "That file is gone." }, { status: 404 });

  if (doc.url && !doc.docsPath) return NextResponse.redirect(doc.url, 302);
  if (!doc.docsPath)
    return NextResponse.json(
      { error: "There is no file behind this one." },
      { status: 404 }
    );

  /* A mock document is a real file that ships with the app: served by the
     static route, with the right content type, so it still opens inline. */
  const sample = sampleDocUrl(doc.docsPath);
  if (sample) return NextResponse.redirect(new URL(sample, req.url), 302);

  if (!(await hasDocsStorage()))
    return NextResponse.json(
      { error: "Document storage is not configured here" },
      { status: 503 }
    );

  /* ONE FILE INSIDE A ZIP, resolved through the same record as the archive. */
  if (member)
    return archiveMemberResponse(doc.docsPath, member, {
      inline,
      range: req.headers.get("range"),
    });

  const { presignUrl } = await docsStorage.getDownloadUrl(doc.docsPath);
  if (inline)
    return streamStoredFile(presignUrl, {
      filename: doc.fileName || doc.name,
      range: req.headers.get("range"),
    });
  return NextResponse.redirect(presignUrl, 302);
}
