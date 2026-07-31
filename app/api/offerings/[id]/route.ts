import { NextResponse } from "next/server";
import {
  getOffering,
  updateOffering,
  deleteOffering,
  hydrateOffering,
  commitOfferingsChange,
} from "@/lib/offerings";
import { canManageOfferings } from "@/lib/role";
import { forgetMaterialText } from "@/lib/materialText";
import { canEditOffering } from "@/lib/offeringOwnership";
import { getCurrentUser } from "@/lib/currentUser";
import { GENERIC_USER_IDENTITY } from "@/lib/userIdentity";
import {
  canViewNextCustomerVersion,
  hideNextCustomerVersions,
} from "@/lib/roadmapAccess";
import {
  stampMaterialAttribution,
  isFixedMaterialFolder,
  type OfferingMaterial,
} from "@/lib/offeringMaterials";

export const dynamic = "force-dynamic";

/**
 * The signed-in member's display name, or null when the session carries no
 * verified identity. Null means "we don't know who this is" — the caller must
 * then leave the attribution blank rather than credit a placeholder.
 */
async function uploaderName(): Promise<string | null> {
  const user = await getCurrentUser();
  if (user.id === GENERIC_USER_IDENTITY.id) return null;
  return user.name.trim() || null;
}

const FORBIDDEN = NextResponse.json(
  { error: "Take ownership of this offering to edit it, or ask an admin" },
  { status: 403 }
);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const offering = getOffering((await params).id);
  if (!offering) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const hydrated = hydrateOffering(offering);
  return NextResponse.json({
    offering: (await canViewNextCustomerVersion(offering))
      ? hydrated
      : hideNextCustomerVersions(hydrated),
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const { id } = await params;
  // ONE rule for every write: you must own this offering. Uploading a sales
  // material is editing the offering's content, so it goes through the same
  // gate rather than the old "any signed-in member may attach materials"
  // shortcut, which let anyone in the workspace change any offering's assets.
  // An owner is granted by an admin; an admin claims instantly for themselves.
  // Resolved from the STORED offering, never the request body, so a caller
  // cannot hand themselves ownership by posting a new POC.
  const existing = getOffering(id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canEditOffering(existing))) return FORBIDDEN;
  if (Array.isArray(body.materialFolders)) {
    const invalid = body.materialFolders.find(
      (folder) => !isFixedMaterialFolder(folder)
    );
    if (invalid) {
      return NextResponse.json(
        { error: "Choose a folder from the workspace's fixed list." },
        { status: 400 }
      );
    }
  }
  if (Array.isArray(body.materials)) {
    const incoming = body.materials as OfferingMaterial[];
    const invalidFolder = incoming.find((material) => {
      if (isFixedMaterialFolder(material.folder)) return false;
      const prior = existing.materials.find(
        (saved) =>
          (material.id && saved.id === material.id) ||
          (!material.id &&
            saved.kind === material.kind &&
            saved.label === material.label &&
            saved.url === material.url)
      );
      // Grandfather existing unfiled/custom-folder rows until an owner moves
      // them. New uploads must always use the approved fixed taxonomy.
      return !prior || (material.folder || "") !== (prior.folder || "");
    });
    if (invalidFolder) {
      return NextResponse.json(
        { error: "Choose a folder from the workspace's fixed list." },
        { status: 400 }
      );
    }
  }
  // "Who added this" is stamped here, from the session — never from the body.
  // Existing rows keep the attribution already on file, so re-saving the list
  // (which every material edit does) can't re-credit someone else's upload.
  if (Array.isArray(body.materials)) {
    body.materials = stampMaterialAttribution(
      body.materials as OfferingMaterial[],
      getOffering(id)?.materials ?? [],
      await uploaderName()
    );
  }
  // A material that is being REMOVED takes its extracted text with it: the
  // assistant must stop answering from a deck the owner just deleted.
  const droppedPaths = Array.isArray(body.materials)
    ? existing.materials
        .map((m) => m.docsPath)
        .filter(
          (p): p is string =>
            !!p &&
            !(body.materials as OfferingMaterial[]).some(
              (m) => m.docsPath === p
            )
        )
    : [];

  try {
    const offering = await commitOfferingsChange(() => updateOffering(id, body));
    if (!offering) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (droppedPaths.length)
      await forgetMaterialText(droppedPaths).catch(() => undefined);
    return NextResponse.json({ ok: true, offering });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Offering save failed" },
      { status: 503 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await canManageOfferings())) return FORBIDDEN;
  const { id } = await params;
  try {
    const ok = await commitOfferingsChange(() => deleteOffering(id));
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Offering delete failed" },
      { status: 503 }
    );
  }
}
