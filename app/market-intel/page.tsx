import Link from "next/link";
import {
  Building2,
  Hourglass,
  type LucideIcon,
  Newspaper,
  Radar,
  Swords,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatTile } from "@/components/ui/StatTile";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { LinkedInIcon } from "@/components/ui/LinkedInIcon";

// The house LinkedIn glyph, worn where a LucideIcon is expected. It takes
// size and className and ignores the rest, which is all these slots use.
const LinkedInGlyph = LinkedInIcon as unknown as LucideIcon;
import { Sparkline } from "@/components/charts/Charts";
import { TrackCompanyButton } from "@/components/market-intel/TrackCompanyButton";
import { WatchlistMarquee } from "@/components/market-intel/WatchlistMarquee";
import { LiveMarketIntelDashboard } from "@/components/market-intel/LiveDashboard";
import { MiTabs } from "@/components/market-intel/MiTabs";
import { MnaTracker } from "@/components/market-intel/MnaTracker";
import { getDataMode } from "@/lib/dataMode";
import { readMarketIntelFeed } from "@/lib/marketIntelFeed";
import { maybeScheduleMarketIntelRefresh } from "@/lib/marketIntelRefresh";
import {
  MI_COMPANIES,
  MI_WATCHLIST,
  miDateLabel,
  miFreshMinutes,
  miTotals,
} from "@/lib/marketIntelMock";
import { readMarketIntelTracking } from "@/lib/marketIntelTracking";

/**
 * MARKET INTELLIGENCE - DESIGN MOCKUP (Anir, Aug 10, from Anant's ask): one
 * dashboard of every tracked company, click into a company for its full
 * briefing. Everything on these pages is sample content rendered against
 * today's date; Anir is wiring the real feeds himself.
 */
export const dynamic = "force-dynamic";

/** Week labels for the 12-week sparkline, so a hovered point says WHEN. */
function weekLabels(): string[] {
  const out: string[] = [];
  for (let i = 11; i >= 0; i -= 1) {
    const d = new Date(Date.now() - i * 7 * 86_400_000);
    out.push(
      d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    );
  }
  return out;
}

export default async function MarketIntelPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const tracking = await readMarketIntelTracking().catch(() => ({
    companies: [],
    people: [],
  }));

  // REAL MODE SHOWS REAL DATA ONLY (Anir, Aug 11). The scraped feed powers
  // live mode; the sample briefings below remain the mock-mode showroom.
  if (getDataMode() === "live") {
    const feed = await readMarketIntelFeed().catch(() => null);
    // Nobody clicks anything: a stale feed schedules ONE background refresh
    // after this response, and a database lock keeps a hundred simultaneous
    // visitors from becoming a hundred refreshes.
    maybeScheduleMarketIntelRefresh(feed);
    if (feed && Object.keys(feed.companies).length > 0) {
      // The three buckets from the Aug 11 call.
      if (tab === "market") {
        return (
          <div>
            <PageHeader
              title="Market Intelligence"
              subtitle="What's moving across the regulated industries: mergers and acquisitions, classified by status and division."
              action={
                <span className="flex items-center gap-2 rounded-full border border-border-light bg-white px-3 py-1.5 text-[12px] font-medium text-text-secondary">
                  <span className="inline-flex h-2 w-2 rounded-full bg-[#1A7A35]" />
                  Live data · twice a day
                </span>
              }
            />
            <MiTabs active="market" />
            <MnaTracker board={feed.mna ?? null} />
          </div>
        );
      }
      const group = tab === "competitors" ? "competitor" : "customer";
      return (
        <LiveMarketIntelDashboard
          feed={feed}
          tracking={tracking}
          group={group}
          tabs={<MiTabs active={tab === "competitors" ? "competitors" : "customers"} />}
        />
      );
    }
  }

  const totals = miTotals();
  const labels = weekLabels();
  return (
    <div>
      <PageHeader
        title="Market Intelligence"
        subtitle="What the market is saying about the companies you track. LinkedIn activity, news and competitive signals from the past 3 months."
        action={
          <span className="flex flex-wrap items-center gap-2.5">
            <span className="flex items-center gap-2 rounded-full border border-border-light bg-white px-3 py-1.5 text-[12px] font-medium text-text-secondary">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#1A7A35] opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#1A7A35]" />
              </span>
              Auto-refreshing. Sample data preview.
            </span>
            <TrackCompanyButton />
          </span>
        }
      />

      <section className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          icon={Building2}
          label="Companies tracked"
          value={String(totals.tracked + tracking.companies.length)}
          sub="across your market"
        />
        <StatTile
          icon={LinkedInGlyph}
          label="LinkedIn posts"
          value={String(totals.posts)}
          sub="from tracked people, 90 days"
        />
        <StatTile
          icon={Newspaper}
          label="News picked up"
          value={String(totals.news)}
          sub="articles summarized, 90 days"
        />
        <StatTile
          icon={Radar}
          label="Signals live"
          value={String(totals.signals)}
          sub={`${totals.thisWeek} new this week`}
        />
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 stagger">
        {MI_COMPANIES.map((company) => {
          const latestNews = [...company.news].sort(
            (a, b) => a.daysAgo - b.daysAgo
          )[0];
          const up = company.momentum >= 0;
          const fresh = miFreshMinutes(company.id);
          return (
            <Link
              key={company.id}
              href={`/market-intel/${company.id}`}
              className="group block rounded-xl border border-border-light bg-white p-5 shadow-card transition-all hover:-translate-y-0.5 hover:border-blue-subtle hover:shadow-lg active:scale-[0.99]"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2.5">
                  <CompanyLogo
                    name={company.name}
                    className="h-9 w-9 shrink-0"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-[14.5px] font-semibold text-text-primary group-hover:text-blue-primary">
                      {company.name}
                    </span>
                    <span className="block truncate text-[11.5px] text-text-tertiary">
                      {company.industry}
                    </span>
                  </span>
                </span>
                {/* Momentum wears a real status colour: green is more market
                    noise than last month, red is less. */}
                <span
                  className="flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold tnum"
                  style={{
                    color: up ? "#1A7A35" : "#DC2626",
                    background: up
                      ? "rgba(26,122,53,0.10)"
                      : "rgba(220,38,38,0.10)",
                  }}
                >
                  {up ? (
                    <TrendingUp size={11} strokeWidth={2.4} />
                  ) : (
                    <TrendingDown size={11} strokeWidth={2.4} />
                  )}
                  {up ? "+" : ""}
                  {company.momentum}%
                </span>
              </div>

              <div className="mt-3">
                <Sparkline
                  points={company.trend}
                  height={36}
                  xLabels={labels}
                  unit="items"
                  label={`${company.name} market activity`}
                  interactive={false}
                />
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="flex items-center gap-1 rounded-full bg-[rgba(0,113,227,0.08)] px-2 py-0.5 text-[11px] font-semibold text-[color:#0071E3]">
                  <LinkedInIcon size={10.5} />
                  {company.posts.length}{" "}
                  {company.posts.length === 1 ? "post" : "posts"}
                </span>
                <span className="flex items-center gap-1 rounded-full bg-[rgba(15,118,110,0.10)] px-2 py-0.5 text-[11px] font-semibold text-[color:#0F766E]">
                  <Newspaper size={10.5} strokeWidth={2.2} />
                  {company.news.length} news
                </span>
                <span className="flex items-center gap-1 rounded-full bg-[rgba(124,58,237,0.10)] px-2 py-0.5 text-[11px] font-semibold text-[color:#7C3AED]">
                  <Radar size={10.5} strokeWidth={2.2} />
                  {company.signals.length}{" "}
                  {company.signals.length === 1 ? "signal" : "signals"}
                </span>
              </div>

              {latestNews && (
                <p className="mt-3 border-t border-border-light pt-2.5 text-[12px] leading-snug text-text-secondary">
                  <span className="font-semibold text-text-primary">
                    {latestNews.source}:
                  </span>{" "}
                  {latestNews.headline}
                  <span className="text-text-tertiary">
                    {" "}
                    · {miDateLabel(latestNews.daysAgo)}
                  </span>
                </p>
              )}

              <p className="mt-2 flex items-center gap-1.5 text-[10.5px] font-medium text-text-tertiary">
                <span className="inline-flex h-1.5 w-1.5 rounded-full bg-[#1A7A35]" />
                Updated {fresh} min ago
              </p>
            </Link>
          );
        })}

        {/* Companies the team added themselves. Nothing is invented for them:
            the card says plainly that the first briefing is still coming. */}
        {tracking.companies.map((company) => {
          const peopleCount = tracking.people.filter(
            (p) => p.companyId === company.id
          ).length;
          return (
            <Link
              key={company.id}
              href={`/market-intel/${company.id}`}
              className="group block rounded-xl border border-border-light bg-white p-5 shadow-card transition-all hover:-translate-y-0.5 hover:border-blue-subtle hover:shadow-lg active:scale-[0.99]"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2.5">
                  <CompanyLogo
                    name={company.name}
                    className="h-9 w-9 shrink-0"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-[14.5px] font-semibold text-text-primary group-hover:text-blue-primary">
                      {company.name}
                    </span>
                    <span className="block truncate text-[11.5px] text-text-tertiary">
                      {company.industry || "Tracked company"}
                    </span>
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-[rgba(0,113,227,0.08)] px-2 py-0.5 text-[11px] font-bold text-[color:#0071E3]">
                  New
                </span>
              </div>

              <div className="mt-3 flex h-9 items-center justify-center rounded-md border border-dashed border-border-light text-[10.5px] font-medium text-text-tertiary">
                Collecting the first weeks of activity
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="flex items-center gap-1 rounded-full bg-[rgba(0,113,227,0.08)] px-2 py-0.5 text-[11px] font-semibold text-[color:#0071E3]">
                  <Users size={10.5} strokeWidth={2.2} />
                  {peopleCount} {peopleCount === 1 ? "person" : "people"} followed
                </span>
                <span className="flex items-center gap-1 rounded-full bg-[rgba(180,49,143,0.10)] px-2 py-0.5 text-[11px] font-semibold text-[color:#B4318F]">
                  <Swords size={10.5} strokeWidth={2.2} />
                  {company.competitors.length}{" "}
                  {company.competitors.length === 1
                    ? "competitor"
                    : "competitors"}
                </span>
              </div>

              <p className="mt-3 flex items-center gap-1.5 border-t border-border-light pt-2.5 text-[12px] leading-snug text-text-secondary">
                <Hourglass
                  size={12}
                  strokeWidth={2.2}
                  className="shrink-0 text-blue-primary"
                />
                First briefing lands after the next refresh.
              </p>
            </Link>
          );
        })}
      </section>

      <div className="mt-6">
        <WatchlistMarquee
          watchlist={MI_WATCHLIST}
          tracked={[
            ...MI_COMPANIES.map((c) => ({ id: c.id, name: c.name })),
            ...tracking.companies.map((c) => ({ id: c.id, name: c.name })),
          ]}
        />
      </div>

      <p className="mt-4 text-[11px] text-text-tertiary">
        Design preview. Companies are real, every person, post, article and
        signal on these pages is illustrative sample content.
      </p>
    </div>
  );
}
