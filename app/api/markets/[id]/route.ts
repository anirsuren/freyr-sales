import { NextResponse } from "next/server";
import { deleteMarket, commitOfferingsChange } from "@/lib/offerings";
import { canManageOfferings } from "@/lib/role";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await canManageOfferings()))
    return NextResponse.json(
      { error: "View only — admin access required" },
      { status: 403 }
    );
  const { id } = await params;
  try {
    const ok = await commitOfferingsChange(() => deleteMarket(id));
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Market delete failed" },
      { status: 503 }
    );
  }
}
