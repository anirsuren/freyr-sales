import { getDb } from "@/lib/db";
import { PageHeader } from "@/components/layout/PageHeader";
import { CustomersBrowser } from "@/components/customers/CustomersBrowser";
import { buildDeals } from "@/lib/pipeline";
import { accountHealth } from "@/lib/health";

export const metadata = { title: "Customers" };
export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const db = getDb();
  const customers = await db.customers.list();
  const allContacts = await db.contacts.list();

  const enriched = await Promise.all(
    customers.map(async (c) => {
      const contacts = await db.contacts.list(c.id);
      const interactions = await db.interactions.list(c.id);
      const sessions = await db.pitchSessions.list(c.id);
      const deals = buildDeals(sessions, customers, allContacts, interactions).filter(
        (d) => d.customerId === c.id
      );
      return {
        ...c,
        contact_count: contacts.length,
        last_outcome: interactions[0]?.outcome || null,
        last_session_date: sessions[0]?.created_at || null,
        health: accountHealth({
          interactions,
          deals,
          contactCount: contacts.length,
        }),
      };
    })
  );

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle="Every company in your pipeline."
      />
      <CustomersBrowser customers={enriched} />
    </div>
  );
}
