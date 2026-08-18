import { NextResponse } from "next/server";
import { deleteMarket, updateMarket, commitOfferingsChange } from "@/lib/offerings";
import { canManageOfferings, isAdmin } from "@/lib/role";

export const dynamic = "force-dynamic";

/**
 * RENAMING A MARKET (Saras, Aug 14, change log #37).
 *
 * Admin only, deliberately narrower than the DELETE below it, which stays on
 * canManageOfferings exactly as it already was. Saras asked for admin; who
 * else gets it is Anir's call, not this route's.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdmin()))
    return NextResponse.json(
      { error: "View only: admin access required" },
      { status: 403 }
    );
  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  if (!name)
    return NextResponse.json({ error: "A market needs a name." }, { status: 400 });
  const { id } = await params;
  try {
    const market = await commitOfferingsChange(() => updateMarket(id, name));
    if (!market)
      return NextResponse.json(
        { error: `Could not rename to "${name}". That market may already exist.` },
        { status: 409 }
      );
    return NextResponse.json({ ok: true, market });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Market rename failed" },
      { status: 503 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await canManageOfferings()))
    return NextResponse.json(
      { error: "View only: admin access required" },
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
