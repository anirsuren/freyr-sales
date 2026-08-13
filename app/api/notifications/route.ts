import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { buildNotifications } from "@/lib/notifications";
import { listStoredVoiceConversations } from "@/lib/voiceEvents";
import { currentUserSetupNudges } from "@/lib/setupNudges";
import { getDataMode } from "@/lib/dataMode";
import { isOfferingsOnly } from "@/lib/release";

export const dynamic = "force-dynamic";

export async function GET() {
  const nudges = await currentUserSetupNudges();

  /**
   * IN THE LIVE WORKSPACE, TWO ROWS AND NOTHING ELSE (Anir, Aug 13:
   * "realistically, the only two notifications should be if they have not taken
   * the product tour and if they have not set up Touch ID. It should just be
   * notifications like that. It's pretty simple").
   *
   * The other rows are derived from pipeline work — reviews waiting, follow-ups
   * due, calls that failed — and during the pilot none of that exists yet, so
   * they were either silent or, worse, about demo records. Everything
   * data-derived is skipped here, which also means the bell stops reading the
   * database every fifteen seconds to conclude there is nothing to say.
   */
  if (isOfferingsOnly(getDataMode())) {
    return NextResponse.json({
      notifications: buildNotifications({
        sessions: [],
        customers: [],
        contacts: [],
        interactions: [],
        ...nudges,
      }),
    });
  }

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
    ...nudges,
  });
  return NextResponse.json({ notifications });
}
