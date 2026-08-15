import { NextResponse } from "next/server";
import { docsStorage } from "@/lib/docsStorage";
import { verifiedWorkflowActor } from "@/lib/workflowAuthorization";
import { EVIDENCE_NAMESPACE } from "@/lib/performanceEvidence";

export const dynamic = "force-dynamic";

/**
 * Seal an evidence upload that went straight to storage, and hand back the
 * { name, url } pair the claim carries. Mirrors the sales-material complete
 * step; the bytes never touch this server on either call.
 */
export async function POST(req: Request) {
  const actor = await verifiedWorkflowActor(req as never);
  if (!actor) {
    return NextResponse.json({ error: "Sign in to attach files" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    path?: string;
    name?: string;
  };
  const path = (body.path || "").trim();
  if (!path) {
    return NextResponse.json({ error: "Which file?" }, { status: 400 });
  }
  // The same guard the reader uses: this endpoint finishes evidence uploads
  // and nothing else, so a caller cannot seal a path in another namespace.
  if (!path.startsWith(EVIDENCE_NAMESPACE)) {
    return NextResponse.json(
      { error: "That file is not performance evidence" },
      { status: 403 }
    );
  }

  try {
    await docsStorage.completeUpload(path);
  } catch (error) {
    console.error("[perf-evidence] could not complete an upload:", error);
    return NextResponse.json(
      { error: "The file did not finish uploading. Try again." },
      { status: 502 }
    );
  }

  const fallbackName = path.split("/").pop() || "evidence";
  return NextResponse.json({
    name: (body.name || fallbackName).slice(0, 120),
    url: `/api/performance/evidence?path=${encodeURIComponent(path)}`,
  });
}
