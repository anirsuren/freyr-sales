import { NextResponse } from "next/server";
import {
  updateOfferingCategory,
  deleteOfferingCategory,
  commitOfferingsChange,
} from "@/lib/offerings";
import { canManageOfferings } from "@/lib/role";

export const dynamic = "force-dynamic";

const FORBIDDEN = NextResponse.json(
  { error: "View only — admin access required" },
  { status: 403 }
);

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await canManageOfferings())) return FORBIDDEN;
  const body = await req.json().catch(() => ({}));
  const data: { name?: string; description?: string; owner?: string } = {};
  if (body.name != null) data.name = String(body.name);
  if (body.description != null) data.description = String(body.description);
  if (body.owner != null) data.owner = String(body.owner);
  const { id } = await params;
  try {
    const offeringCategory = await commitOfferingsChange(() =>
      updateOfferingCategory(id, data)
    );
    if (!offeringCategory)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, offeringCategory });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Offering category save failed" },
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
    const ok = await commitOfferingsChange(() => deleteOfferingCategory(id));
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Offering category delete failed" },
      { status: 503 }
    );
  }
}
