import {
  ListChecks,
} from "lucide-react";
import type { CardPerson } from "@/components/market-intel/LiveCompanyCard";
import { LiveCompanyGrid } from "@/components/market-intel/LiveCompanyGrid";
import { MiTabs } from "@/components/market-intel/MiTabs";
import { RefreshChip } from "@/components/market-intel/NextRefresh";
import { TrackCompanyButton } from "@/components/market-intel/TrackCompanyButton";
import { ManageCompaniesButton } from "@/components/market-intel/ManageCompaniesButton";
import {
  cardFromSummary,
  personPostsInPageWindow,
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
import { displayPersonName } from "@/lib/personName";

/**
 * THE LIVE DASHBOARD: real mode only, every number on it comes from scraped
 * posts and articles. Built from each company's SUMMARY (Sep 10), so a
 * hundred companies cost a hundred small rows, not a hundred briefings.
 * Companies are ordered by how loud the market is about them (items in the
 * window), so the busiest accounts lead.
 */

export function LiveMarketIntelDashboard({
  summaries,
  defaultView = "tiles",
  meta,
  tracking,
  group = "customer",
  canTrack = true,
  people = {},
  followers = {},
  memberDirectory = {},
  isAdmin = false,
  viewer = { userId: "", myIds: [], starredIds: [] },
}: {
  summaries: Record<string, FeedCompanySummary>;
  defaultView?: "tiles" | "list";
  meta: FeedMeta;
  tracking: MarketIntelTracking;
  /** Post counts per followed person, for the facepiles. */
  people?: Record<string, PersonSummary>;
  /** Who has what, across everybody's lists. */
  followers?: Followers;
  /** Workspace identities behind the follower ids, for the Tracking popup. */
  memberDirectory?: Record<string, { name: string; email?: string | null }>;
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
     Manage companies, and nothing else. Whether a company is collected is a
     separate question (isActiveCompany). */
  const registry = new Map(tracking.companies.map((c) => [c.id, c]));
  const watch: Record<string, WatchState> = {};
  const trackingPeople: Record<string, { id: string; name: string; email?: string | null }[]> = {};
  for (const c of tracking.companies) {
    watch[c.id] = { followers: followers[c.id]?.length ?? 0, byDefault: c.activeByDefault === true };
    trackingPeople[c.id] = (followers[c.id] ?? []).map((id, index) => ({
      id,
      name: memberDirectory[id]?.name || `Workspace member ${index + 1}`,
      email: memberDirectory[id]?.email,
    }));
  }
  const inGroup = (id: string) => (registry.get(id)?.group ?? "customer") === group;
  const myIds = new Set(viewer.myIds);
  const cards = Object.values(summaries)
    .filter((company) => registry.has(company.id) && !registry.get(company.id)?.onboarding && inGroup(company.id) && myIds.has(company.id))
    .map((summary) => ({ ...cardFromSummary(summary), logoUrl: registry.get(summary.id)?.logoUrl || summary.logoUrl || null }))
    .sort((a, b) => b.itemsInWindow - a.itemsInWindow);
  const cardsByRange = Object.fromEntries([1, 7, 30, 90].map(days => [String(days), cards.map(card => ({
    ...cardFromSummary(summaries[card.id], days), logoUrl: card.logoUrl,
  }))]));
  // The dashboard clock describes the companies visible on this dashboard.
  // Meta.updatedAt also moves for the M&A/thought boards, which made a page
  // with one customer say "Updated 36 min ago" above a 51-minute-old card.
  const visibleUpdatedAt = cards
    .map((card) => card.fetchedAt)
    .filter((at) => Number.isFinite(Date.parse(at)))
    .sort()
    .pop() ?? meta.updatedAt;

  const pending = tracking.companies.filter(
    (c) => (c.onboarding || !summaries[c.id]) && inGroup(c.id) && myIds.has(c.id)
  );
  /* What is waiting in Manage companies: the rest of this tab's catalogue. */
  const catalogue = tracking.companies.filter((c) => inGroup(c.id)).length;

  // Followed people per company, worn as a facepile on each card. Nobody is
  // followed at a competitor (Saras, Sep 10), so that bucket carries none.
  const peopleByCompany: Record<string, CardPerson[]> = {};
  if (group !== "competitor") {
    for (const person of tracking.people) {
      (peopleByCompany[person.companyId] ??= []).push({
        id: person.id,
        name: displayPersonName(person.name),
        role: person.role,
        linkedinUrl: person.linkedinUrl,
        photoUrl: person.photoUrl,
        /* The same 3 months the company page counts (Sep 13 loop). */
        posts: personPostsInPageWindow(people[person.id]),
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


  const emptyState = (
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
            {group === "competitor" && catalogue === 0 && (
              <TrackCompanyButton group={group} canTrack={canTrack} />
            )}
          </span>
        </section>
  );

  return (
    <>
      <MiTabs
        active={group === "competitor" ? "competitors" : "customers"}
        action={
          <span className="flex flex-wrap items-center gap-2.5">
            <RefreshChip updatedAt={visibleUpdatedAt} />
            <ManageCompaniesButton group={group} variant="primary" />
          </span>
        }
      >
        <LiveCompanyGrid
          catalogueTotal={catalogue}
          emptyState={emptyState}
          isAdmin={isAdmin}
          key={`${viewer.userId}:${group}`}
          viewerId={viewer.userId}
          defaultView={defaultView}
          cards={cards}
          cardsByRange={cardsByRange}
          pending={pending}
          addedAt={Object.fromEntries(tracking.companies.map(c => [c.id, c.addedAt]))}
          people={peopleByCompany}
          group={group}
          divisions={divisions}
          watch={watch}
          trackingPeople={trackingPeople}
          starred={viewer.starredIds}
        />
      </MiTabs>
    </>
  );
}
