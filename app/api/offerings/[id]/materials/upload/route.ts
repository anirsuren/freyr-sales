import { NextResponse } from "next/server";
import { getOffering } from "@/lib/offerings";
import { canEditOffering } from "@/lib/offeringOwnership";
import { uploadMaterialFile, MAX_UPLOAD_BYTES } from "@/lib/materialStorage";
import { getCurrentUser } from "@/lib/currentUser";
import { extractFileContent, isReadableFile } from "@/lib/fileText";
import { saveMaterialText } from "@/lib/materialText";

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

    // READ THE FILE so the assistant can answer from it. This is the whole
    // reason uploads exist rather than links (Wajeed, Jul 29: "the AI should
    // be able to use the content of each of the files uploaded"). Extraction
    // is best-effort and never blocks the upload: a scanned PDF or a .mov
    // still stores fine, it just isn't searchable, and we say so.
    // This path still has the bytes in hand, so there is nothing to race and
    // nothing to retry — but it reports the SAME three outcomes as the direct
    // path so the dialog never has to guess which one it is talking to.
    const supported = isReadableFile(file.name);
    let readable = false;
    let words = 0;
    if (stored.docsPath) {
      const extracted = supported
        ? extractFileContent(Buffer.from(await file.arrayBuffer()), file.name)
        : { text: "" };
      const text = extracted.text;
      readable = text.length > 0;
      words = text.match(/\S+/g)?.length ?? 0;
      await saveMaterialText(stored.docsPath, {
        offeringId: id,
        filename: file.name,
        text,
        extractedAt: new Date().toISOString(),
        ...(extracted.contentDate ? { contentDate: extracted.contentDate } : {}),
        ...(extracted.archiveMembers
          ? { archiveMembers: extracted.archiveMembers }
          : {}),
      }).catch(() => undefined);
    }

    return NextResponse.json({
      ok: true,
      ...stored,
      supported,
      failed: false,
      readable,
      words,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Upload failed" },
      { status: 500 }
    );
  }
}
