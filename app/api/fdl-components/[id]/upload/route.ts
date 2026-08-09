import { NextResponse } from "next/server";
import { getFdlComponent } from "@/lib/offerings";
import { canManageOfferings } from "@/lib/role";
import { uploadMaterialFile, MAX_UPLOAD_BYTES } from "@/lib/materialStorage";
import { getCurrentUser } from "@/lib/currentUser";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Filenames whose extension means the browser can render it inline. */
const IMAGE = /\.(png|jpe?g|gif|webp|svg|heic|avif)$/i;

/**
 * A FILE PINNED TO A FEATURE (Suren, Aug 9: "for all these features, if they
 * can add some document or an image, can you allow it to add?").
 *
 * Same shape as the sales-material upload: the bytes go to managed storage
 * here, the response hands back a URL, and the client attaches it to the
 * feature through the normal component PATCH. Keeping the write on one path
 * means attribution and persistence behave identically for both.
 *
 * Gated on canManageOfferings, which is the same permission that already
 * governs every other edit to an FDL component. It does not widen who can
 * change what.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!getFdlComponent(id))
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canManageOfferings()))
    return NextResponse.json(
      { error: "You do not have permission to change this component." },
      { status: 403 }
    );

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Could not read that upload." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File) || !file.size)
    return NextResponse.json({ error: "Pick a file first." }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES)
    return NextResponse.json(
      {
        error: `That file is too big. The limit is ${Math.floor(
          MAX_UPLOAD_BYTES / (1024 * 1024)
        )} MB.`,
      },
      { status: 400 }
    );

  try {
    const me = await getCurrentUser();
    // Storage is keyed by owning record; a component's files sit under its own
    // id so they never collide with an offering's materials.
    const saved = await uploadMaterialFile(`fdl-${id}`, file, me.name, {
      allowImages: true,
    });
    // uploadMaterialFile builds an OFFERINGS download URL from the id it is
    // given, and `fdl-<id>` is not an offering, so that URL 404s on read.
    // Point at this component's own file route instead, deriving the object
    // path from what storage actually wrote.
    const path =
      saved.docsPath ||
      new URL(saved.url, "http://x").searchParams.get("path") ||
      "";
    return NextResponse.json({
      ok: true,
      attachment: {
        id: `att-${Date.now().toString(36)}`,
        name: saved.filename || file.name,
        url: `/api/fdl-components/${id}/files?path=${encodeURIComponent(path)}`,
        kind: IMAGE.test(file.name) ? "image" : "document",
      },
    });
  } catch (caught) {
    return NextResponse.json(
      {
        error:
          caught instanceof Error ? caught.message : "Could not upload that file.",
      },
      { status: 400 }
    );
  }
}
