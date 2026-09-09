import { NextResponse, type NextRequest } from "next/server";
import { buildMaterialPreview, extensionOf } from "@/lib/materialPreview";
import { hasMaterialStorage } from "@/lib/materialStorage";
import { getDb } from "@/lib/db";
import { readPublicFile } from "@/lib/publicFile";
import { sampleDocUrl } from "@/lib/sampleDocuments";
import { canOpenModule } from "@/lib/moduleAccessServer";

/**
 * READ A DOCUMENT ON AN ACCOUNT'S ACTIVITY WITHOUT DOWNLOADING IT.
 *
 * Same law as the meeting, contract and solutioning preview routes: the
 * shared viewer asks here for JSON when a browser cannot draw the file from
 * its bytes (Excel, ZIP listings, a deck the in-browser renderer gives up
 * on). Without this route the raw file came back and the viewer failed
 * parsing it (Sep 7 test loop). The docsPath is resolved through the
 * customer record, never trusted from the query.
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
  const member = search.get("member");
  if (!customerId || !docId)
    return NextResponse.json({ error: "Which document?" }, { status: 400 });

  const customer = await getDb().customers.get(customerId);
  const doc = (customer?.offering_usage ?? [])
    .flatMap((u) => u.engagement_versions ?? [])
    .flatMap((v) => v.documents ?? [])
    .find((d) => d.id === docId);
  if (!doc?.docsPath)
    return NextResponse.json({ error: "That file is gone." }, { status: 404 });

  if (member && extensionOf(doc.docsPath) !== "zip")
    return NextResponse.json(
      { error: "That document is not a ZIP archive" },
      { status: 400 }
    );

  const sample = sampleDocUrl(doc.docsPath);
  if (!sample && !(await hasMaterialStorage()))
    return NextResponse.json(
      { error: "Document storage is not configured here" },
      { status: 503 }
    );

  const inlineUrl = `/api/customers/download?customerId=${encodeURIComponent(
    customerId
  )}&docId=${encodeURIComponent(docId)}&view=1`;

  const { body, status } = await buildMaterialPreview({
    path: sample ?? doc.docsPath,
    member,
    inlineUrl,
    label: doc.name,
    ...(sample ? { readBytes: () => readPublicFile(sample) } : {}),
  });
  return NextResponse.json(body, status ? { status } : undefined);
}
