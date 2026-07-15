import { NextResponse } from "next/server";
import {
  updateOfferingType,
  deleteOfferingType,
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
  const data: { name?: string; description?: string } = {};
  if (body.name != null) data.name = String(body.name);
  if (body.description != null) data.description = String(body.description);
  const { id } = await params;
  try {
    const offeringType = await commitOfferingsChange(() => updateOfferingType(id, data));
    if (!offeringType)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, offeringType });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Offering type save failed" },
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
    const ok = await commitOfferingsChange(() => deleteOfferingType(id));
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Offering type delete failed" },
      { status: 503 }
    );
  }
}
