import { getServiceStatus } from "@/lib/env";
import { getDb } from "@/lib/db";
import { buildDeals } from "@/lib/pipeline";
import { PageHeader } from "@/components/layout/PageHeader";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { getDataMode, isDataModeLocked } from "@/lib/dataMode";
import { isApprovalGateEnabled } from "@/lib/accessControl";
import { isOfferingsOnly } from "@/lib/release";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const services = getServiceStatus();
  const dataMode = getDataMode();
  // Settings stays reachable during the offerings-only rollout, so it must not
  // carry the other modules' data with it. The CRM mirror counts companies,
  // contacts and deals — none of which are released — so in that mode they are
  // never read and never reach the browser (the Integrations tab that shows
  // them is hidden too; see SettingsTabs).
  const offeringsOnly = isOfferingsOnly(dataMode);

  // Real counts for the CRM mirror — the app's own book, not invented numbers.
  const db = getDb();
  const [customers, contacts, sessions, interactions] = offeringsOnly
    ? [[], [], [], []]
    : await Promise.all([
        db.customers.list(),
        db.contacts.list(),
        db.pitchSessions.list(),
        db.interactions.list(),
      ]);
  const deals = offeringsOnly
    ? []
    : buildDeals(sessions, customers, contacts, interactions);
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
        offeringsOnly={offeringsOnly}
        initialDataMode={dataMode}
        initialDataModeLocked={isDataModeLocked()}
        authConfig={{
          authMode: process.env.AUTH_MODE || "local",
          approvalEnabled: isApprovalGateEnabled(),
        }}
      />
    </div>
  );
}
