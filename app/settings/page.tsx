import { getServiceStatus } from "@/lib/env";
import { getDb } from "@/lib/db";
import { buildDeals } from "@/lib/pipeline";
import { PageHeader } from "@/components/layout/PageHeader";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { getDataMode } from "@/lib/dataMode";
import { isApprovalGateEnabled } from "@/lib/accessControl";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const services = getServiceStatus();

  // Real counts for the CRM mirror — the app's own book, not invented numbers.
  const db = getDb();
  const [customers, contacts, sessions, interactions] = await Promise.all([
    db.customers.list(),
    db.contacts.list(),
    db.pitchSessions.list(),
    db.interactions.list(),
  ]);
  const deals = buildDeals(sessions, customers, contacts, interactions);
  const crmCounts = {
    companies: customers.length,
    contacts: contacts.length,
    deals: deals.length,
  };

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Workspace behavior, identity, access, notifications, and connected systems."
      />
      <SettingsTabs
        services={services}
        crmCounts={crmCounts}
        initialDataMode={getDataMode()}
        authConfig={{
          authMode: process.env.AUTH_MODE || "local",
          approvalEnabled: isApprovalGateEnabled(),
        }}
      />
    </div>
  );
}
