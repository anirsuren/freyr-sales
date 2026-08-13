import { NextResponse } from "next/server";
import { docsStorage, hasDocsStorage } from "@/lib/docsStorage";
import { verifiedWorkflowActor } from "@/lib/workflowAuthorization";

export const dynamic = "force-dynamic";

/**
 * EVIDENCE BEHIND A PERFORMANCE CLAIM.
 *
 * "When he says 'I finish this,' he is also adding an attachment... we need
 * evidence" (Suren, Aug 13). A claim on a booking goal carries the signed
 * contract or SOW; the group owner opens it from the verification queue
 * before locking the number.
 *
 * POST: multipart file → Freya.Docs under the perf-evidence/ namespace →
 * { name, url } for the entry's evidence list. The upload is proxied through
 * this route (request-url, PUT, complete) so the client stays one call.
 * GET: streams the bytes back INLINE so a PDF opens in the app, with the
 * same two guards the FDL file route uses: verified member only, and the
 * path must live in this namespace, so nobody pulls other storage objects
 * through it.
 */
const NAMESPACE = "perf-evidence/";
const MAX_BYTES = 15 * 1024 * 1024;

export async function POST(req: Request) {
  const actor = await verifiedWorkflowActor(req as never);
  if (!actor) {
    return NextResponse.json({ error: "Sign in to attach files" }, { status: 403 });
  }
  if (!(await hasDocsStorage())) {
    return NextResponse.json(
      { error: "Document storage is not configured" },
      { status: 503 }
    );
  }
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Attach a file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Files up to 15 MB only" },
      { status: 413 }
    );
  }
  const safeName = file.name.replace(/[^\w.\-() ]+/g, "_").slice(0, 100) || "evidence";
  const path = `${NAMESPACE}${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}/${safeName}`;
  const contentType = file.type || "application/octet-stream";
  try {
    const { uploadUrl, uploadHeaders } = await docsStorage.requestUpload(
      path,
      contentType
    );
    const put = await fetch(uploadUrl, {
      method: "PUT",
      headers: { ...uploadHeaders, "Content-Type": contentType },
      body: Buffer.from(await file.arrayBuffer()),
    });
    if (!put.ok) throw new Error(`storage PUT ${put.status}`);
    await docsStorage.completeUpload(path);
  } catch (error) {
    console.error("[perf-evidence] upload failed:", error);
    return NextResponse.json(
      { error: "The file could not be stored. Try again." },
      { status: 502 }
    );
  }
  return NextResponse.json({
    name: file.name.slice(0, 120),
    url: `/api/performance/evidence?path=${encodeURIComponent(path)}`,
  });
}

export async function GET(req: Request) {
  const actor = await verifiedWorkflowActor(req as never);
  if (!actor) {
    return NextResponse.json({ error: "Sign in to open this file" }, { status: 403 });
  }
  const path = new URL(req.url).searchParams.get("path");
  if (!path) return NextResponse.json({ error: "Which file?" }, { status: 400 });
  if (!path.startsWith(NAMESPACE)) {
    return NextResponse.json(
      { error: "That file is not performance evidence" },
      { status: 403 }
    );
  }
  try {
    const { presignUrl, fileName } = await docsStorage.getDownloadUrl(path);
    const upstream = await fetch(presignUrl);
    if (!upstream.ok || !upstream.body) throw new Error(`fetch ${upstream.status}`);
    return new Response(upstream.body, {
      headers: {
        "Content-Type":
          upstream.headers.get("content-type") ?? "application/octet-stream",
        "Content-Disposition": `inline; filename="${fileName.replace(/"/g, "")}"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    console.error("[perf-evidence] read failed:", error);
    return NextResponse.json({ error: "The file could not be opened" }, { status: 502 });
  }
}
