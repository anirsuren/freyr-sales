import { marketIntelAddRefusal } from "@/lib/marketIntelAddAccess";
import { LiveMarketIntelDashboard } from "@/components/market-intel/LiveDashboard";
import { MiTabs } from "@/components/market-intel/MiTabs";
import { MnaTracker } from "@/components/market-intel/MnaTracker";
import { RefreshChip } from "@/components/market-intel/NextRefresh";
import { getDataMode } from "@/lib/dataMode";
import { getCurrentUser } from "@/lib/currentUser";
import { requireServerMemberScope } from "@/lib/memberScope";
import { readFeedPeopleSummaries, readMarketIntelSummaries } from "@/lib/marketIntelRead";
import { emptyBookmarks, readMarketIntelBookmarks, readMarketIntelFollowers } from "@/lib/marketIntelBookmarks";
import { maybeScheduleMarketIntelRefresh } from "@/lib/marketIntelRefresh";
import { readMarketIntelTracking } from "@/lib/marketIntelTracking";
import { requireModuleAccess } from "@/lib/moduleAccessServer";
import { listWorkspaceAccess } from "@/lib/accessStore";
export const metadata = { title: "Market Intel" };
export const dynamic = "force-dynamic";

export default async function MarketIntelPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireModuleAccess("/market-intel");
  /* Adding to the watch list is a write, and each add fires a paid scrape. */
  const canTrack = !(await marketIntelAddRefusal());
  const { tab } = await searchParams;
  const tracking = await readMarketIntelTracking({fresh:true}).catch(() => ({
    companies: [],
    people: [],
  }));

  const intel = await readMarketIntelSummaries({fresh:true}).catch(() => null);
  if (getDataMode() === "live") maybeScheduleMarketIntelRefresh(intel?.meta ?? null);
  const meta = intel?.meta ?? {version:1,updatedAt:null};
  if (tab === "market") return <MiTabs active="market" action={<RefreshChip updatedAt={meta.updatedAt} />}><MnaTracker board={meta.mna ?? null} thought={meta.thought ?? null} /></MiTabs>;
  const group = tab === "competitors" ? "competitor" : "customer";
  const user = await getCurrentUser();
  const scope = await requireServerMemberScope().catch(() => null);
  const workspaceId = process.env.FREYR_WORKSPACE_ID;
  const [people, followers, mine, directory] = await Promise.all([
    group === "competitor" ? Promise.resolve({}) : readFeedPeopleSummaries().catch(() => ({})),
    readMarketIntelFollowers().catch(() => ({}) as Record<string,string[]>),
    scope ? readMarketIntelBookmarks(scope).catch(() => emptyBookmarks()) : Promise.resolve(emptyBookmarks()),
    workspaceId ? listWorkspaceAccess(workspaceId).catch(() => null) : Promise.resolve(null),
  ]);
  const preferList = ["saras.verma@freyrsolutions.com", "saras.verma+1@freyrsolutions.com"].includes(user.email?.toLowerCase() ?? "");
  const memberDirectory = Object.fromEntries((directory?.members ?? []).map(member => [member.id, { name: member.name, email: member.email }]));
  return <LiveMarketIntelDashboard defaultView={preferList ? "list" : "tiles"} summaries={intel?.companies ?? {}} meta={meta} tracking={tracking} group={group} canTrack={canTrack} people={people} followers={followers} memberDirectory={memberDirectory} isAdmin={user.role === "admin"} viewer={{userId:scope?.userId ?? "",myIds:mine.companyIds,starredIds:mine.starredIds}} />;
}
