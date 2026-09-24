import { BD_COMPANY_LIMIT } from "@/lib/marketIntelCompanyLimit";
import { marketIntelAddRefusal } from "@/lib/marketIntelAddAccess";
import { ArrowLeft } from "lucide-react";
import { SmartBack } from "@/components/ui/BackButton";
import { ManageCompaniesPanel } from "@/components/market-intel/ManageCompaniesButton";
import { MiSectionMarker } from "@/components/market-intel/MiSection";
import { getCurrentUser } from "@/lib/currentUser";
import { requireServerMemberScope } from "@/lib/memberScope";
import {
  emptyBookmarks,
  readMarketIntelBookmarks,
  readMarketIntelFollowers,
} from "@/lib/marketIntelBookmarks";
import { readMarketIntelSummaries } from "@/lib/marketIntelRead";
import { buildManagedCompanies } from "@/lib/marketIntelManaged";
import { readMarketIntelTracking } from "@/lib/marketIntelTracking";
import { requireModuleAccess } from "@/lib/moduleAccessServer";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  return { title: tab === "competitors" ? "Manage competitors" : "Manage customers" };
}

/**
 * MANAGE IS A PAGE (Anir, Sep 11: "now that i think of it i think the manage
 * competitors should be like a full page when i click on it... track
 * competitors is a popup. that makes more sense").
 *
 * /market-intel/manage?tab=competitors for Competitor Intel, the bare
 * path for Customer Intel, the same ?tab= the dashboard uses. The list
 * is every company in that section, ticked or not; adding one is still the
 * Track pop-up in the header.
 */
export default async function ManageCompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireModuleAccess("/market-intel");
  const { tab } = await searchParams;
  const group = tab === "competitors" ? "competitor" : "customer";
  /* Adding to the watch list is a write, and each add fires a paid scrape. */
  const canTrack = !(await marketIntelAddRefusal());
  const [tracking, intel, followers, user, scope] = await Promise.all([
    readMarketIntelTracking({ fresh: true }).catch(() => ({ companies: [], people: [] })),
    readMarketIntelSummaries().catch(() => null),
    readMarketIntelFollowers().catch(() => ({}) as Record<string, string[]>),
    getCurrentUser(),
    requireServerMemberScope().catch(() => null),
  ]);
  const mine = scope
    ? await readMarketIntelBookmarks(scope).catch(() => emptyBookmarks())
    : emptyBookmarks();
  const companies = buildManagedCompanies({
    tracking,
    summaries: intel?.companies ?? {},
    followers,
  });
  const backHref = group === "competitor" ? "/market-intel?tab=competitors" : "/market-intel";
  const backLabel = group === "competitor" ? "Competitor Intel" : "Customer Intel";

  return (
    <div>
      <MiSectionMarker section={group === "competitor" ? "competitors" : "customers"} />
      <SmartBack
        fallback={backHref}
        className="mb-2 inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-medium text-text-secondary transition-colors hover:text-blue-primary"
      >
        <ArrowLeft size={14} strokeWidth={2} /> {backLabel}
      </SmartBack>
      <ManageCompaniesPanel
        companies={companies}
        group={group}
        isAdmin={user.role === "admin"}
        canWrite={canTrack}
        additionsRemaining={user.role === "bd_member" ? Math.max(0, BD_COMPANY_LIMIT - tracking.companies.filter(company => company.addedBy?.id === scope?.userId).length) : undefined}
        myIds={mine.companyIds}
        starredIds={mine.starredIds}
      />
    </div>
  );
}
