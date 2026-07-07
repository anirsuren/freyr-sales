import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { buildNotifications } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();
  const [sessions, customers, contacts, interactions] = await Promise.all([
    db.pitchSessions.list(),
    db.customers.list(),
    db.contacts.list(),
    db.interactions.list(),
  ]);
  const notifications = buildNotifications({
    sessions,
    customers,
    contacts,
    interactions,
  });
  return NextResponse.json({ notifications });
}
