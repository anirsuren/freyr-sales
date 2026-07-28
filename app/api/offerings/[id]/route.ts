import { NextResponse } from "next/server";
import {
  getOffering,
  updateOffering,
  deleteOffering,
  hydrateOffering,
  commitOfferingsChange,
} from "@/lib/offerings";
import { canManageOfferings } from "@/lib/role";
import { getCurrentUser } from "@/lib/currentUser";
import { GENERIC_USER_IDENTITY } from "@/lib/userIdentity";
import {
  stampMaterialAttribution,
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
  { error: "View only — admin access required" },
  { status: 403 }
);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const offering = getOffering((await params).id);
  if (!offering) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ offering: hydrateOffering(offering) });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  // Sales-material uploads are open to every signed-in workspace member —
  // offering owners (Eeswar first, for Freya.Register) join via domain
  // auto-join as "sales" and must be able to upload their own assets without
  // waiting for an admin grant (Jul 27 call: "all he would need right now is
  // access to upload the materials on this page"). The middleware has already
  // authenticated the request. Everything else about an offering — name,
  // descriptions, mappings, delete — remains admin/editor only.
  const materialsOnly =
    Object.keys(body).length === 1 && Array.isArray(body.materials);
  if (!materialsOnly && !(await canManageOfferings())) return FORBIDDEN;
  const { id } = await params;
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
  try {
    const offering = await commitOfferingsChange(() => updateOffering(id, body));
    if (!offering) return NextResponse.json({ error: "Not found" }, { status: 404 });
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
