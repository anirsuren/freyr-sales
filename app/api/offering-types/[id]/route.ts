import { NextResponse } from "next/server";
import { updateOfferingType, deleteOfferingType } from "@/lib/offerings";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const body = await req.json().catch(() => ({}));
  const data: { name?: string; description?: string } = {};
  if (body.name != null) data.name = String(body.name);
  if (body.description != null) data.description = String(body.description);
  const offeringType = updateOfferingType(params.id, data);
  if (!offeringType)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, offeringType });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const ok = deleteOfferingType(params.id);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
