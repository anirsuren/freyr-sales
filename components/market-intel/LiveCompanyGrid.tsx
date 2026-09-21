"use client";

import Link from "next/link";
import { useStoredView } from "@/lib/useStoredView";
import { MiLogo } from "./MiLogo";
import { DivisionChips } from "./DivisionChips";

import { type ReactNode, useEffect, useState } from "react";
import { PendingCompanyCard } from "./PendingCompanyCard";
import { useCollectionStatusRefresh } from "./useCollectionStatusRefresh";
import { useRouter } from "next/navigation";
import {
  ArrowDownAZ,
  ArrowUpRight,
  Globe2,
  LayoutGrid,
  List,
  ArrowDownWideNarrow,
  CalendarDays,
  CalendarRange,
  History,
  Sun,
  Layers,
  Newspaper,
  Radar,
  Radio,
  Star,
  Tag,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";

import { Sparkline } from "@/components/charts/Charts";
import { Avatar } from "@/components/ui/Avatar";
import { ColorSelect, MultiColorSelect } from "@/components/ui/ColorSelect";
import { LinkedInIcon } from "@/components/ui/LinkedInIcon";
import {
  PrioritySearchInput,
  SearchPriority,
} from "@/components/ui/SearchPriority";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import {
  LiveCompanyCard,
  type CardPerson,
} from "@/components/market-intel/LiveCompanyCard";

import { WatchStatus, type WatchState } from "@/components/market-intel/WatchStatus";
import type { CompanyCard } from "@/lib/marketIntelFeed";
import type { TrackedCompany } from "@/lib/marketIntelTracking";
import { outletName } from "@/lib/marketIntelText";
import { DIVISIONS, DIVISION_META, type Division } from "@/lib/offeringMaterials";
import { safeHref } from "@/lib/safeUrl";
import { cn } from "@/lib/utils";

/**
 * The dashboard's card grid plus its toolbar (Anir, Aug 11: "We need search
 * bars everywhere... and a filter underneath the four cards"). Search matches
 * companies AND the people followed inside them, so typing a person's name
 * surfaces their company's card.
 *
 * Sep 10 (Saras): a DIVISION filter (MPR, MDV, CON, or untagged). Every card
 * here is on this person's own list, so the star is not "add it to my page"
 * any more: it is a FAVOURITE inside the list (Anir, Sep 10: "My list does
 * not mean that it is starred. Starred is completely different from my
 * list"), with its own filter.
 */

type Range = "1" | "7" | "30" | "90";
type Sort = "active" | "az" | "za" | "signals" | "people";
const UNTAGGED = "__untagged__";

function MomentumBadge({ card }: { card: CompanyCard }) {
  if (card.momentumPct === null) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(0,113,227,0.08)] px-2 py-0.5 text-[10.5px] font-bold text-[color:var(--ink-bright-blue)] tnum">
        <Newspaper size={10.5} strokeWidth={2.4} />
        {card.itemsThisMonth} this month
      </span>
    );
  }
  const up = card.momentumPct >= 0;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold tnum"
      style={{
        color: up ? "var(--ink-green)" : "#DC2626",
        background: up ? "rgba(26,122,53,0.10)" : "rgba(220,38,38,0.10)",
      }}
    >
      {up ? <TrendingUp size={10.5} strokeWidth={2.4} /> : <TrendingDown size={10.5} strokeWidth={2.4} />}
      {up ? "+" : ""}{card.momentumPct}%
    </span>
  );
}

function ActivityMetric({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: number | string;
  tone: "blue" | "teal" | "orange" | "violet";
}) {
  const styles = {
    blue: "bg-[rgba(0,113,227,0.07)] text-[color:var(--ink-bright-blue)]",
    teal: "bg-[rgba(15,118,110,0.08)] text-[color:var(--ink-teal-deep)]",
    orange: "bg-[rgba(194,65,12,0.08)] text-[color:var(--ink-orange)]",
    violet: "bg-[rgba(124,58,237,0.08)] text-[color:var(--ink-violet-soft)]",
  } as const;
  return (
    <span className={cn("flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1.5", styles[tone])}>
      <span className="shrink-0">{icon}</span>
      <span className="truncate text-[10px] font-semibold text-text-secondary">{label}</span>
      <span className="ml-auto text-[11px] font-bold tnum">{typeof value === "number" ? value.toLocaleString() : value}</span>
    </span>
  );
}

type TrackingPerson = { id: string; name: string; email?: string | null };
type PeoplePanel =
  | { kind: "tracked"; companyName: string; people: CardPerson[] }
  | { kind: "tracking"; companyName: string; people: TrackingPerson[]; activeByDefault: boolean };

function PeopleSummary({ people = [], companyName, onOpen }: { people?: CardPerson[]; companyName: string; onOpen: () => void }) {
  if (people.length === 0) return <span className="text-[11.5px] text-text-tertiary">No people tracked</span>;
  return (
    <button type="button" onClick={onOpen} aria-label={`Show people tracked at ${companyName}`} className="group/pile relative z-0 flex cursor-pointer flex-col items-start gap-1.5 rounded-lg text-left outline-none hover:z-20 focus-visible:z-20 focus-visible:ring-2 focus-visible:ring-blue-primary/30">
      <span className="flex items-center pl-1">
        {people.slice(0, 5).map((person, index) => (
          <span key={person.id} className={cn("relative inline-flex transition-[margin,transform] duration-200 ease-out", index > 0 && "-ml-1 group-hover/pile:ml-1 group-focus-visible/pile:ml-1")}>
            <Avatar name={person.name} src={person.photoUrl} tooltip={person.name} className="h-6 w-6 text-[8px] ring-2 ring-white group-hover/pile:-translate-y-0.5" />
          </span>
        ))}
        {people.length > 5 && <span className="-ml-1 flex h-6 w-6 items-center justify-center rounded-full bg-blue-light text-[8.5px] font-bold text-blue-primary ring-2 ring-white transition-[margin] duration-200 group-hover/pile:ml-1 group-focus-visible/pile:ml-1 tnum">+{people.length - 5}</span>}
      </span>
      <span className="text-[11px] font-semibold text-text-secondary group-hover/pile:text-blue-primary tnum">{people.length} tracked</span>
    </button>
  );
}

function TrackingSummary({ state, companyName, onOpen }: { state: WatchState; companyName: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Show people tracking ${companyName}`}
      className="cursor-pointer rounded-full outline-none transition-[transform,box-shadow] hover:-translate-y-px hover:shadow-sm focus-visible:ring-2 focus-visible:ring-blue-primary/30"
    >
      <WatchStatus state={state} className="whitespace-nowrap" />
    </button>
  );
}

function PeoplePopup({ panel, onClose }: { panel: PeoplePanel | null; onClose: () => void }) {
  const tracked = panel?.kind === "tracked";
  return (
    <Modal open={panel !== null} onClose={onClose} title={panel ? `${tracked ? "People being tracked at" : "People tracking"} ${panel.companyName}` : "People"}>
      {panel?.kind === "tracked" && panel.people.length > 0 ? (
        <div className="space-y-2">
          <p className="mb-3 text-[12.5px] leading-relaxed text-text-secondary">
            {panel.people.length} {panel.people.length === 1 ? "person is" : "people are"} included in this company’s intelligence feed.
          </p>
          {panel.people.map(person => (
            <div key={person.id} className="flex items-center gap-3 rounded-xl border border-border-light bg-white p-3">
              <Avatar name={person.name} src={person.photoUrl} className="h-10 w-10 shrink-0 text-[12px]" />
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-semibold text-text-primary">{person.name}</p>
                <p className="text-[11.5px] text-text-secondary">{person.role}</p>
              </div>
              <span className="whitespace-nowrap rounded-full bg-blue-light px-2.5 py-1 text-[10.5px] font-semibold text-blue-primary tnum">
                {person.posts} {person.posts === 1 ? "post" : "posts"}
              </span>
            </div>
          ))}
        </div>
      ) : panel?.kind === "tracking" && panel.people.length > 0 ? (
        <div className="space-y-2">
          <p className="mb-3 text-[12.5px] leading-relaxed text-text-secondary">
            {panel.people.length} {panel.people.length === 1 ? "person has" : "people have"} this company on their Market Intelligence list.
          </p>
          {panel.people.map(person => (
            <div key={person.id} className="flex items-center gap-3 rounded-xl border border-border-light bg-white p-3">
              <Avatar name={person.name} className="h-10 w-10 shrink-0 text-[12px]" />
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-semibold text-text-primary">{person.name}</p>
                <p className="text-[11.5px] text-text-secondary">{person.email || "Workspace member"}</p>
              </div>
            </div>
          ))}
        </div>
      ) : panel?.kind === "tracking" && panel.activeByDefault ? (
        <div className="rounded-xl border border-border-light bg-surface p-5 text-center">
          <Radio className="mx-auto text-[color:var(--ink-green)]" size={22} />
          <p className="mt-2 text-[13px] font-semibold text-text-primary">Active by default</p>
          <p className="mt-1 text-[12px] text-text-secondary">This company is collected every day even though nobody has added it to a personal list.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border-light bg-surface p-6 text-center text-[12.5px] text-text-secondary">
          <Users className="mx-auto mb-2 text-text-tertiary" size={22} />
          No people to show yet.
        </div>
      )}
    </Modal>
  );
}

export function LiveCompanyGrid({
  cards,
  viewerId = "",
  defaultView = "tiles",
  pending,
  people,
  group,
  divisions,
  watch,
  trackingPeople = {},
  starred = [],
  isAdmin = false,
  cardsByRange,
  catalogueTotal,
  emptyState,
}: {
  catalogueTotal?: number;
  emptyState?: ReactNode;
  viewerId?: string;
  defaultView?: "tiles" | "list";
  cards: CompanyCard[];
  pending: TrackedCompany[];
  people: Record<string, CardPerson[]>;
  group: "customer" | "competitor";
  /** Division tags by company id, for every company on the page. */
  divisions: Record<string, Division[]>;
  /** How many people have each company, for the Active chip. */
  watch: Record<string, WatchState>;
  /** Workspace members who have each company on their personal list. */
  trackingPeople?: Record<string, TrackingPerson[]>;
  /** This person's favourites, from the server. */
  starred?: string[];
  isAdmin?: boolean;
  addedAt?: Record<string,string>;
  cardsByRange?: Record<string, CompanyCard[]>;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [unstar, setUnstar] = useState<{id: string; name: string} | null>(null);
  const [peoplePanel, setPeoplePanel] = useState<PeoplePanel | null>(null);
  const [query, setQuery] = useState("");
  const [range, setRange] = useState<Range>("90");
  const [view, setView] = useStoredView<"tiles" | "list">(`freyr.mi.${viewerId}.${group}.view`, defaultView, ["tiles", "list"]);
  const [tileSort, setTileSort] = useStoredView<Sort>(`freyr.mi.${viewerId}.${group}.tiles.sort`, "active", ["active", "az", "za", "signals", "people"]);
  const [listSort, setListSort] = useStoredView<Sort>(`freyr.mi.${viewerId}.${group}.list.sort`, "az", ["active", "az", "za", "signals", "people"]);
  const sort = view === "list" ? listSort : tileSort;
  const setSort = view === "list" ? setListSort : setTileSort;
  const [divisionFilter, setDivisionFilter] = useState<string[]>([]);
  const [starredOnly, setStarredOnly] = useState(false);
  const [stars, setStars] = useState<Set<string>>(new Set(starred));
  const stateOf = (id: string): WatchState => watch[id] ?? { followers: 0 };

  useCollectionStatusRefresh(pending);
  useEffect(()=>{const added=()=>{setQuery("");setDivisionFilter([]);setStarredOnly(false);};window.addEventListener("mi-company-added",added);return ()=>window.removeEventListener("mi-company-added",added);},[]);
  useEffect(() => setStars(new Set(starred)), [starred]);

  /* THE STAR IS A FAVOURITE, not the list itself: every card here is already
     on this person's list. Unstarring leaves the card where it is. */
  const setStar = async (id: string, on: boolean) => {
    const before = new Set(stars);
    const next = new Set(stars);
    if (on) next.add(id);
    else next.delete(id);
    setStars(next);
    try {
      const res = await fetch("/api/market-intel/bookmarks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, star: on }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not save.");
      const name = cards.find((c) => c.id === id)?.name ?? pending.find((c) => c.id === id)?.name ?? "It";
      toast(on ? `${name} is starred.` : `${name} is no longer starred. It stays on your page.`);
      router.refresh();
    } catch (caught) {
      setStars(before);
      toast(caught instanceof Error ? caught.message : "Could not save your list.", "error");
    }
  };

  const q = query.trim().toLowerCase();
  const matches = (id: string, name: string, industry?: string | null) =>
    !q ||
    name.toLowerCase().includes(q) ||
    (industry ?? "").toLowerCase().includes(q) ||
    /* A division code finds its companies (Anir, Sep 11: typing "mdv"). */
    (divisions[id] ?? []).some(
      (d) => d.toLowerCase() === q || (q.length >= 3 && DIVISION_META[d].label.toLowerCase().includes(q))
    ) ||
    (people[id] ?? []).some(
      (p) =>
        p.name.toLowerCase().includes(q) || p.role.toLowerCase().includes(q)
    );

  const passesDivision = (id: string) => {
    if (divisionFilter.length === 0) return true;
    const tags = divisions[id] ?? [];
    if (tags.length === 0) return divisionFilter.includes(UNTAGGED);
    return tags.some((d) => divisionFilter.includes(d));
  };

  const passesStar = (id: string) => !starredOnly || stars.has(id);

  const shown = (cardsByRange?.[range] ?? cards)
    .filter((c) => matches(c.id, c.name) && passesDivision(c.id) && passesStar(c.id))
    .sort((a, b) =>
      sort === "az" ? a.name.localeCompare(b.name)
        : sort === "za" ? b.name.localeCompare(a.name)
        : sort === "signals" ? b.signalTotal - a.signalTotal || a.name.localeCompare(b.name)
        : sort === "people" ? (people[b.id]?.length ?? 0) - (people[a.id]?.length ?? 0) || a.name.localeCompare(b.name)
        : b.itemsInWindow - a.itemsInWindow || a.name.localeCompare(b.name)
    );

  const shownPending = pending.filter(
    c => matches(c.id, c.name, c.industry) && passesDivision(c.id) && passesStar(c.id)
  );

  const listRows = [
    ...shown.map(card => ({ id: card.id, name: card.name, card })),
    ...shownPending.map(company => ({ id: company.id, name: company.name, card: null })),
  ].sort((a, b) => {
    if (sort === "az") return a.name.localeCompare(b.name);
    if (sort === "za") return b.name.localeCompare(a.name);
    const score = (row: typeof a) => sort === "people" ? people[row.id]?.length ?? 0
      : sort === "signals" ? row.card?.signalTotal ?? -1 : row.card?.itemsInWindow ?? -1;
    return score(b) - score(a) || a.name.localeCompare(b.name);
  });

  const total = cards.length + pending.length;
  const visible = shown.length + shownPending.length;
  const starCount =
    cards.filter((c) => stars.has(c.id)).length + pending.filter((c) => stars.has(c.id)).length;
  const untaggedCount = [...cards.map((c) => c.id), ...pending.map((c) => c.id)].filter(
    (id) => (divisions[id] ?? []).length === 0
  ).length;

  return (
    <>
      <PeoplePopup panel={peoplePanel} onClose={() => setPeoplePanel(null)} />
      <SearchPriority
        query={query}
        className="rise-in mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-border-light bg-[var(--surface)] p-2.5"
      >
        <PrioritySearchInput
          grow
          className="min-w-0 basis-[240px] flex-1"
          value={query}
          onChange={setQuery}
          placeholder={
            group === "competitor"
              ? "Search competitors…"
              : "Search customers or people…"
          }
          ariaLabel={
            group === "competitor"
              ? "Search competitors"
              : "Search customers"
          }
        />
        <span className="px-1 text-[12px] font-medium text-text-secondary tnum">
          {visible} of {total}
        </span>
        {/* STARRED: a favourite inside my own list, not the list itself. */}
        <button
          type="button"
          onClick={() => setStarredOnly((v) => !v)}
          aria-pressed={starredOnly}
          title="Only the companies you starred"
          className={cn(
            "flex h-[34px] cursor-pointer items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-semibold transition-colors",
            starredOnly
              ? "border-transparent bg-[#B45309] text-white"
              : "border-border-light bg-white text-text-secondary hover:border-blue-subtle hover:text-text-primary"
          )}
        >
          <Star size={13} strokeWidth={2.2} fill={starredOnly ? "currentColor" : "none"} />
          Starred
          <span className={cn("tnum", starredOnly ? "opacity-85" : "text-text-tertiary")}>{starCount}</span>
        </button>
        <MultiColorSelect
          values={divisionFilter}
          onChange={setDivisionFilter}
          ariaLabel="Filter by division"
          minWidth={170}
          allLabel="All divisions"
          allIcon={Layers}
          options={[
            ...DIVISIONS.map((d) => ({
              value: d,
              label: `${DIVISION_META[d].label} (${d})`,
              color: DIVISION_META[d].color,
              icon: DIVISION_META[d].icon,
            })),
            { value: UNTAGGED, label: `Untagged (${untaggedCount})`, color: "#5B6B8C", icon: Tag },
          ]}
        />
        <ColorSelect
          value={range}
          onChange={value => setRange(value as Range)}
          ariaLabel="Filter by time range"
          minWidth={168}
          options={[
            { value: "1", label: "Past day", color: "var(--ink-orange)", icon: Sun },
            { value: "7", label: "Past week", color: "var(--ink-bright-blue)", icon: CalendarDays },
            { value: "30", label: "Past month", color: "var(--ink-violet)", icon: CalendarRange },
            { value: "90", label: "Past 3 months", color: "var(--ink-teal-deep)", icon: History },
          ]}
        />
        <ColorSelect
          value={sort}
          onChange={(v) => setSort(v as Sort)}
          ariaLabel="Sort companies"
          minWidth={170}
          options={[
            { value: "active", label: "By most items", icon: ArrowDownWideNarrow, color: "var(--ink-bright-blue)" },
            { value: "az", label: "By name (A to Z)", icon: ArrowDownAZ, color: "var(--ink-magenta)" },
            { value: "za", label: "By name (Z to A)", icon: ArrowDownAZ, color: "var(--ink-magenta)" },
            { value: "signals", label: "By most signals", color: "var(--ink-violet)" },
            ...(group === "customer" ? [{ value: "people", label: "By people tracked", color: "var(--ink-teal-deep)" }] : []),
          ]}
        />
        <div className="ml-auto inline-flex shrink-0 items-center rounded-lg border border-border-light bg-white p-0.5" role="group" aria-label="Company view">
          {([{ value: "tiles", label: "Tile view", Icon: LayoutGrid }, { value: "list", label: "List view", Icon: List }] as const).map(option => (
            <button key={option.value} type="button" title={option.label} aria-label={option.label} aria-pressed={view === option.value} onClick={() => setView(option.value)}
              className={cn("flex h-8 w-8 cursor-pointer items-center justify-center rounded-md transition-colors", view === option.value ? "bg-blue-light text-blue-primary" : "text-text-tertiary hover:bg-surface")}>
              <option.Icon size={15} />
            </button>
          ))}
        </div>
      </SearchPriority>
      {catalogueTotal !== undefined && (
        <p className="mb-4 text-[12px] text-text-secondary tnum">
          {catalogueTotal}{" "}
          {group === "competitor"
            ? catalogueTotal === 1 ? "competitor" : "competitors"
            : catalogueTotal === 1 ? "company" : "companies"}{" "}
          total · {total} tracked by you
        </p>
      )}

      {total === 0 && emptyState ? emptyState : visible === 0 ? (
        <div className="rounded-xl border border-dashed border-border-light bg-white p-10 text-center text-[13px] text-text-secondary">
          {starredOnly && starCount === 0
            ? "Nothing starred yet. Press the star on any card to mark a favourite."
            : `Nothing matches${q ? ` “${query.trim()}”` : " those filters"}. Clear the ${q ? "search" : "filters"} to see all ${total} ${group === "competitor" ? "competitors" : "customers"} on your page.`}
        </div>
      ) : view === "list" ? (
        <div key="company-list" className="mi-view-list-in overflow-x-auto rounded-2xl border border-border-light bg-white shadow-[0_12px_36px_-32px_rgba(15,23,42,0.45)]">
          <div className={cn("min-w-[1370px]", group === "customer" && "min-w-[1450px]")}>
            <div
              className="grid items-center gap-5 border-b border-border-light bg-surface/80 px-5 py-3 text-[10.5px] font-bold uppercase tracking-[0.08em] text-text-tertiary"
              style={{ gridTemplateColumns: group === "customer" ? "250px 180px 225px minmax(295px,1fr) 130px 120px 90px" : "260px 190px 240px minmax(330px,1fr) 120px 90px" }}
            >
              <span>Company</span>
              <span>Intelligence pulse</span>
              <span>Activity mix</span>
              <span>Latest intelligence</span>
              {group === "customer" && <span>People</span>}
              <span>Tracking</span>
              <span>Freshness</span>
            </div>
            <div className="mi-list-stagger divide-y divide-border-light">
              {listRows.map(row => {
                const card = row.card;
                const rowTemplate = group === "customer" ? "250px 180px 225px minmax(295px,1fr) 130px 120px 90px" : "260px 190px 240px minmax(330px,1fr) 120px 90px";
                if (!card) return (
                  <div key={row.id} className="relative grid min-h-[106px] items-center gap-5 px-5 py-4" style={{ gridTemplateColumns: rowTemplate }}>
                    <div className="flex min-w-0 items-center gap-2.5">
                      <button type="button" aria-label={`${stars.has(row.id) ? "Unstar" : "Star"} ${row.name}`} aria-pressed={stars.has(row.id)} onClick={() => stars.has(row.id) ? setUnstar({id: row.id, name: row.name}) : void setStar(row.id, true)} className={cn("flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-surface", stars.has(row.id) ? "text-amber-600" : "text-text-tertiary")}><Star size={15} fill={stars.has(row.id) ? "currentColor" : "none"} /></button>
                      <MiLogo name={row.name} className="h-10 w-10 shrink-0" />
                      <span className="flex min-w-0 flex-col items-start"><span className="block text-[13.5px] font-semibold leading-snug text-text-primary">{row.name}</span><DivisionChips divisions={divisions[row.id] ?? []} className="mt-1" /></span>
                    </div>
                    <div><span className="inline-flex items-center gap-2 rounded-full bg-blue-light px-2.5 py-1 text-[11px] font-semibold text-blue-primary"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-primary" />Collecting first updates</span></div>
                    <div className="grid grid-cols-2 gap-1.5 opacity-55"><span className="h-7 rounded-lg bg-surface" /><span className="h-7 rounded-lg bg-surface" /><span className="h-7 rounded-lg bg-surface" /><span className="h-7 rounded-lg bg-surface" /></div>
                    <p className="text-[12px] leading-relaxed text-text-tertiary">The first verified posts, news, website updates, and signals will appear here.</p>
                    {group === "customer" && <PeopleSummary people={people[row.id]} companyName={row.name} onOpen={() => setPeoplePanel({ kind: "tracked", companyName: row.name, people: people[row.id] ?? [] })} />}
                    {isAdmin ? <TrackingSummary state={stateOf(row.id)} companyName={row.name} onOpen={() => setPeoplePanel({ kind: "tracking", companyName: row.name, people: trackingPeople[row.id] ?? [], activeByDefault: stateOf(row.id).byDefault === true })} /> : <span className="text-text-tertiary">—</span>}
                    <span className="whitespace-nowrap text-[11px] font-medium text-text-tertiary">Pending</span>
                  </div>
                );

                const story = card.stories[0] ?? null;
                const storyHref = safeHref(story?.url);
                const count = (value: number) => card.countsKnown === false ? "—" : value;
                return (
                  <div key={card.id} className="group/row relative grid min-h-[118px] items-center gap-5 px-5 py-4 transition-[background-color,box-shadow] duration-200 hover:bg-[rgba(0,113,227,0.025)] hover:shadow-[inset_3px_0_0_var(--blue-primary)]" style={{ gridTemplateColumns: rowTemplate }}>
                    <div className="flex min-w-0 items-center gap-2.5">
                      <button type="button" aria-label={`${stars.has(card.id) ? "Unstar" : "Star"} ${card.name}`} aria-pressed={stars.has(card.id)} onClick={() => stars.has(card.id) ? setUnstar({id:card.id,name:card.name}) : void setStar(card.id,true)} className={cn("flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-white hover:shadow-sm", stars.has(card.id) ? "text-amber-600" : "text-text-tertiary hover:text-amber-600")}><Star size={15} strokeWidth={2.2} fill={stars.has(card.id) ? "currentColor" : "none"} /></button>
                      <Link href={`/market-intel/${card.id}`} className="flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-primary">
                        <MiLogo name={card.name} logoUrl={card.logoUrl} className="h-11 w-11 shrink-0" />
                        <span className="flex min-w-0 flex-col items-start">
                          <span className="block text-[13.5px] font-semibold leading-snug text-text-primary transition-colors group-hover/row:text-blue-primary">
                            {card.name}
                            <ArrowUpRight size={12} className="ml-1 inline-block align-text-top opacity-0 transition-opacity group-hover/row:opacity-100" />
                          </span>
                          <DivisionChips divisions={divisions[card.id] ?? []} className="mt-1" />
                        </span>
                      </Link>
                    </div>
                    <div className="min-w-0">
                      <div className="mb-1.5 flex items-center justify-between gap-2"><span className="text-[10.5px] font-semibold text-text-secondary tnum">{card.itemsInWindow} in {card.windowDays ?? 90}d</span><MomentumBadge card={card} /></div>
                      <Sparkline points={card.trend} height={38} xLabels={card.trendLabels} unit="items" label={`${card.name} activity trend`} />
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <ActivityMetric icon={<LinkedInIcon size={11} />} label="Posts" value={count(card.counts.posts)} tone="blue" />
                      <ActivityMetric icon={<Newspaper size={11} strokeWidth={2.2} />} label="News" value={count(card.counts.news)} tone="teal" />
                      <ActivityMetric icon={<Globe2 size={11} strokeWidth={2.2} />} label="Website" value={count(card.counts.site)} tone="orange" />
                      <ActivityMetric icon={<Radar size={11} strokeWidth={2.2} />} label="Signals" value={count(card.signalTotal)} tone="violet" />
                    </div>
                    <div className="min-w-0">
                      {story ? <>
                        <p className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.055em] text-text-tertiary">{outletName(story.source, story.url)}</p>
                        {storyHref ? <a href={storyHref} target="_blank" rel="noreferrer" className="group/story block overflow-hidden text-[12px] font-medium leading-[1.45] text-text-secondary transition-colors hover:text-blue-primary [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3]">{story.title}<ArrowUpRight size={12} className="ml-1 inline-block align-text-top opacity-0 transition-opacity group-hover/story:opacity-100" /></a> : <p className="overflow-hidden text-[12px] font-medium leading-[1.45] text-text-secondary [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3]">{story.title}</p>}
                      </> : <p className="text-[12px] leading-relaxed text-text-tertiary">No recent headline in this window. Activity tracking is still active.</p>}
                    </div>
                    {group === "customer" && <PeopleSummary people={people[card.id]} companyName={card.name} onOpen={() => setPeoplePanel({ kind: "tracked", companyName: card.name, people: people[card.id] ?? [] })} />}
                    {isAdmin ? <TrackingSummary state={stateOf(card.id)} companyName={card.name} onOpen={() => setPeoplePanel({ kind: "tracking", companyName: card.name, people: trackingPeople[card.id] ?? [], activeByDefault: stateOf(card.id).byDefault === true })} /> : <span className="text-text-tertiary">—</span>}
                    <span className="whitespace-nowrap text-[11px] font-semibold text-text-secondary">{card.updatedLabel}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <section key="company-tiles" className="mi-view-tiles-in grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] gap-4 stagger">
          {shownPending.map(company=><PendingCompanyCard key={company.id} company={company} divisions={divisions[company.id] ?? []}/>)}
          {shown.map((card) => (
            <LiveCompanyCard
              key={card.id}
              card={card}
              people={people[card.id]}
              divisions={divisions[card.id] ?? []}
              starred={stars.has(card.id)}
              onStar={(on) => on ? void setStar(card.id, true) : setUnstar({id: card.id, name: card.name})}
              watch={isAdmin ? stateOf(card.id) : undefined}
            />
          ))}


        </section>
      )}
      <ConfirmDialog
        open={unstar !== null}
        onClose={() => setUnstar(null)}
        onConfirm={() => { if (unstar) void setStar(unstar.id, false); setUnstar(null); }}
        tone="primary"
        title="Remove star?"
        body={`${unstar?.name ?? "This company"} will no longer be starred. It will stay on your page.`}
        confirmLabel="Remove star"
      />
    </>
  );
}
