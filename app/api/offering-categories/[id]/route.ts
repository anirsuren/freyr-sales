import { NextResponse } from "next/server";
import {
  updateOfferingCategory,
  deleteOfferingCategory,
} from "@/lib/offerings";
import { isAdmin } from "@/lib/role";

export const dynamic = "force-dynamic";

const FORBIDDEN = NextResponse.json(
  { error: "View only — admin access required" },
  { status: 403 }
);

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  if (!isAdmin()) return FORBIDDEN;
  const body = await req.json().catch(() => ({}));
  const data: { name?: string; description?: string; owner?: string } = {};
  if (body.name != null) data.name = String(body.name);
  if (body.description != null) data.description = String(body.description);
  if (body.owner != null) data.owner = String(body.owner);
  const offeringCategory = updateOfferingCategory(params.id, data);
  if (!offeringCategory)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, offeringCategory });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  if (!isAdmin()) return FORBIDDEN;
  const ok = deleteOfferingCategory(params.id);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
