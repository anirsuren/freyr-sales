import { NextResponse, type NextRequest } from "next/server";
import { buildMaterialPreview, extensionOf } from "@/lib/materialPreview";
import { hasMaterialStorage } from "@/lib/materialStorage";
import { readContracts } from "@/lib/contracts";
import { readPublicFile } from "@/lib/publicFile";
import { sampleDocUrl } from "@/lib/sampleDocuments";
import { canOpenModule } from "@/lib/moduleAccessServer";

/**
 * READ A CONTRACT'S DOCUMENT WITHOUT DOWNLOADING IT.
 *
 * The contracts list opened its files in the shared viewer from Sep 6, but the
 * viewer only had the byte stream to read from, and for anything a browser
 * cannot draw on its own (Excel, a ZIP, a deck the in-browser renderer gives
 * up on) it asks a module's preview route for JSON — there was none here, so
 * the raw file came back and the viewer failed parsing it (Sep 7 test loop).
 *
 * Same renderer as sales materials, meetings and solutioning
 * (lib/materialPreview); this route only decides whether the reader is
 * allowed the file, resolved through the CONTRACT and the document id, never
 * from a path in the query.
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
  const member = search.get("member");
  if (!contractId || !docId)
    return NextResponse.json({ error: "Which document?" }, { status: 400 });

  const state = await readContracts();
  const contract = state.contracts.find((c) => c.id === contractId);
  const doc = contract?.docs?.find((d) => d.id === docId);
  if (!doc?.docsPath)
    return NextResponse.json({ error: "That file is gone." }, { status: 404 });

  if (member && extensionOf(doc.docsPath) !== "zip")
    return NextResponse.json(
      { error: "That document is not a ZIP archive" },
      { status: 400 }
    );

  /* A mock document is a file that ships with the app, so it previews with no
     storage configured at all. */
  const sample = sampleDocUrl(doc.docsPath);
  if (!sample && !(await hasMaterialStorage()))
    return NextResponse.json(
      { error: "Document storage is not configured here" },
      { status: 503 }
    );

  const inlineUrl = `/api/contracts/download?contractId=${encodeURIComponent(
    contractId
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
