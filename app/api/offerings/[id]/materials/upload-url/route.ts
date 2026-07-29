import { NextResponse } from "next/server";
import { getOffering } from "@/lib/offerings";
import { canEditOffering } from "@/lib/offeringOwnership";
import { docsStorage, hasDocsStorage } from "@/lib/docsStorage";
import { getCurrentUser } from "@/lib/currentUser";

export const dynamic = "force-dynamic";

/**
 * HAND THE BROWSER A SIGNED URL SO IT CAN UPLOAD STRAIGHT TO S3.
 *
 * THERE IS NO SIZE LIMIT on this path, and that is the whole point (Anir,
 * Jul 29: "why are you restricting it to 100MB? This is an enterprise-level
 * application"). The bytes go from the rep's machine to FreyaFusion's bucket
 * without ever entering this server, so a two-hour recorded demo costs us no
 * memory and no request time — the old route buffered the entire file in the
 * Node process, which is exactly why it had to be capped.
 *
 * We still decide WHO may upload and WHERE it lands: the signature is minted
 * only for an owner, and only for a path inside this offering's namespace.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const offering = getOffering(id);
  if (!offering)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canEditOffering(offering)))
    return NextResponse.json(
      { error: "Take ownership of this offering to upload its materials" },
      { status: 403 }
    );
  if (!hasDocsStorage())
    return NextResponse.json(
      { error: "Direct upload is not configured here" },
      { status: 503 }
    );

  const body = (await req.json().catch(() => ({}))) as {
    filename?: string;
    contentType?: string;
  };
  const filename = (body.filename || "").trim();
  if (!filename)
    return NextResponse.json({ error: "Name the file" }, { status: 400 });

  // The path is built HERE, never taken from the request: a client that could
  // name its own path could write into another offering's namespace.
  const safe = filename.replace(/[^\w.\-]+/g, "_").slice(-120);
  const path = `${id}/${Date.now()}-${safe}`;
  const me = await getCurrentUser().catch(() => null);

  try {
    const signed = await docsStorage.requestUpload(
      path,
      body.contentType || "application/octet-stream",
      { offeringId: id, ...(me?.email ? { uploadedBy: me.email } : {}) }
    );
    return NextResponse.json({
      ok: true,
      path,
      uploadUrl: signed.uploadUrl,
      // Every signed header must be replayed verbatim on the PUT or S3
      // answers 403 — the browser sends this object back untouched.
      uploadHeaders: signed.uploadHeaders,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not start the upload" },
      { status: 502 }
    );
  }
}
