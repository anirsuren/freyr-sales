import { NextResponse, type NextRequest } from "next/server";
import { getMaterialServeUrl } from "@/lib/materialStorage";
import { docsStorage, hasDocsStorage } from "@/lib/docsStorage";
import { streamStoredFile } from "@/lib/storedFileResponse";
import { getDb } from "@/lib/db";
import { sampleDocUrl } from "@/lib/sampleDocuments";
import { canOpenModule } from "@/lib/moduleAccessServer";

/**
 * THE BYTES OF A DOCUMENT ON AN ACCOUNT'S ACTIVITY. Same law as the meeting
 * and solutioning routes: a filename you cannot open is not a document, and
 * the docsPath is resolved through the record rather than trusted from the
 * query, so a path cannot be guessed at and read out of the bucket.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await canOpenModule("/customers")))
    return NextResponse.json(
      { error: "Not available on this account." },
      { status: 403 }
    );

  const search = new URL(req.url).searchParams;
  const customerId = search.get("customerId") ?? "";
  const docId = search.get("docId") ?? "";
  const inline = search.get("view") === "1";
  if (!customerId || !docId)
    return NextResponse.json({ error: "Which document?" }, { status: 400 });

  const customer = await getDb().customers.get(customerId);
  const doc = (customer?.offering_usage ?? [])
    .flatMap((u) => u.engagement_versions ?? [])
    .flatMap((v) => v.documents ?? [])
    .find((d) => d.id === docId);
  if (!doc) return NextResponse.json({ error: "That file is gone." }, { status: 404 });
  if (!doc.docsPath)
    return NextResponse.json(
      { error: "There is no file behind this one." },
      { status: 404 }
    );

  const sample = sampleDocUrl(doc.docsPath);
  if (sample) return NextResponse.redirect(new URL(sample, req.url), 302);

  if (!(await hasDocsStorage()))
    return NextResponse.json(
      { error: "Document storage is not configured here" },
      { status: 503 }
    );

  const presignUrl = await getMaterialServeUrl(doc.docsPath);
  if (inline)
    return streamStoredFile(presignUrl, {
      filename: doc.name,
      range: req.headers.get("range"),
    });
  return NextResponse.redirect(presignUrl, 302);
}
