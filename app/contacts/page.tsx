import { getDb } from "@/lib/db";
import { PageHeader } from "@/components/layout/PageHeader";
import { ContactsBrowser, type ContactRow } from "@/components/contacts/ContactsBrowser";

export const metadata = { title: "Contacts" };
export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const db = getDb();
  const [contacts, customers] = await Promise.all([
    db.contacts.list(),
    db.customers.list(),
  ]);
  const customerById = Object.fromEntries(customers.map((c) => [c.id, c]));

  const rows: ContactRow[] = contacts.map((c) => ({
    id: c.id,
    name: c.full_name,
    title: c.job_title || "",
    company: customerById[c.customer_id]?.company_name || "—",
    role: c.role_bucket || "",
    email: c.email || "",
  }));

  return (
    <div>
      <PageHeader title="Contacts" subtitle="Decision-makers across your accounts." />
      <ContactsBrowser rows={rows} />
    </div>
  );
}
