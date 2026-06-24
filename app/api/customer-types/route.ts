import { NextResponse } from "next/server";
import {
  listCustomerTypes,
  createCustomerType,
  type CustomerFamily,
  type CustomerSize,
} from "@/lib/offerings";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ customerTypes: listCustomerTypes() });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const family = String(body.family || "").trim() as CustomerFamily;
  const size = String(body.size || "").trim() as CustomerSize;
  if (!family || !size) {
    return NextResponse.json(
      { error: "family and size are required" },
      { status: 400 }
    );
  }
  const customerType = createCustomerType({
    name: `${family} - ${size}`,
    family,
    size,
    product_type: String(body.product_type || ""),
    revenue: String(body.revenue || ""),
    employees: String(body.employees || ""),
    operational_focus: String(body.operational_focus || ""),
  });
  return NextResponse.json({ ok: true, customerType });
}
