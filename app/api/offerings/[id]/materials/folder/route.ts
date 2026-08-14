import { NextResponse } from "next/server";
import {
  getOffering,
  renameMaterialFolder,
  commitOfferingsChange,
} from "@/lib/offerings";
import {
  isFixedMaterialFolder,
  materialFolderLabel,
  sanitizeMaterialFolderPath,
} from "@/lib/offeringMaterials";
import { isAdmin } from "@/lib/role";

export const dynamic = "force-dynamic";

/**
 * RENAMING A SALES-MATERIAL FOLDER (Saras, Aug 14, change log #38: folder
 * names "currently not editable at any user level").
 *
 * Its own endpoint rather than a shape passed through the generic offering
 * PATCH, for two reasons. The rename has to move every nested path in one
 * write, which is a server job, not something a client should assemble from
 * whatever materials it happens to be holding. And the generic PATCH is gated
 * on canEditOffering, which includes offering owners — Saras asked for admin,
 * and quietly widening that on the way past is not this route's decision.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdmin()))
    return NextResponse.json(
      { error: "Admin access is required to rename a folder." },
      { status: 403 }
    );
  const { id } = await params;
  const offering = getOffering(id);
  if (!offering)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const from = sanitizeMaterialFolderPath(body.from);
  const to = sanitizeMaterialFolderPath(body.to);
  if (!from || !to)
    return NextResponse.json(
      { error: "Both the current folder and the new name are required." },
      { status: 400 }
    );
  if (from === to)
    return NextResponse.json({ ok: true, moved: 0, folder: to });

  // Say WHICH rule refused, so the message on screen is actionable rather than
  // a generic failure. The data layer returns a bare null for all of these.
  if (isFixedMaterialFolder(from))
    return NextResponse.json(
      {
        error: `"${materialFolderLabel(from)}" is one of Freyr's standard folders, so its name is fixed for every offering. Folders you created yourself can be renamed.`,
      },
      { status: 409 }
    );
  if (isFixedMaterialFolder(to))
    return NextResponse.json(
      {
        error: `"${materialFolderLabel(to)}" is one of Freyr's standard folders. Pick a different name.`,
      },
      { status: 409 }
    );

  try {
    const result = await commitOfferingsChange(() =>
      renameMaterialFolder(id, from, to)
    );
    if (!result)
      return NextResponse.json(
        { error: `Could not rename to "${to}" — a folder by that name may already exist.` },
        { status: 409 }
      );
    return NextResponse.json({ ok: true, moved: result.moved, folder: to });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Folder rename failed" },
      { status: 503 }
    );
  }
}
