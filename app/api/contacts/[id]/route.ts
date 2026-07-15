import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = getDb();
  const contact = await db.contacts.get((await params).id);
  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }
  const customer = await db.customers.get(contact.customer_id);
  const sessions = await db.pitchSessions.list(undefined, (await params).id);
  const interactions = await db.interactions.list(undefined, (await params).id);

  return NextResponse.json({ contact, customer, sessions, interactions });
}
