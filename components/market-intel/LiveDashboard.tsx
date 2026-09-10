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
  cardFromSummary,
  type FeedCompanySummary,
  type FeedMeta,
  type PersonSummary,
} from "@/lib/marketIntelFeed";
import { COMPANY_SOURCES, COMPETITOR_SOURCES } from "@/lib/marketIntelSources";
import { companyDivisions, type MarketIntelTracking } from "@/lib/marketIntelTracking";
import type { Division } from "@/lib/offeringMaterials";

/**
 * THE LIVE DASHBOARD: real mode only, every number on it comes from scraped
 * posts and articles. Built from each company's SUMMARY (Sep 10), so a
 * hundred companies cost a hundred small rows, not a hundred briefings.
 * Companies are ordered by how loud the market is about them (items in the
 * window), so the busiest accounts lead.
 */

const LinkedInGlyph = LinkedInIcon as unknown as LucideIcon;

export function LiveMarketIntelDashboard({
  summaries,
  meta,
  tracking,
  group = "customer",
  canTrack = true,
  addedLeft = null,
  people = {},
}: {
  summaries: Record<string, FeedCompanySummary>;
  meta: FeedMeta;
  tracking: MarketIntelTracking;
  /** Post counts per followed person, for the facepiles. */
  people?: Record<string, PersonSummary>;
  /** Which intelligence bucket this dashboard shows. */
  group?: "customer" | "competitor";
  /** Passed straight to the button: the Market Intel row decides. */
  canTrack?: boolean;
  /** How many NEW companies this person may still add; null for no limit. */
  addedLeft?: number | null;
}) {
  const cards = Object.values(summaries)
    .filter((company) => company.group === group)
    .map(cardFromSummary)
    .sort((a, b) => b.itemsInWindow - a.itemsInWindow);

  const pending = tracking.companies.filter(
    (c) => !summaries[c.id] && (c.group ?? "customer") === group
  );
  const totalPosts = cards.reduce((a, c) => a + c.counts.posts, 0);
  const totalNews = cards.reduce((a, c) => a + c.counts.news, 0);
  const totalSite = cards.reduce((a, c) => a + c.counts.site, 0);
  const totalSignals = cards.reduce((a, c) => a + c.signalTotal, 0);
  const busy = cards.filter((c) => c.itemsThisMonth >= 10).length;

  // Followed people per company, worn as a facepile on each card. Nobody is
  // followed at a competitor (Saras, Sep 10), so that bucket carries none.
  const peopleByCompany: Record<string, CardPerson[]> = {};
  if (group !== "competitor") {
    for (const person of tracking.people) {
      (peopleByCompany[person.companyId] ??= []).push({
        id: person.id,
        name: person.name,
        role: person.role,
        photoUrl: person.photoUrl,
        posts: people[person.id]?.posts ?? 0,
      });
    }
  }

  // Division tags: the tracking row's map, then the company's own record,
  // then the code's starting answer for the built-in list.
  const sourceDefault = (id: string): Division[] =>
    ([...COMPANY_SOURCES, ...COMPETITOR_SOURCES].find((s) => s.id === id)?.divisions ?? []) as Division[];
  const divisions: Record<string, Division[]> = {};
  for (const id of [...cards.map((c) => c.id), ...pending.map((c) => c.id)]) {
    divisions[id] = companyDivisions(tracking, id, sourceDefault(id));
  }

  return (
    <div>
      <MiTabs
        active={group === "competitor" ? "competitors" : "customers"}
        action={
          <span className="flex flex-wrap items-center gap-2.5">
            <RefreshChip updatedAt={meta.updatedAt} />
            <TrackCompanyButton group={group} canTrack={canTrack} addedLeft={addedLeft} />
          </span>
        }
      >

        <>
      {/* The stagger entrance every other page's cards got in the Aug
          sweep — Market Intel shipped after it and was missed (Anir, Aug 17:
          "the four cards at the top don't animate at all"). */}
      <section className="stagger mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          icon={group === "competitor" ? Swords : Building2}
          label={group === "competitor" ? "Competitors tracked" : "Customers tracked"}
          value={String(cards.length + pending.length)}
          sub={`${busy} busy this month`}
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
          sub={`real articles, 90 days · ${totalSite} from their own sites`}
        />
        {/* THE COUNT IS THE COUNT (Sep 10). Signals used to be capped at eight
            per company; now every item that carries one of the nine signals
            is counted. */}
        <StatTile
          icon={Radar}
          label="Signals live"
          value={String(totalSignals)}
          sub="items carrying one of the nine signals"
        />
      </section>

      <LiveCompanyGrid
        cards={cards}
        pending={pending}
        people={peopleByCompany}
        group={group}
        divisions={divisions}
      />

      <div className="mt-6">
        <WatchlistMarquee
          watchlist={cards.map((c) => c.name)}
          tracked={[
            ...cards.map((c) => ({ id: c.id, name: c.name })),
            ...tracking.companies.map((c) => ({ id: c.id, name: c.name })),
          ]}
          logos={Object.fromEntries(
            cards
              .filter((c) => c.logoUrl)
              .map((c) => [c.name.toLowerCase(), c.logoUrl as string])
          )}
          title={
            group === "competitor"
              ? "Every competitor on the watch"
              : "Every customer on the watch"
          }
          subtitle="Scroll the strip or search. Any chip opens that company's briefing."
        />
      </div>
        </>
      </MiTabs>
    </div>
  );
}
