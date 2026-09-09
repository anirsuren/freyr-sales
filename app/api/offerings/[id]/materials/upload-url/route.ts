import { NextResponse } from "next/server";
import { getOffering } from "@/lib/offerings";
import { canEditOffering } from "@/lib/offeringOwnership";
import {
  createMaterialUploadGrant,
  hasMaterialStorage,
  MAX_DIRECT_UPLOAD_BYTES,
  validateMaterialUpload,
} from "@/lib/materialStorage";

export const dynamic = "force-dynamic";

/**
 * HAND THE BROWSER A SIGNED URL SO IT CAN UPLOAD STRAIGHT INTO SUPABASE.
 *
 * Anir, Sep 9: "You upload it to Supabase, and that's the main thing. The
 * Freya Docs is just a side thing... when you open it, you open it from
 * Supabase, not Freya Docs." Until today this route signed a URL into
 * FreyaFusion's Docs bucket instead, and that bucket has no CORS policy, so
 * every browser upload failed its preflight and fell back through the app
 * server, which holds the whole file in memory under a time limit. That is
 * how a 309MB recording became "Couldn't add that".
 *
 * Now the bytes go from the rep's machine into the workspace's own bucket,
 * the one the app already serves every file from. No memory, no clock, and
 * the only ceiling is the project's storage cap (5GB). Docs gets its copy
 * afterwards, in the background, from the finished upload.
 *
 * We still decide WHO may upload and WHERE it lands: the grant is minted only
 * for an owner (or admin), for a path inside this offering's namespace.
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
      { error: "Ask a workspace admin to assign you as an owner before uploading materials" },
      { status: 403 }
    );
  if (!(await hasMaterialStorage()))
    return NextResponse.json(
      { error: "Direct upload is not configured here" },
      { status: 503 }
    );

  const body = ((await req.json().catch(() => ({}))) ?? {}) as {
    filename?: string;
    contentType?: string;
    size?: number;
  };
  const filename = (body.filename || "").trim();
  if (!filename)
    return NextResponse.json({ error: "Name the file" }, { status: 400 });
  const validationError = validateMaterialUpload(
    filename,
    body.contentType || "application/octet-stream"
  );
  if (validationError)
    return NextResponse.json({ error: validationError }, { status: 400 });
  // Say no in words, before a byte moves, rather than letting storage refuse
  // a gigabyte at the end of the bar.
  const size = Number(body.size || 0);
  if (size > MAX_DIRECT_UPLOAD_BYTES)
    return NextResponse.json(
      {
        error: `That file is ${Math.round(size / 1024 / 1024)}MB; the limit is ${MAX_DIRECT_UPLOAD_BYTES / 1024 / 1024 / 1024}GB.`,
      },
      { status: 413 }
    );

  // The path is built HERE, never taken from the request: a client that could
  // name its own path could write into another offering's namespace.
  const safe = filename.replace(/[^\w.\-]+/g, "_").slice(-120);
  const path = `${id}/${Date.now()}-${safe}`;

  try {
    const grant = await createMaterialUploadGrant(
      path,
      body.contentType || "application/octet-stream"
    );
    return NextResponse.json({
      ok: true,
      path,
      uploadUrl: grant.uploadUrl,
      // Sent back verbatim on the PUT.
      uploadHeaders: grant.uploadHeaders,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not start the upload" },
      { status: 502 }
    );
  }
}
