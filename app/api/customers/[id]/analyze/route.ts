import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { analyzeCustomer } from "@/lib/customerAnalysis";

export const dynamic = "force-dynamic";

// POST: run "Analyze the customer" — qualify the account against the offerings
// customer-type definitions and propose customer type / ownership / revenue. This
// only PROPOSES; the user approves (a PATCH) before it's saved (Suren's ask).
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = getDb();
  const customer = await db.customers.get((await params).id);
  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }
  const analysis = await analyzeCustomer(customer);
  return NextResponse.json({ ok: true, analysis });
}
