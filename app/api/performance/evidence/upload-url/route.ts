import { NextResponse } from "next/server";
import { docsStorage, hasDocsStorage } from "@/lib/docsStorage";
import { verifiedWorkflowActor } from "@/lib/workflowAuthorization";
import { EVIDENCE_NAMESPACE } from "@/lib/performanceEvidence";

export const dynamic = "force-dynamic";

/**
 * HAND THE BROWSER A SIGNED URL SO EVIDENCE GOES STRAIGHT TO STORAGE.
 *
 * THERE IS NO SIZE LIMIT on this path, and that is the whole point (Anir,
 * Aug 15: "there should be absolutely no limits"). It is the same answer the
 * sales-material route already gives — the bytes travel from the rep's machine
 * to FreyaFusion's bucket without entering this server.
 *
 * The old evidence route proxied the file through Node, and that is exactly
 * why it broke: anything at or above 10 MB never reached the handler, so the
 * "Attach a file" error fired on a file the rep had very much attached, and on
 * production even a 1 MB contract died before the handler ran.
 *
 * We still decide WHO may upload and WHERE it lands: the signature is minted
 * only for a verified member, and only for a path inside perf-evidence/.
 */
export async function POST(req: Request) {
  const actor = await verifiedWorkflowActor(req as never);
  if (!actor) {
    return NextResponse.json({ error: "Sign in to attach files" }, { status: 403 });
  }
  if (!(await hasDocsStorage())) {
    // Not an error: the client falls back to the proxy upload, which is what a
    // laptop without the Docs credentials uses.
    return NextResponse.json(
      { error: "Direct upload is not configured here" },
      { status: 503 }
    );
  }

  const body = ((await req.json().catch(() => ({}))) ?? {}) as {
    filename?: string;
    contentType?: string;
  };
  const filename = (body.filename || "").trim();
  if (!filename) {
    return NextResponse.json({ error: "Name the file" }, { status: 400 });
  }

  // The path is built HERE, never taken from the request: a client that could
  // name its own path could write outside this namespace.
  const safeName =
    filename.replace(/[^\w.\-() ]+/g, "_").slice(-120) || "evidence";
  const path = `${EVIDENCE_NAMESPACE}${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}/${safeName}`;
  const contentType = body.contentType || "application/octet-stream";

  try {
    const { uploadUrl, uploadHeaders } = await docsStorage.requestUpload(
      path,
      contentType
    );
    return NextResponse.json({ uploadUrl, uploadHeaders, path });
  } catch (error) {
    console.error("[perf-evidence] could not sign an upload:", error);
    return NextResponse.json(
      { error: "Could not start that upload. Try again." },
      { status: 502 }
    );
  }
}
