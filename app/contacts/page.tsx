import { getDb } from "@/lib/db";
import { ContactsBrowser, type ContactRow } from "@/components/contacts/ContactsBrowser";
import { voiceStatus } from "@/lib/voice";

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
    companyId: customerById[c.customer_id] ? c.customer_id : null,
    role: c.role_bucket || "",
    email: c.email || "",
    linkedin: c.linkedin_url || null,
  }));

  return (
    <div>
      <ContactsBrowser
        rows={rows}
        voiceCategories={Object.keys(voiceStatus().agents)}
      />
    </div>
  );
}
