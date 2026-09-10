import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { moduleWriteRefusal, recordWriteRefusal } from "@/lib/moduleAccessServer";
import { readCustomerProfiles, setCustomerProfile } from "@/lib/customerProfiles";
import { addressIsComplete, normalizeAddress } from "@/lib/customerProfilesShared";

export const dynamic = "force-dynamic";

/**
 * A CUSTOMER'S ADDRESSES AND PARENT COMPANY, EDITED (Manoj, Sep 10). The same
 * two locks the account's own PATCH has: write on Customers, and write on this
 * account. An address may be left empty, but a started one has to have line
 * 1, a city and a country. A parent can never be the customer itself, or a
 * customer that already sits under it.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const refusal = await moduleWriteRefusal("/customers");
  if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });

  const db = getDb();
  const customer = await db.customers.get((await params).id);
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  const recordRefusal = await recordWriteRefusal("/customers", {
    id: customer.id,
    owner: customer.owner,
    owner_user_id: customer.owner_user_id,
    created_by: customer.created_by,
  });
  if (recordRefusal) return NextResponse.json({ error: recordRefusal }, { status: 403 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Bad request." }, { status: 400 });

  const hq = normalizeAddress(body.hq);
  if (hq && !addressIsComplete(hq))
    return NextResponse.json({ error: "Finish the HQ address with line 1, a city and a country, or clear it." }, { status: 400 });
  const other = normalizeAddress(body.other);
  if (other && !addressIsComplete(other))
    return NextResponse.json({ error: "Finish the other address with line 1, a city and a country, or clear it." }, { status: 400 });

  const raw = typeof body.parentId === "string" ? body.parentId.trim() : "";
  let parentId: string | null = null;
  if (raw && raw !== "NA") {
    if (raw === customer.id)
      return NextResponse.json({ error: "A customer cannot be its own parent company." }, { status: 400 });
    const parent = await db.customers.get(raw).catch(() => null);
    if (!parent)
      return NextResponse.json({ error: "That parent company is not a customer any more." }, { status: 400 });
    const { profiles } = await readCustomerProfiles();
    let cursor: string | undefined = parent.id;
    for (let hops = 0; cursor && hops < 50; hops++) {
      if (cursor === customer.id)
        return NextResponse.json(
          { error: `${parent.company_name} already sits under ${customer.company_name}, so it cannot be its parent.` },
          { status: 400 }
        );
      cursor = profiles[cursor]?.parentId;
    }
    parentId = parent.id;
  }

  const profile = await setCustomerProfile(customer.id, { hq: hq ?? null, other: other ?? null, parentId });
  return NextResponse.json({ ok: true, profile });
}
