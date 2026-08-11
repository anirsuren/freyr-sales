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
import { Sparkline } from "@/components/charts/Charts";
import { MiLogo } from "@/components/market-intel/MiLogo";
import { TrackCompanyButton } from "@/components/market-intel/TrackCompanyButton";
import { WatchlistMarquee } from "@/components/market-intel/WatchlistMarquee";
import {
  allTrackedNames,
  buildBriefing,
  updatedLabel,
  type LiveBriefing,
  type MarketIntelFeed,
} from "@/lib/marketIntelFeed";
import type { MarketIntelTracking } from "@/lib/marketIntelTracking";

/**
 * THE LIVE DASHBOARD: real mode only, every number on it comes from scraped
 * posts and articles. Companies are ordered by how loud the market is about
 * them right now (items in the past 30 days), so the busiest accounts lead.
 */

const LinkedInGlyph = LinkedInIcon as unknown as LucideIcon;

const WEEK = 7 * 86_400_000;

export function LiveMarketIntelDashboard({
  feed,
  tracking,
}: {
  feed: MarketIntelFeed;
  tracking: MarketIntelTracking;
}) {
  const names = allTrackedNames(feed, tracking.companies);
  const briefings = Object.values(feed.companies)
    .map((company) => buildBriefing(company, names))
    .sort(
      (a, b) =>
        b.posts.length + b.news.length - (a.posts.length + a.news.length)
    );

  const pending = tracking.companies.filter((c) => !feed.companies[c.id]);
  const totalPosts = briefings.reduce((a, b) => a + b.posts.length, 0);
  const totalNews = briefings.reduce((a, b) => a + b.news.length, 0);
  const totalSignals = briefings.reduce((a, b) => a + b.signals.length, 0);
  const weekCutoff = Date.now() - WEEK;
  const newThisWeek = briefings.reduce(
    (a, b) =>
      a +
      b.signals.filter((s) => s.date && Date.parse(s.date) > weekCutoff).length,
    0
  );

  const latestNewsOf = (b: LiveBriefing) => b.news[0];

  return (
    <div>
      <PageHeader
        title="Market Intelligence"
        subtitle="What the market is saying about the companies you track. Real LinkedIn activity, news and signals from the past 3 months."
        action={
          <span className="flex flex-wrap items-center gap-2.5">
            <span className="flex items-center gap-2 rounded-full border border-border-light bg-white px-3 py-1.5 text-[12px] font-medium text-text-secondary">
              <span className="inline-flex h-2 w-2 rounded-full bg-[#1A7A35]" />
              Live data · updated {updatedLabel(feed.updatedAt)}
            </span>
            <TrackCompanyButton />
          </span>
        }
      />

      <section className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          icon={Building2}
          label="Companies tracked"
          value={String(briefings.length + pending.length)}
          sub="across your market"
        />
        <StatTile
          icon={LinkedInGlyph}
          label="LinkedIn posts"
          value={String(totalPosts)}
          sub="from company pages, 90 days"
        />
        <StatTile
          icon={Newspaper}
          label="News picked up"
          value={String(totalNews)}
          sub="real articles, 90 days"
        />
        <StatTile
          icon={Radar}
          label="Signals live"
          value={String(totalSignals)}
          sub={`${newThisWeek} new this week`}
        />
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 stagger">
        {briefings.map((briefing) => {
          const up = (briefing.momentumPct ?? 0) >= 0;
          const latest = latestNewsOf(briefing);
          return (
            <Link
              key={briefing.id}
              href={`/market-intel/${briefing.id}`}
              className="group block rounded-xl border border-border-light bg-white p-5 shadow-card transition-all hover:-translate-y-0.5 hover:border-blue-subtle hover:shadow-lg active:scale-[0.99]"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2.5">
                  <MiLogo
                    name={briefing.name}
                    logoUrl={briefing.logoUrl}
                    className="h-9 w-9 shrink-0"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-[14.5px] font-semibold text-text-primary group-hover:text-blue-primary">
                      {briefing.name}
                    </span>
                    <span className="block truncate text-[11.5px] text-text-tertiary">
                      {briefing.posts.length + briefing.news.length} items, 90
                      days
                    </span>
                  </span>
                </span>
                {briefing.momentumPct === null ? (
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-[rgba(0,113,227,0.08)] px-2 py-0.5 text-[11px] font-bold text-[color:#0071E3] tnum">
                    <TrendingUp size={11} strokeWidth={2.4} />
                    {briefing.itemsThisMonth} this month
                  </span>
                ) : (
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
                    {briefing.momentumPct}%
                  </span>
                )}
              </div>

              <div className="mt-3">
                <Sparkline
                  points={briefing.trend}
                  height={36}
                  xLabels={briefing.trendLabels}
                  unit="items"
                  label={`${briefing.name} market activity`}
                  interactive={false}
                />
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="flex items-center gap-1 rounded-full bg-[rgba(0,113,227,0.08)] px-2 py-0.5 text-[11px] font-semibold text-[color:#0071E3]">
                  <LinkedInIcon size={10.5} />
                  {briefing.posts.length}{" "}
                  {briefing.posts.length === 1 ? "post" : "posts"}
                </span>
                <span className="flex items-center gap-1 rounded-full bg-[rgba(15,118,110,0.10)] px-2 py-0.5 text-[11px] font-semibold text-[color:#0F766E]">
                  <Newspaper size={10.5} strokeWidth={2.2} />
                  {briefing.news.length} news
                </span>
                <span className="flex items-center gap-1 rounded-full bg-[rgba(124,58,237,0.10)] px-2 py-0.5 text-[11px] font-semibold text-[color:#7C3AED]">
                  <Radar size={10.5} strokeWidth={2.2} />
                  {briefing.signals.length}{" "}
                  {briefing.signals.length === 1 ? "signal" : "signals"}
                </span>
              </div>

              {latest && (
                <p className="mt-3 border-t border-border-light pt-2.5 text-[12px] leading-snug text-text-secondary">
                  <span className="font-semibold text-text-primary">
                    {latest.source}:
                  </span>{" "}
                  {latest.title}
                </p>
              )}

              <p className="mt-2 flex items-center gap-1.5 text-[10.5px] font-medium text-text-tertiary">
                <span className="inline-flex h-1.5 w-1.5 rounded-full bg-[#1A7A35]" />
                Updated {briefing.updatedLabel}
              </p>
            </Link>
          );
        })}

        {pending.map((company) => {
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
                First briefing lands on the next refresh.
              </p>
            </Link>
          );
        })}
      </section>

      <div className="mt-6">
        <WatchlistMarquee
          watchlist={briefings.map((b) => b.name)}
          tracked={[
            ...briefings.map((b) => ({ id: b.id, name: b.name })),
            ...tracking.companies.map((c) => ({ id: c.id, name: c.name })),
          ]}
          logos={Object.fromEntries(
            briefings
              .filter((b) => b.logoUrl)
              .map((b) => [b.name.toLowerCase(), b.logoUrl as string])
          )}
          title="Every company on the watch"
          subtitle="Scroll the strip or search. Any chip opens that company's briefing."
        />
      </div>

      <p className="mt-4 text-[11px] text-text-tertiary">
        Live data from public LinkedIn pages and Google News. Signals are
        detected automatically and always link to their source. The feed
        refreshes itself about once a day.
      </p>
    </div>
  );
}
