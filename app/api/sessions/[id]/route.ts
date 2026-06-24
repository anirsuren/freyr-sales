import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const db = getDb();
  const session = await db.pitchSessions.get(params.id);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  const customer = await db.customers.get(session.customer_id);
  const contact = await db.contacts.get(session.contact_id);
  const interactions = await db.interactions.list(undefined, session.contact_id);

  return NextResponse.json({ session, customer, contact, interactions });
}
