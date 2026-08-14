import { NextResponse } from "next/server";
import {
  updateCustomerType,
  commitOfferingsChange,
  type CustomerFamily,
  type CustomerSize,
} from "@/lib/offerings";
import { isAdmin } from "@/lib/role";

export const dynamic = "force-dynamic";

/**
 * EDITING AN EXISTING CUSTOMER TYPE.
 *
 * Until now this master list could only be added to. `updateCustomerType` had
 * existed in lib/offerings for months with nothing calling it, so a typo in a
 * definition was permanent for everybody (Saras, Aug 14, change log #37:
 * "content currently not editable at any user level").
 *
 * ADMIN ONLY, deliberately narrower than the Add control beside it, which is
 * canManageOfferings (admin + manager). Saras asked for admin; widening that
 * to managers is a permissions decision and belongs to Anir, not to this
 * route. Both gates live on one screen, so if he wants them the same, this is
 * the line to change.
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
  const data: Partial<{
    name: string;
    family: CustomerFamily;
    size: CustomerSize;
    product_type: string;
    revenue: string;
    employees: string;
    operational_focus: string;
  }> = {};
  // Only carry through what was actually sent. A field the editor did not
  // touch must keep its stored value rather than being blanked by an absent
  // key, which is the failure mode every normalizer in this codebase warns
  // about.
  if (body.product_type != null) data.product_type = String(body.product_type);
  if (body.revenue != null) data.revenue = String(body.revenue);
  if (body.employees != null) data.employees = String(body.employees);
  if (body.operational_focus != null)
    data.operational_focus = String(body.operational_focus);

  // Family and size together ARE the identity of a customer type, and the
  // display name is derived from them, so they move as one unit and the name
  // is recomputed rather than typed. Changing either to a pair that already
  // exists would create the duplicate createCustomerType refuses to make.
  const family = body.family != null ? String(body.family).trim() : null;
  const size = body.size != null ? String(body.size).trim() : null;
  if (family) data.family = family as CustomerFamily;
  if (size) data.size = size as CustomerSize;
  if (family || size) {
    const { listCustomerTypes } = await import("@/lib/offerings");
    const { id: target } = await params;
    const current = listCustomerTypes().find((c) => c.id === target);
    if (!current)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    const nextFamily = family || current.family;
    const nextSize = size || current.size;
    const clash = listCustomerTypes().some(
      (c) => c.id !== target && c.family === nextFamily && c.size === nextSize
    );
    if (clash)
      return NextResponse.json(
        { error: `${nextFamily} - ${nextSize} already exists.` },
        { status: 409 }
      );
    data.name = `${nextFamily} - ${nextSize}`;
  }

  const { id } = await params;
  try {
    const customerType = await commitOfferingsChange(() =>
      updateCustomerType(id, data)
    );
    if (!customerType)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, customerType });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Customer type save failed",
      },
      { status: 503 }
    );
  }
}
