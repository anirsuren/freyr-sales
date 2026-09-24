import { NextRequest, NextResponse } from "next/server";
import { verifiedRequestMemberScope } from "@/lib/memberScope";
import { getCurrentUser } from "@/lib/currentUser";
import { canOpenModule, moduleWriteRefusal } from "@/lib/moduleAccessServer";
import { ensureCustomerAccount } from "@/lib/ensureCustomerAccount";
import { linkLeadsToCustomer } from "@/lib/leads";
import { getDb } from "@/lib/db";

export async function POST(req: NextRequest) {
  if (!(await verifiedRequestMemberScope(req))) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!(await canOpenModule("/customers"))) return NextResponse.json({ error: "Customer accounts are not available on this account." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Enter a company name." }, { status: 400 });
  try {
    const existing = (await getDb().customers.list()).find((item) => item.company_name.trim().toLocaleLowerCase() === name.toLocaleLowerCase());
    const canWriteSource = (await Promise.all(["/leads", "/opportunities", "/solutioning"].map(moduleWriteRefusal))).some((refusal) => !refusal);
    if (!existing && !canWriteSource) return NextResponse.json({ error: "You cannot create customer accounts." }, { status: 403 });
    const me = await getCurrentUser();
    const account = existing ?? await ensureCustomerAccount(name, null, me.name);
    if (!(await moduleWriteRefusal("/leads"))) await linkLeadsToCustomer(name, account.id);
    return NextResponse.json({ id: account.id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not open the company." }, { status: 400 });
  }
}
