import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { buildNotifications } from "@/lib/notifications";
import { listStoredVoiceConversations } from "@/lib/voiceEvents";
import { currentUserSetupNudges } from "@/lib/setupNudges";
import { getDataMode } from "@/lib/dataMode";
import { roadmapChangesForReader } from "@/lib/roadmapNotices";
import { isOfferingsOnly } from "@/lib/release";
import { readPerformance } from "@/lib/performance";
import { getCurrentUser } from "@/lib/currentUser";

export const dynamic = "force-dynamic";


/**
 * The performance slice of the bell, for whoever is signed in. Read once and
 * handed to both surfaces so the bell and the notifications page can never
 * disagree about what is waiting on you.
 */
async function performanceForMe() {
  try {
    const [state, me] = await Promise.all([readPerformance(), getCurrentUser()]);
    return { state, me: me.name };
  } catch {
    return null;
  }
}

export async function GET() {
  const [nudges, performance] = await Promise.all([
    currentUserSetupNudges(),
    performanceForMe(),
  ]);

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
        performance,
        // A roadmap change is news about an OFFERING, so it belongs in the one
        // workspace that is offerings-only just as much as anywhere else.
        roadmaps: await roadmapChangesForReader(),
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
    performance,
    roadmaps: await roadmapChangesForReader(),
    ...nudges,
  });
  return NextResponse.json({ notifications });
}
