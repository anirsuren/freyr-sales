import { NextResponse } from "next/server";
import { deleteMarket } from "@/lib/offerings";
import { isAdmin } from "@/lib/role";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  if (!isAdmin())
    return NextResponse.json(
      { error: "View only — admin access required" },
      { status: 403 }
    );
  const ok = deleteMarket(params.id);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
