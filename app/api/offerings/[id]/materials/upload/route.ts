import { NextResponse } from "next/server";
import { getOffering } from "@/lib/offerings";
import { canEditOffering } from "@/lib/offeringOwnership";
import { uploadMaterialFile, MAX_UPLOAD_BYTES } from "@/lib/materialStorage";
import { getCurrentUser } from "@/lib/currentUser";
import { isReadableFile } from "@/lib/fileText";
import { indexStoredMaterialInBackground } from "@/lib/materialIndexing";

export const dynamic = "force-dynamic";
// A recorded demo is tens of MB; the platform default body cap would bounce it.
export const maxDuration = 60;

/**
 * UPLOAD THE ACTUAL FILE behind a sales material.
 *
 * Gated exactly like every other change to an offering: you must OWN it. The
 * bytes land in managed storage (lib/materialStorage) and the response hands
 * back the URL plus the format inferred from the filename; the client then
 * attaches the material row through the normal PATCH, so attribution stamping
 * and persistence stay on the one existing write path.
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

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Send the file as multipart form data" },
      { status: 400 }
    );
  }
  const file = form.get("file");
  if (!(file instanceof File))
    return NextResponse.json({ error: "No file in the request" }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES)
    return NextResponse.json(
      {
        error: `That file is ${Math.round(file.size / 1024 / 1024)}MB; the limit is ${MAX_UPLOAD_BYTES / 1024 / 1024}MB.`,
      },
      { status: 413 }
    );

  try {
    const me = await getCurrentUser().catch(() => null);
    const stored = await uploadMaterialFile(id, file, me?.email || me?.name);

    /**
     * THE UPLOAD IS DONE. ANSWER NOW.
     *
     * Reading the file for the assistant is a SECOND job and it starts after
     * this response goes out (Anir, Aug 13: "get it in the fucking system"
     * first, "then train the AI on it"). Extraction used to run inline here,
     * so a corrupt pptx or a PDF with a broken xref threw, fell to the outer
     * catch, and answered 500 "Upload failed" about a file already sitting
     * safely in the bucket. That is the bug that made sales materials feel
     * like they broke every day — and once the bucket's missing CORS started
     * routing every browser upload through here, it would have hit everyone.
     */
    if (stored.docsPath) {
      indexStoredMaterialInBackground({
        offeringId: id,
        path: stored.docsPath,
        filename: file.name,
        bytes: Buffer.from(await file.arrayBuffer()),
      });
    }

    return NextResponse.json({
      ok: true,
      ...stored,
      // The format CAN hold text; whether we got any is decided in the
      // background now, so the dialog reports storage, not searchability.
      supported: isReadableFile(file.name),
      failed: false,
      indexing: Boolean(stored.docsPath),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Upload failed" },
      { status: 500 }
    );
  }
}
