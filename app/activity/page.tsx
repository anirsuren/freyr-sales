import { requireModuleAccess } from "@/lib/moduleAccessServer";
import { getDb } from "@/lib/db";
import { PageHeader } from "@/components/layout/PageHeader";
import { ActivityFeed, type ActivityItem } from "@/components/activity/ActivityFeed";

export const metadata = { title: "Activity" };
export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  await requireModuleAccess("/activity");
  const db = getDb();
  const [interactions, customers, contacts] = await Promise.all([
    db.interactions.list(),
    db.customers.list(),
    db.contacts.list(),
  ]);

  const custById = Object.fromEntries(customers.map((c) => [c.id, c]));
  const contactById = Object.fromEntries(contacts.map((c) => [c.id, c]));

  // The agent writes its own rows into the same interactions store. This page
  // is a record of what PEOPLE did with these accounts, and agent surfaces
  // belong in the chat and nowhere else (Anir, repeatedly: "there should be no
  // agent stuff on any page except the chatbot"). Everything the agent did is
  // still fully auditable in its own run history.
  const items: ActivityItem[] = interactions
    .filter((i) => i.logged_by !== "Freyr Agent")
    .map((i) => ({
    id: i.id,
    outcome: i.outcome,
    notes: i.notes,
    created_at: i.created_at,
    company: custById[i.customer_id]?.company_name || "-",
    contactName: contactById[i.contact_id]?.full_name || "-",
    contactTitle: contactById[i.contact_id]?.job_title || null,
    customerId: i.customer_id,
    contactId: i.contact_id,
    followUpDate: i.follow_up_date,
    owner: i.logged_by || custById[i.customer_id]?.owner || "Unknown user",
    source: "Logged manually",
  }));

  return (
    <div>
      <PageHeader
        title="Activity"
        subtitle="Every customer touch, reply, and follow-up in one place."
      />
      <ActivityFeed items={items} />
    </div>
  );
}
