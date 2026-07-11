import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

// Lightweight name→id index so the assistant chat can turn company/person names
// in its answers into inline entity pills (logo/headshot + link). Suren: "the
// AI answers should show the little logos and faces, not just plain text."
export async function GET() {
  const db = getDb();
  const [customers, contacts] = await Promise.all([
    db.customers.list(),
    db.contacts.list(),
  ]);
  return NextResponse.json({
    companies: customers.map((c) => ({ name: c.company_name, id: c.id })),
    contacts: contacts.map((c) => ({ name: c.full_name, id: c.id })),
  });
}
