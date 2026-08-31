import { roadmapChangesForReader } from "@/lib/roadmapNotices";
import { getDb } from "@/lib/db";
import { PageHeader } from "@/components/layout/PageHeader";
import { buildNotifications } from "@/lib/notifications";
import { readSolutioning } from "@/lib/solutioning";
import { canOpenModule } from "@/lib/moduleAccessServer";
import { NotificationsCenter } from "@/components/notifications/NotificationsCenter";
import { listStoredVoiceConversations } from "@/lib/voiceEvents";
import { currentUserSetupNudges } from "@/lib/setupNudges";
import { getDataMode } from "@/lib/dataMode";
import { isOfferingsOnly } from "@/lib/release";
import { readPerformance } from "@/lib/performance";
import { getCurrentUser } from "@/lib/currentUser";
import { RoadmapEmailSettings } from "@/components/notifications/RoadmapEmailSettings";
import { initializeLiveOfferings, listFdlComponents, listOfferings } from "@/lib/offerings";

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

/**
 * Everything a person could be following, so the settings block can name what
 * they DO follow instead of printing ids. Read on the server with the rest of
 * the page: the client half only ever fetches the subscription itself.
 */
async function followableRoadmaps() {
  try {
    await initializeLiveOfferings().catch(() => undefined);
    return [
      ...listFdlComponents().map((c) => ({
        kind: "component" as const,
        id: c.id,
        name: c.name,
        href: `/components/${c.id}`,
      })),
      ...listOfferings().map((o) => ({
        kind: "offering" as const,
        id: o.id,
        name: o.offering_name,
        href: `/offerings/${o.id}`,
      })),
    ];
  } catch {
    return [];
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
  const [nudges, performance, roadmaps, followable] = await Promise.all([
    currentUserSetupNudges(),
    performanceForMe(),
    roadmapChangesForReader(),
    followableRoadmaps(),
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
        <RoadmapEmailSettings followable={followable} />
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
  /* SOL-031, the same shape the bell's API uses — one derivation, so the page
     and the badge can never disagree about what is waiting on you. */
  const me = await getCurrentUser();
  const solutioning = (await canOpenModule("/solutioning"))
    ? {
        me: me.name,
        requests: (await readSolutioning().catch(() => ({ requests: [] }))).requests.map(
          (r) => ({
            id: r.id,
            ref: r.ref,
            title: r.title,
            customer: r.customer,
            type: r.type,
            status: r.status,
            deliverableStatus: r.deliverableStatus,
            neededBy: r.neededBy,
            requestedBy: r.requestedBy,
            owner: r.owner,
            updatedAt: r.updatedAt,
            requestedAt: r.requestedAt,
            workstreams: r.workstreams,
          })
        ),
      }
    : null;
  const items = buildNotifications({ sessions, customers, contacts, interactions, voiceConversations, performance, roadmaps, solutioning, ...nudges });

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle="Pitches to approve, deals going cold, and fresh buying signals."
      />
      <RoadmapEmailSettings followable={followable} />
      <NotificationsCenter items={items} />
    </div>
  );
}
