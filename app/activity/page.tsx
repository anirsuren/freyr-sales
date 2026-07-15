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
    contactTitle: contactById[i.contact_id]?.job_title || null,
    customerId: i.customer_id,
    contactId: i.contact_id,
    followUpDate: i.follow_up_date,
    // Automation can create an activity, but it cannot own a relationship.
    // Attribute those events to the account owner and identify the agent only
    // as the source of the activity.
    owner:
      i.logged_by === "Freyr Agent"
        ? custById[i.customer_id]?.owner || "Suren Dheen"
        : i.logged_by || custById[i.customer_id]?.owner || "Suren Dheen",
    source: i.logged_by === "Freyr Agent" ? "Agent-assisted" : "Logged manually",
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
