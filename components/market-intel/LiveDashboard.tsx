import {
  Building2,
  type LucideIcon,
  Newspaper,
  Radar,
  Swords,
} from "lucide-react";
import { StatTile } from "@/components/ui/StatTile";
import { LinkedInIcon } from "@/components/ui/LinkedInIcon";
import type { CardPerson } from "@/components/market-intel/LiveCompanyCard";
import { LiveCompanyGrid } from "@/components/market-intel/LiveCompanyGrid";
import { MiTabs } from "@/components/market-intel/MiTabs";
import { RefreshChip } from "@/components/market-intel/NextRefresh";
import { TrackCompanyButton } from "@/components/market-intel/TrackCompanyButton";
import { WatchlistMarquee } from "@/components/market-intel/WatchlistMarquee";
import {
  allTrackedNames,
  buildBriefing,
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
  group = "customer",
}: {
  feed: MarketIntelFeed;
  tracking: MarketIntelTracking;
  /** Which intelligence bucket this dashboard shows. */
  group?: "customer" | "competitor";
}) {
  const names = allTrackedNames(feed, tracking.companies);
  const briefings = Object.values(feed.companies)
    .filter((company) => (company.group ?? "customer") === group)
    .map((company) => buildBriefing(company, names))
    .sort(
      (a, b) =>
        b.posts.length + b.news.length - (a.posts.length + a.news.length)
    );

  const pending = tracking.companies.filter(
    (c) => !feed.companies[c.id] && (c.group ?? "customer") === group
  );
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

  // Followed people per company, worn as a facepile on each card.
  const peopleByCompany: Record<string, CardPerson[]> = {};
  for (const person of tracking.people) {
    (peopleByCompany[person.companyId] ??= []).push({
      id: person.id,
      name: person.name,
      role: person.role,
      photoUrl: person.photoUrl,
      posts: feed.people[person.id]?.posts.length ?? 0,
    });
  }

  return (
    <div>
      <MiTabs
        active={group === "competitor" ? "competitors" : "customers"}
        action={
          <span className="flex flex-wrap items-center gap-2.5">
            <RefreshChip updatedAt={feed.updatedAt} />
            <TrackCompanyButton group={group} />
          </span>
        }
      >

        <>
      <section className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          icon={group === "competitor" ? Swords : Building2}
          label={group === "competitor" ? "Competitors tracked" : "Customers tracked"}
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

      <LiveCompanyGrid
        briefings={briefings}
        pending={pending}
        people={peopleByCompany}
        group={group}
      />

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
          title={
            group === "competitor"
              ? "Every competitor on the watch"
              : "Every customer on the watch"
          }
          subtitle="Scroll the strip or search. Any chip opens that company's briefing."
        />
      </div>

      <p className="mt-4 text-[11px] text-text-tertiary">
        Live data from public LinkedIn pages and Google News. Signals are
        detected automatically and always link to their source. The feed
        refreshes itself twice a day, shared by everyone.
      </p>
        </>
      </MiTabs>
    </div>
  );
}
