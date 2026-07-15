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
  if (!(await canManageOfferings())) return FORBIDDEN;
  const body = await req.json().catch(() => ({}));
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
