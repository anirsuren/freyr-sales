import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { buildNotifications } from "@/lib/notifications";
import { listStoredVoiceConversations } from "@/lib/voiceEvents";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();
  const [sessions, customers, contacts, interactions, voiceConversations] = await Promise.all([
    db.pitchSessions.list(),
    db.customers.list(),
    db.contacts.list(),
    db.interactions.list(),
    listStoredVoiceConversations(30),
  ]);
  const notifications = buildNotifications({
    sessions,
    customers,
    contacts,
    interactions,
    voiceConversations,
  });
  return NextResponse.json({ notifications });
}
