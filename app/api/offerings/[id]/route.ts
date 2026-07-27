import { NextResponse } from "next/server";
import {
  getOffering,
  updateOffering,
  deleteOffering,
  hydrateOffering,
  commitOfferingsChange,
} from "@/lib/offerings";
import { canManageOfferings } from "@/lib/role";

export const dynamic = "force-dynamic";

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
