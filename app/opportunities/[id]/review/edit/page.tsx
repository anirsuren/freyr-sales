import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { SmartBack } from "@/components/ui/BackButton";
import { PageHeader } from "@/components/layout/PageHeader";
import { OpportunityReviewEditScreen } from "@/components/opportunities/OpportunityReviewEditScreen";
import { getCurrentUser } from "@/lib/currentUser";
import { getRole } from "@/lib/role";
import { readOpportunities } from "@/lib/opportunities";
import { readPrivileges } from "@/lib/privileges";
import { readRecordTeams } from "@/lib/recordTeams";
import { getDb } from "@/lib/db";
import { getDataMode } from "@/lib/dataMode";
import { SALES_TEAM } from "@/lib/salesTeam";
import { listWorkspaceAccess } from "@/lib/accessStore";
import { readMarketIntelTracking } from "@/lib/marketIntelTracking";
import { freyrCompetitorNames } from "@/lib/marketIntelFeed";
import type { OpportunityReviewOptions } from "@/lib/opportunitiesShared";
import { mayTouchOpportunity } from "@/lib/recordAccess";
import { verifiedMemberPrivileges } from "@/lib/memberPrivilegeIdentity";
import { recordWriteRefusal, requireModuleAccess } from "@/lib/moduleAccessServer";
import { requireServerMemberScope } from "@/lib/memberScope";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { opportunities } = await readOpportunities();
  const deal = opportunities.find((item) => item.id === id);
  return { title: deal ? `Edit review · ${deal.name || deal.customer}` : "Edit review" };
}

export default async function EditOpportunityReviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requireModuleAccess("/opportunities");
  await requireServerMemberScope();
  const { id } = await params;
  const [{ opportunities }, role, me, privileges, teams] = await Promise.all([
    readOpportunities(), getRole(), getCurrentUser(), readPrivileges(), readRecordTeams(),
  ]);
  const deal = opportunities.find((item) => item.id === id);
  if (!deal) redirect("/opportunities");
  const verdict = mayTouchOpportunity({
    privileges,
    teams,
    person: me.name,
    heldPrivileges: await verifiedMemberPrivileges(privileges, me.memberId),
    role,
    opportunityId: deal.id,
    ...(deal.customerId ? { customerId: deal.customerId } : {}),
  });
  if (!verdict.mayEdit || await recordWriteRefusal("/opportunities", { id: deal.id })) {
    redirect(`/opportunities/${deal.id}?tab=review`);
  }

  const db = getDb();
  const [contacts, companies, tracking, directory] = await Promise.all([
    deal.customerId ? db.contacts.list(deal.customerId).catch(() => []) : Promise.resolve([]),
    db.customers.list().catch(() => []),
    readMarketIntelTracking().catch(() => ({ companies: [], people: [] })),
    getDataMode() === "mock" ? Promise.resolve(null) : listWorkspaceAccess(process.env.FREYR_WORKSPACE_ID || "").catch(() => null),
  ]);
  const options: OpportunityReviewOptions = {
    contacts: contacts.map((contact) => ({ id: contact.id, name: contact.full_name, title: contact.job_title || "", linkedin: contact.linkedin_url || "" })),
    companies: companies.map((company) => ({ id: company.id, name: company.company_name })),
    competitors: freyrCompetitorNames(tracking.companies),
    teammates: getDataMode() === "mock"
      ? SALES_TEAM.map((name) => ({ id: name, name }))
      : (directory?.members ?? []).filter((member) => member.active && member.accountType === "real").map((member) => ({ id: member.id, name: member.name })),
  };

  return <div className="mx-auto max-w-[1180px]">
    <SmartBack fallback={`/opportunities/${deal.id}?tab=review`} className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-text-secondary hover:text-blue-primary">
      <ArrowLeft size={15} /> Back to review
    </SmartBack>
    <PageHeader title={`Edit review · ${deal.name || deal.customer}`} subtitle="Update the decision, the people involved, and the actions agreed with the customer." />
    <div className="mt-5"><OpportunityReviewEditScreen dealId={deal.id} review={deal.review} options={options} /></div>
  </div>;
}
