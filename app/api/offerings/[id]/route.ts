import { NextResponse } from "next/server";
import {
  getOffering,
  updateOffering,
  deleteOffering,
  hydrateOffering,
} from "@/lib/offerings";
import { isAdmin } from "@/lib/role";

export const dynamic = "force-dynamic";

const FORBIDDEN = NextResponse.json(
  { error: "View only — admin access required" },
  { status: 403 }
);

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const offering = getOffering(params.id);
  if (!offering) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ offering: hydrateOffering(offering) });
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  if (!isAdmin()) return FORBIDDEN;
  const body = await req.json().catch(() => ({}));
  const offering = updateOffering(params.id, body);
  if (!offering) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, offering });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  if (!isAdmin()) return FORBIDDEN;
  const ok = deleteOffering(params.id);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
