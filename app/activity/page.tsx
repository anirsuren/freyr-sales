import { getDb } from "@/lib/db";
import { PageHeader } from "@/components/layout/PageHeader";
import { ActivityFeed, type ActivityItem } from "@/components/activity/ActivityFeed";

export const metadata = { title: "Activity" };
export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const db = getDb();
  const [interactions, customers, contacts] = await Promise.all([
    db.interactions.list(),
    db.customers.list(),
    db.contacts.list(),
  ]);

  const custById = Object.fromEntries(customers.map((c) => [c.id, c]));
  const contactById = Object.fromEntries(contacts.map((c) => [c.id, c]));

  const items: ActivityItem[] = interactions.map((i) => ({
    id: i.id,
    outcome: i.outcome,
    notes: i.notes,
    created_at: i.created_at,
    company: custById[i.customer_id]?.company_name || "—",
    contactName: contactById[i.contact_id]?.full_name || "—",
    customerId: i.customer_id,
  }));

  return (
    <div>
      <PageHeader
        title="Activity"
        subtitle={`${items.length} interactions logged across every account.`}
      />
      <ActivityFeed items={items} />
    </div>
  );
}
