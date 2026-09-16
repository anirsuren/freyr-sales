import { NextResponse, type NextRequest } from "next/server";
import { buildMaterialPreview, extensionOf } from "@/lib/materialPreview";
import { readPublicFile } from "@/lib/publicFile";
import { SAMPLE_DOCUMENT_FILES } from "@/lib/sampleDocuments";
import { EVIDENCE_NAMESPACE } from "@/lib/performanceEvidence";
import { verifiedWorkflowActor } from "@/lib/workflowAuthorization";

export const dynamic = "force-dynamic";

function resolveSource(source: string) {
  if (source.startsWith("/sample-documents/")) {
    const file = source.slice("/sample-documents/".length);
    if ((SAMPLE_DOCUMENT_FILES as readonly string[]).includes(file)) {
      return { path: source, inlineUrl: source, sample: true };
    }
    return null;
  }

  if (source.startsWith("/api/performance/evidence?")) {
    const url = new URL(source, "http://performance.local");
    const path = url.searchParams.get("path");
    if (path?.startsWith(EVIDENCE_NAMESPACE)) {
      return { path, inlineUrl: source, sample: false };
    }
  }
  return null;
}

export async function GET(req: NextRequest) {
  if (!(await verifiedWorkflowActor(req))) {
    return NextResponse.json({ error: "Sign in to open this file" }, { status: 403 });
  }

  const search = new URL(req.url).searchParams;
  const source = search.get("source") ?? "";
  const name = search.get("name") ?? "";
  const member = search.get("member");
  const resolved = resolveSource(source);

  if (!name || !resolved) {
    return NextResponse.json({ error: "That evidence file is not available" }, { status: 404 });
  }
  if (member && extensionOf(resolved.path) !== "zip") {
    return NextResponse.json({ error: "That document is not a ZIP archive" }, { status: 400 });
  }

  const { body, status } = await buildMaterialPreview({
    path: resolved.path,
    member,
    inlineUrl: resolved.inlineUrl,
    label: name,
    ...(resolved.sample ? { readBytes: () => readPublicFile(resolved.inlineUrl) } : {}),
  });
  return NextResponse.json(body, status ? { status } : undefined);
}
