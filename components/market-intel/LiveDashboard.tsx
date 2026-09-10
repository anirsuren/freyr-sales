import {
  Building2,
  ListChecks,
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
import {
  ManageCompaniesButton,
  ManageCompaniesProvider,
  type ManagedCompany,
} from "@/components/market-intel/ManageCompaniesButton";
import {
  cardFromSummary,
  type FeedCompanySummary,
  type FeedMeta,
  type PersonSummary,
} from "@/lib/marketIntelFeed";
import { COMPANY_SOURCES, COMPETITOR_SOURCES } from "@/lib/marketIntelSources";
import {
  companyDivisions,
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
  people = {},
  followers = {},
  isAdmin = false,
  viewer = { userId: "", myIds: [], starredIds: [] },
}: {
  summaries: Record<string, FeedCompanySummary>;
  meta: FeedMeta;
  tracking: MarketIntelTracking;
  /** Post counts per followed person, for the facepiles. */
  people?: Record<string, PersonSummary>;
  /** Who has what, across everybody's lists. */
  followers?: Followers;
  isAdmin?: boolean;
  /** The person looking: what they ticked, and what they starred. */
  viewer?: { userId: string; myIds: string[]; starredIds: string[] };
  /** Which intelligence bucket this dashboard shows. */
  group?: "customer" | "competitor";
  /** Passed straight to the button: the Market Intel row decides. */
  canTrack?: boolean;
}) {
  /* MY PAGE IS EXACTLY WHAT I TICKED (Anir, Sep 10: "they have to
     individually check off everything"). The catalogue is every company the
     team knows about; this page carries the ones this person ticked in
     Manage companies, and nothing else. Ticking one is also what keeps it
     collected, so everything here is active by definition. */
  const registry = new Map(tracking.companies.map((c) => [c.id, c]));
  const watch: Record<string, WatchState> = {};
  for (const c of tracking.companies) {
    watch[c.id] = { followers: followers[c.id]?.length ?? 0 };
  }
  const inGroup = (id: string) => (registry.get(id)?.group ?? "customer") === group;
  const myIds = new Set(viewer.myIds);
  const cards = Object.values(summaries)
    .filter((company) => registry.has(company.id) && inGroup(company.id) && myIds.has(company.id))
    .map(cardFromSummary)
    .sort((a, b) => b.itemsInWindow - a.itemsInWindow);

  const pending = tracking.companies.filter(
    (c) => !summaries[c.id] && inGroup(c.id) && myIds.has(c.id)
  );
  const totalPosts = cards.reduce((a, c) => a + c.counts.posts, 0);
  const totalNews = cards.reduce((a, c) => a + c.counts.news, 0);
  const totalSite = cards.reduce((a, c) => a + c.counts.site, 0);
  const totalSignals = cards.reduce((a, c) => a + c.signalTotal, 0);
  const busy = cards.filter((c) => c.itemsThisMonth >= 10).length;
  const onMyPage = cards.length + pending.length;
  /* What is waiting in Manage companies: the rest of this tab's catalogue. */
  const catalogue = tracking.companies.filter((c) => inGroup(c.id)).length;

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

  /* EVERY COMPANY THE TEAM KNOWS, FOR THE POP-UP: customers and competitors,
     ticked or not, with what a person needs to decide about each one. */
  const managed: ManagedCompany[] = tracking.companies
    .map((c) => {
      const summary = summaries[c.id];
      return {
        id: c.id,
        name: c.name,
        group: c.group === "competitor" ? ("competitor" as const) : ("customer" as const),
        followers: followers[c.id]?.length ?? 0,
        divisions: divisions[c.id] ?? [],
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
    <ManageCompaniesProvider
      companies={managed}
      group={group}
      isAdmin={isAdmin}
      canWrite={canTrack}
      myIds={viewer.myIds}
      starredIds={viewer.starredIds}
    >
      <MiTabs
        active={group === "competitor" ? "competitors" : "customers"}
        action={
          <span className="flex flex-wrap items-center gap-2.5">
            <RefreshChip updatedAt={meta.updatedAt} health={meta.health} isAdmin={isAdmin} />
            <ManageCompaniesButton group={group} />
            <TrackCompanyButton group={group} canTrack={canTrack} />
          </span>
        }
      >

        <>
      {onMyPage === 0 ? (
        /* NOTHING UNTIL YOU PICK (Anir, Sep 10: "if they haven't set it up...
           nothing should show up here. They have to individually check off
           everything, so it should prompt them to click on Manage
           Companies"). */
        <section className="rise-in flex min-h-[min(560px,calc(100vh-15rem))] flex-col items-center justify-center rounded-2xl border border-dashed border-border-light bg-white px-6 py-14 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[rgba(0,113,227,0.08)] text-[color:var(--ink-bright-blue)]">
            <ListChecks size={22} strokeWidth={2} />
          </span>
          <h2 className="mt-4 text-[17px] font-semibold text-text-primary">
            {group === "competitor"
              ? "Pick the competitors you want to watch"
              : "Pick the customers you want to watch"}
          </h2>
          <p className="mx-auto mt-1.5 max-w-[520px] text-[13px] leading-relaxed text-text-secondary">
            This page is your own. {catalogue > 0 ? (
              <>
                There {catalogue === 1 ? "is" : "are"} {catalogue}{" "}
                {group === "competitor"
                  ? catalogue === 1 ? "competitor" : "competitors"
                  : catalogue === 1 ? "company" : "companies"}{" "}
                to choose from. Tick the ones you care about and their news,
                posts and signals show up here.
              </>
            ) : (
              <>Nothing is in the list yet. Add a {group === "competitor" ? "competitor" : "company"} with its LinkedIn page and it lands here.</>
            )}
          </p>
          <span className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
            <ManageCompaniesButton group={group} variant="cta" />
            {/* One thing to do. The add button only earns its place when
                there is nothing in the list to tick. */}
            {catalogue === 0 && (
              <TrackCompanyButton group={group} canTrack={canTrack} />
            )}
          </span>
        </section>
      ) : (
        <>
      {/* The stagger entrance every other page's cards got in the Aug
          sweep — Market Intel shipped after it and was missed (Anir, Aug 17:
          "the four cards at the top don't animate at all"). */}
      <section className="stagger mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          icon={group === "competitor" ? Swords : Building2}
          label={group === "competitor" ? "Competitors on my page" : "Customers on my page"}
          value={String(onMyPage)}
          sub={
            catalogue > onMyPage
              ? `${busy} busy this month · ${catalogue - onMyPage} more to pick from in Manage ${group === "competitor" ? "competitors" : "companies"}`
              : `${busy} busy this month`
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
        starred={viewer.starredIds}
      />
        </>
      )}
        </>
      </MiTabs>
    </ManageCompaniesProvider>
  );
}
