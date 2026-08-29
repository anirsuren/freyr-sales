import { NextResponse } from "next/server";
import {
  listCustomerTypes,
  createCustomerType,
  commitOfferingsChange,
  type CustomerFamily,
  type CustomerSize,
} from "@/lib/offerings";
import { canManageOfferings } from "@/lib/role";
import { moduleWriteRefusal } from "@/lib/moduleAccessServer";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ customerTypes: listCustomerTypes() });
}

export async function POST(req: Request) {
  /* WRITE IS ITS OWN PERMISSION (Suren, Aug 29). Refuses before the
     handler reads a body, so a person who may READ this module cannot
     change it. Falls through to the old role rules while the privilege
     table is not being enforced. */
  {
    const refusal = await moduleWriteRefusal("/customers");
    if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });
  }

  if (!(await canManageOfferings()))
    return NextResponse.json(
      { error: "View only: admin access required" },
      { status: 403 }
    );
  const body = (await req.json().catch(() => ({}))) ?? {};
  const family = String(body.family || "").trim() as CustomerFamily;
  const size = String(body.size || "").trim() as CustomerSize;
  if (!family || !size) {
    return NextResponse.json(
      { error: "family and size are required" },
      { status: 400 }
    );
  }
  try {
    const customerType = await commitOfferingsChange(() =>
      createCustomerType({
        name: `${family} - ${size}`,
        family,
        size,
        product_type: String(body.product_type || ""),
        revenue: String(body.revenue || ""),
        employees: String(body.employees || ""),
        operational_focus: String(body.operational_focus || ""),
      })
    );
    return NextResponse.json({ ok: true, customerType });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Customer type save failed" },
      { status: 503 }
    );
  }
}
