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
import { ManageCompaniesButton, type ManagedCompany } from "@/components/market-intel/ManageCompaniesButton";
import {
  cardFromSummary,
  type FeedCompanySummary,
  type FeedMeta,
  type PersonSummary,
} from "@/lib/marketIntelFeed";
import { COMPANY_SOURCES, COMPETITOR_SOURCES } from "@/lib/marketIntelSources";
import {
  companyDivisions,
  isActiveCompany,
  type Followers,
  type MarketIntelTracking,
} from "@/lib/marketIntelTracking";
import type { WatchState } from "@/components/market-intel/WatchStatus";
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
  followers = {},
  isAdmin = false,
  viewer = { userId: "", myIds: [], showAll: false },
}: {
  summaries: Record<string, FeedCompanySummary>;
  meta: FeedMeta;
  tracking: MarketIntelTracking;
  /** Post counts per followed person, for the facepiles. */
  people?: Record<string, PersonSummary>;
  /** Who follows what, across everybody's lists. */
  followers?: Followers;
  isAdmin?: boolean;
  /** The person looking: their list, and whether they asked to see everything. */
  viewer?: { userId: string; myIds: string[]; showAll: boolean };
  /** Which intelligence bucket this dashboard shows. */
  group?: "customer" | "competitor";
  /** Passed straight to the button: the Market Intel row decides. */
  canTrack?: boolean;
  /** How many NEW companies this person may still add; null for no limit. */
  addedLeft?: number | null;
}) {
  /* THE REGISTRY DECIDES WHAT IS ON THE PAGE (Anir, Sep 10). A company is
     here because somebody has it: the standing watch or a person's list.
     Data with no registry entry (deleted for good) is not shown; a registry
     entry nobody has is paused, shown only to an admin who asks. The tab a
     company is on comes from the registry too, so moving it moves it. */
  const registry = new Map(tracking.companies.map((c) => [c.id, c]));
  const watch: Record<string, WatchState> = {};
  for (const c of tracking.companies) {
    watch[c.id] = { standing: c.standing === true, followers: followers[c.id]?.length ?? 0 };
  }
  const inGroup = (id: string) => (registry.get(id)?.group ?? "customer") === group;
  const active = (id: string) => isActiveCompany(registry.get(id)!, followers);
  /* PAUSED COMPANIES TRAVEL ONLY TO AN ADMIN, who has the filter that shows
     them. Everybody else's page carries nothing about a company nobody has. */
  /* MY PAGE IS MY LIST (Anir, Sep 10): what I added and what I starred.
     Everything else the team tracks stays out of the way until I tick "Show
     all companies" in Manage companies. */
  const myIds = new Set(viewer.myIds);
  const mine = (id: string) =>
    myIds.has(id) || (!!viewer.userId && registry.get(id)?.addedBy?.id === viewer.userId);
  const onMyPage = (id: string) => viewer.showAll || mine(id);
  const cards = Object.values(summaries)
    .filter((company) => registry.has(company.id) && inGroup(company.id))
    .filter((company) => isAdmin || active(company.id))
    .filter((company) => onMyPage(company.id))
    .map(cardFromSummary)
    .sort((a, b) => b.itemsInWindow - a.itemsInWindow);

  const pending = tracking.companies.filter(
    (c) => !summaries[c.id] && inGroup(c.id) && (isAdmin || active(c.id)) && onMyPage(c.id)
  );
  const live = cards.filter((c) => active(c.id));
  const totalPosts = live.reduce((a, c) => a + c.counts.posts, 0);
  const totalNews = live.reduce((a, c) => a + c.counts.news, 0);
  const totalSite = live.reduce((a, c) => a + c.counts.site, 0);
  const totalSignals = live.reduce((a, c) => a + c.signalTotal, 0);
  const busy = live.filter((c) => c.itemsThisMonth >= 10).length;
  const standing = tracking.companies.filter((c) => inGroup(c.id) && c.standing).length;
  const paused = tracking.companies.filter((c) => inGroup(c.id) && !active(c.id)).length;
  const activeTotal = live.length + pending.filter((c) => active(c.id)).length;

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
  for (const c of tracking.companies) {
    divisions[c.id] = companyDivisions(tracking, c.id, sourceDefault(c.id));
  }

  /* EVERY COMPANY, FOR THE MANAGE POP-UP: customers and competitors, on the
     watch or paused, with what a person needs to decide about it. */
  const managed: ManagedCompany[] = tracking.companies
    .map((c) => {
      const summary = summaries[c.id];
      return {
        id: c.id,
        name: c.name,
        group: c.group === "competitor" ? ("competitor" as const) : ("customer" as const),
        standing: c.standing === true,
        followers: followers[c.id]?.length ?? 0,
        divisions: divisions[c.id] ?? [],
        itemsThisMonth: summary ? cardFromSummary(summary).itemsThisMonth : 0,
        logoUrl: summary?.logoUrl ?? null,
        sources: {
          linkedin: c.scrape ? (c.scrape.li?.length ?? 0) > 0 : /linkedin\.com\/company\//i.test(c.linkedinUrl),
          news: true,
          website: !!(c.scrape?.site || c.website),
        },
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      <MiTabs
        active={group === "competitor" ? "competitors" : "customers"}
        action={
          <span className="flex flex-wrap items-center gap-2.5">
            <RefreshChip updatedAt={meta.updatedAt} health={meta.health} isAdmin={isAdmin} />
            <ManageCompaniesButton companies={managed} isAdmin={isAdmin} canWrite={canTrack} showAll={viewer.showAll} />
            <TrackCompanyButton group={group} canTrack={canTrack} addedLeft={addedLeft} isAdmin={isAdmin} />
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
          label={
            viewer.showAll
              ? group === "competitor" ? "Competitors on the watch" : "Customers on the watch"
              : group === "competitor" ? "Competitors on my page" : "Customers on my page"
          }
          value={String(activeTotal)}
          sub={
            viewer.showAll
              ? `${standing} for everyone · ${busy} busy this month${paused > 0 ? ` · ${paused} paused` : ""}`
              : `${busy} busy this month · the team tracks ${tracking.companies.filter((c) => inGroup(c.id) && active(c.id)).length}; tick Show all in Manage companies to see them`
          }
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
        watch={watch}
        isAdmin={isAdmin}
        showAll={viewer.showAll}
      />
        </>
      </MiTabs>
    </div>
  );
}
