import { roadmapChangesForReader } from "@/lib/roadmapNotices";
import { getDb } from "@/lib/db";
import { PageHeader } from "@/components/layout/PageHeader";
import { buildNotifications } from "@/lib/notifications";
import { NotificationsCenter } from "@/components/notifications/NotificationsCenter";
import { listStoredVoiceConversations } from "@/lib/voiceEvents";
import { currentUserSetupNudges } from "@/lib/setupNudges";
import { getDataMode } from "@/lib/dataMode";
import { isOfferingsOnly } from "@/lib/release";
import { readPerformance } from "@/lib/performance";
import { getCurrentUser } from "@/lib/currentUser";

export const metadata = { title: "Notifications" };
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

export default async function NotificationsPage() {
  /**
   * THE SAME LIST THE BELL SHOWS.
   *
   * This page used to run its own query and its own smaller set of checks, so
   * the two setup rows in the bell panel were simply absent here and the link
   * under them appeared to do nothing (Anir, Aug 13: "pressing 'View all
   * notifications' doesn't even work"). Both surfaces now read the same
   * nudges and honour the same live-workspace rule.
   */
  const [nudges, performance, roadmaps] = await Promise.all([
    currentUserSetupNudges(),
    performanceForMe(),
    roadmapChangesForReader(),
  ]);

  if (isOfferingsOnly(getDataMode())) {
    const items = buildNotifications({
      sessions: [],
      customers: [],
      contacts: [],
      interactions: [],
      performance,
      roadmaps,
      ...nudges,
    });
    return (
      <div>
        <PageHeader
          title="Notifications"
          subtitle="Anything still waiting on you."
        />
        <NotificationsCenter items={items} />
      </div>
    );
  }

  const db = getDb();
  const [sessions, customers, contacts, interactions, voiceConversations] = await Promise.all([
    db.pitchSessions.list(),
    db.customers.list(),
    db.contacts.list(),
    db.interactions.list(),
    listStoredVoiceConversations(30),
  ]);
  const items = buildNotifications({ sessions, customers, contacts, interactions, voiceConversations, performance, roadmaps, ...nudges });

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle="Pitches to approve, deals going cold, and fresh buying signals."
      />
      <NotificationsCenter items={items} />
    </div>
  );
}
