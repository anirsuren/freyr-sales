import { getDb } from "@/lib/db";
import { PageHeader } from "@/components/layout/PageHeader";
import { buildNotifications } from "@/lib/notifications";
import { NotificationsCenter } from "@/components/notifications/NotificationsCenter";
import { listStoredVoiceConversations } from "@/lib/voiceEvents";

export const metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const db = getDb();
  const [sessions, customers, contacts, interactions, voiceConversations] = await Promise.all([
    db.pitchSessions.list(),
    db.customers.list(),
    db.contacts.list(),
    db.interactions.list(),
    listStoredVoiceConversations(30),
  ]);
  const items = buildNotifications({ sessions, customers, contacts, interactions, voiceConversations });

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
