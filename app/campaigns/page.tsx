import { getDb } from "@/lib/db";
import { PageHeader } from "@/components/layout/PageHeader";
import { CampaignsView } from "@/components/campaigns/CampaignsView";
import { listCampaigns } from "@/lib/campaigns";
import { listOfferings } from "@/lib/offerings";

export const metadata = { title: "Campaigns" };
export const dynamic = "force-dynamic";

// Campaigns (Suren, Jul 3): generate content → a person edits it → pick the
// contact list → the blast goes to everyone with an email. Sending is honest —
// it queues until the email channel is connected.
export default async function CampaignsPage() {
  const db = getDb();
  const [contacts, customers] = await Promise.all([
    db.contacts.list(),
    db.customers.list(),
  ]);
  const companyById = new Map(customers.map((c) => [c.id, c.company_name]));

  return (
    <div>
      <PageHeader
        title="Campaigns"
        subtitle="One message, many contacts — drafted for you, edited by you, sent to everyone on the list with an email."
      />
      <CampaignsView
        campaigns={listCampaigns()}
        offerings={listOfferings().map((o) => ({
          id: o.id,
          name: o.offering_name,
        }))}
        contacts={contacts.map((c) => ({
          id: c.id,
          name: c.full_name,
          email: c.email || "",
          company: companyById.get(c.customer_id) || "",
        }))}
      />
    </div>
  );
}
