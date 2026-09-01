import { NextResponse } from "next/server";
import {
  deleteCustomerType,
  listCustomerTypes,
  listOfferings,
  commitOfferingsChange,
} from "@/lib/offerings";
import { canManageOfferings } from "@/lib/role";
import { moduleDeleteRefusal } from "@/lib/moduleAccessServer";

export const dynamic = "force-dynamic";

/**
 * REMOVE A CUSTOMER TYPE.
 *
 * Found in the loop, Sep 1: /api/customer-types had GET and POST and nothing
 * else, and the page has an "Add customer type" button — so a customer type
 * could be created and never removed, by anybody, ever. That is the asymmetry
 * Anir called a problem on contacts: "if I can't delete one, that's a problem."
 *
 * REFUSES WHILE ANYTHING USES IT. deleteCustomerType strips the id off every
 * offering, the way deleteMarket does, but a customer type is who an offering
 * is FOR — quietly retargeting somebody's offering is not a side effect a
 * delete button should have. So the route checks first and says who is using
 * it, and the page only draws the control on a type with no offerings.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  /* Deleting is its own permission, asked the way every other module asks. */
  const refusal = await moduleDeleteRefusal("/customers");
  if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });

  if (!(await canManageOfferings()))
    return NextResponse.json(
      { error: "View only: admin access required" },
      { status: 403 }
    );

  const { id } = await params;
  if (!listCustomerTypes().some((t) => t.id === id))
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const inUse = listOfferings().filter((o) =>
    (o.customer_type_ids ?? []).includes(id)
  );
  if (inUse.length) {
    return NextResponse.json(
      {
        error:
          inUse.length === 1
            ? `${inUse[0].offering_name} is still for this customer type. Take it off there first.`
            : `${inUse.length} offerings are still for this customer type. Take it off them first.`,
      },
      { status: 409 }
    );
  }

  try {
    const ok = await commitOfferingsChange(() => deleteCustomerType(id));
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Customer type delete failed",
      },
      { status: 503 }
    );
  }
}
