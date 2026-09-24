"use client";

import Link from "next/link";
import { useStoredView } from "@/lib/useStoredView";
import { MiLogo } from "./MiLogo";
import { DivisionChips } from "./DivisionChips";
import { BookmarkedItems } from "./BookmarkedItems";

import { type ReactNode, useEffect, useState } from "react";
import { useCollectionStatusRefresh } from "./useCollectionStatusRefresh";
import { useRouter } from "next/navigation";
import {
  ArrowDownAZ,
  ArrowUpRight,
  Globe2,
  ArrowDownWideNarrow,
  LayoutGrid,
  List,
  MessageSquare,
  Newspaper,
  Radio,
  Repeat2,
  Star,
  Tag,
  ThumbsUp,
  Users,
} from "lucide-react";

import { Avatar } from "@/components/ui/Avatar";
import { ColorSelect } from "@/components/ui/ColorSelect";
import { FilterMenu } from "@/components/ui/FilterMenu";
import { LinkedInIcon } from "@/components/ui/LinkedInIcon";
import {
  PrioritySearchInput,
  SearchPriority,
} from "@/components/ui/SearchPriority";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { LiveCompanyCard, type CardPerson } from "@/components/market-intel/LiveCompanyCard";

import { WatchStatus, type WatchState } from "@/components/market-intel/WatchStatus";
import type { CompanyCard } from "@/lib/marketIntelFeed";
import type { TrackedCompany } from "@/lib/marketIntelTracking";
import { outletName } from "@/lib/marketIntelText";
import { DIVISIONS, DIVISION_META, type Division } from "@/lib/offeringMaterials";
import { linkedInUrl, safeHref } from "@/lib/safeUrl";
import { cn } from "@/lib/utils";
import { fmtWhen } from "@/lib/whenLabel";
import type { FeedPost } from "@/lib/marketIntelFeed";

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
type Sort = "active" | "az" | "za" | "people";
const UNTAGGED = "__untagged__";

function ActivityMetric({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: number | string;
  tone: "blue" | "teal" | "orange";
}) {
  const styles = {
    blue: "bg-[rgba(0,113,227,0.07)] text-[color:var(--ink-bright-blue)]",
    teal: "bg-[rgba(15,118,110,0.08)] text-[color:var(--ink-teal-deep)]",
    orange: "bg-[rgba(194,65,12,0.08)] text-[color:var(--ink-orange)]",
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
  | { kind: "tracked"; companyId: string; companyName: string; people: CardPerson[] }
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

function TrackedPeoplePreview({ companyId, companyName, people }: { companyId: string; companyName: string; people: CardPerson[] }) {
  const [selectedId, setSelectedId] = useState(() => people.find((person) => person.posts > 0)?.id ?? people[0]?.id ?? "");
  const [postCache, setPostCache] = useState<Record<string, { posts: FeedPost[]; collectedCount: number; pending: boolean }>>({});
  const [error, setError] = useState("");
  const selected = people.find((person) => person.id === selectedId) ?? people[0];
  const selectedPosts = selected ? postCache[selected.id] : undefined;

  useEffect(() => {
    if (!selectedId || postCache[selectedId]) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ companyId, personId: selectedId });
    fetch(`/api/market-intel/people-posts?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load posts.");
        setPostCache((previous) => ({ ...previous, [selectedId]: { posts: data.posts ?? [], collectedCount: data.collectedCount ?? 0, pending: data.pending === true } }));
        setError("");
      })
      .catch((caught) => {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Could not load posts.");
      });
    return () => controller.abort();
  }, [companyId, selectedId, postCache]);

  return (
    <div>
      <p className="mb-4 text-[12.5px] leading-relaxed text-text-secondary">
        {people.length} {people.length === 1 ? "person is" : "people are"} included in {companyName}’s intelligence feed. Select someone to read their collected posts from the past 3 months.
      </p>
      <div className="grid gap-4 md:grid-cols-[minmax(225px,0.8fr)_minmax(0,1.2fr)]">
        <div className="space-y-2">
          {people.map((person) => {
            const active = person.id === selected?.id;
            const profileHref = linkedInUrl(person.linkedinUrl);
            return (
              <div key={person.id} className={cn("flex items-center gap-2 rounded-xl border p-2.5 transition-colors", active ? "border-blue-subtle bg-blue-light/50" : "border-border-light bg-white hover:bg-surface")}>
                <button type="button" onClick={() => { setSelectedId(person.id); setError(""); }} aria-pressed={active} aria-label={`Show posts by ${person.name}`} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-lg text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-primary">
                  <Avatar name={person.name} src={person.photoUrl} className="h-10 w-10 shrink-0 text-[12px]" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold leading-snug text-text-primary">{person.name}</span>
                    <span className="block text-[11px] leading-snug text-text-secondary">{person.role || "Tracked person"}</span>
                    <span className="mt-1 block text-[10.5px] font-semibold text-blue-primary tnum">{person.posts} {person.posts === 1 ? "post" : "posts"}</span>
                  </span>
                </button>
                {profileHref && <a href={profileHref} target="_blank" rel="noreferrer" aria-label={`Open ${person.name} on LinkedIn`} title="Open LinkedIn profile" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border-light bg-white text-blue-primary transition-colors hover:border-blue-subtle hover:bg-blue-light focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-primary"><LinkedInIcon size={15} /></a>}
              </div>
            );
          })}
        </div>
        <section aria-label={selected ? `Posts by ${selected.name}` : "Posts"} className="min-h-[280px] rounded-xl border border-border-light bg-surface/50 p-3 md:max-h-[min(62vh,620px)] md:overflow-y-auto">
          <div className="mb-3 flex items-baseline justify-between gap-3 px-1">
            <h3 className="text-[13px] font-semibold text-text-primary">{selected?.name ?? "Posts"}</h3>
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.055em] text-text-tertiary">Recent posts</span>
          </div>
          {error ? <p role="alert" className="rounded-lg bg-white p-4 text-[12px] text-text-secondary">{error}</p>
            : !selectedPosts ? <p className="rounded-lg bg-white p-4 text-[12px] text-text-secondary">Loading posts…</p>
            : selectedPosts.posts.length === 0 ? <p className="rounded-lg bg-white p-4 text-[12px] leading-relaxed text-text-secondary">{selectedPosts.pending ? "Posts have not been collected for this person yet." : "No public posts were collected in the past 3 months."}</p>
            : <div className="space-y-2.5">
              {selectedPosts.collectedCount > selectedPosts.posts.length && <p className="px-1 text-[11px] text-text-secondary">Repeated captures of the same post are shown once.</p>}
              {selectedPosts.posts.map((post, index) => {
                const href = safeHref(post.url);
                return <article key={`${post.url}-${index}`} className="rounded-xl border border-border-light bg-white p-3.5">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-[10.5px] font-semibold text-text-tertiary" suppressHydrationWarning>{fmtWhen(post.date) || "Date unavailable"}</span>
                    {href && <a href={href} target="_blank" rel="noreferrer" aria-label={`Open ${selected.name}'s post on LinkedIn`} className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-blue-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-primary">Open post <ArrowUpRight size={12} /></a>}
                  </div>
                  <p className="whitespace-pre-line break-words text-[12.5px] leading-relaxed text-text-primary">{post.text}</p>
                  {(post.reactions != null || post.comments != null || post.reposts != null) && <div className="mt-3 flex items-center gap-4 border-t border-border-light pt-2.5 text-[10.5px] text-text-tertiary tnum">
                    {post.reactions != null && <span className="inline-flex items-center gap-1"><ThumbsUp size={12} />{post.reactions}</span>}
                    {post.comments != null && <span className="inline-flex items-center gap-1"><MessageSquare size={12} />{post.comments}</span>}
                    {post.reposts != null && <span className="inline-flex items-center gap-1"><Repeat2 size={12} />{post.reposts}</span>}
                  </div>}
                </article>;
              })}</div>}
        </section>
      </div>
    </div>
  );
}

function PeoplePopup({ panel, onClose }: { panel: PeoplePanel | null; onClose: () => void }) {
  const tracked = panel?.kind === "tracked";
  return (
    <Modal open={panel !== null} onClose={onClose} size={tracked ? "workflow" : "default"} dialogClassName={tracked ? "!max-w-[min(900px,calc(100vw-2rem))]" : undefined} title={panel ? `${tracked ? "People being tracked at" : "People tracking"} ${panel.companyName}` : "People"}>
      {panel?.kind === "tracked" && panel.people.length > 0 ? (
        <TrackedPeoplePreview companyId={panel.companyId} companyName={panel.companyName} people={panel.people} />
      ) : panel?.kind === "tracking" && panel.people.length > 0 ? (
        <div className="space-y-2">
          <p className="mb-3 text-[12.5px] leading-relaxed text-text-secondary">
            {panel.people.length} {panel.people.length === 1 ? "person has" : "people have"} this company on their Market Intel list.
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
  pending,
  people,
  group,
  divisions,
  watch,
  trackingPeople = {},
  starred = [],
  companyDirectory = {},
  isAdmin = false,
  cardsByRange,
  catalogueTotal,
  emptyState,
}: {
  catalogueTotal?: number;
  emptyState?: ReactNode;
  viewerId?: string;
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
  companyDirectory?: Record<string, { name: string; logoUrl?: string | null; group?: "customer" | "competitor" }>;
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
  const [sort, setSort] = useStoredView<Sort>(`freyr.mi.${viewerId}.${group}.list.sort`, "az", ["active", "az", "za", "people"]);
  const [divisionFilter, setDivisionFilter] = useState<string[]>([]);
  const [starredOnly, setStarredOnly] = useState(false);
  const [view, setView] = useState<"companies" | "bookmarks">("companies");
  const [layout, setLayout] = useStoredView<"table" | "tile">(`freyr.mi.${viewerId}.${group}.layout`, "table", ["table", "tile"]);
  const [stars, setStars] = useState<Set<string>>(new Set(starred));
  const stateOf = (id: string): WatchState => watch[id] ?? { followers: 0 };

  useCollectionStatusRefresh(pending);
  useEffect(()=>{const added=()=>{setQuery("");setDivisionFilter([]);setStarredOnly(false);setView("companies");};window.addEventListener("mi-company-added",added);return ()=>window.removeEventListener("mi-company-added",added);},[]);
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
    const score = (row: typeof a) => sort === "people" ? people[row.id]?.length ?? 0 : row.card?.itemsInWindow ?? -1;
    return score(b) - score(a) || a.name.localeCompare(b.name);
  });

  const total = cards.length + pending.length;
  const visible = shown.length + shownPending.length;
  const starCount =
    cards.filter((c) => stars.has(c.id)).length + pending.filter((c) => stars.has(c.id)).length;
  const untaggedCount = [...cards.map((c) => c.id), ...pending.map((c) => c.id)].filter(
    (id) => (divisions[id] ?? []).length === 0
  ).length;
  const listColumns = [
    "260px", "135px", "145px", "minmax(410px,1fr)",
    ...(group === "customer" ? ["130px"] : []),
    ...(isAdmin ? ["125px"] : []),
    "115px",
  ].join(" ");

  return (
    <>
      <PeoplePopup panel={peoplePanel} onClose={() => setPeoplePanel(null)} />
      <SearchPriority
        query={query}
        className="rise-in mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-border-light bg-[var(--surface)] p-2.5"
      >
        <PrioritySearchInput
          grow
          className="min-w-0 basis-[180px] flex-1"
          value={query}
          onChange={setQuery}
          placeholder={
            view === "bookmarks" ? "Search bookmarked items or companies…" : group === "competitor"
              ? "Search competitors…"
              : "Search customers or people…"
          }
          ariaLabel={
            view === "bookmarks" ? "Search bookmarked items" : group === "competitor"
              ? "Search competitors"
              : "Search customers"
          }
        />
        {view === "companies" && <span className="px-1 text-[12px] font-medium text-text-secondary tnum">{visible} of {total}</span>}
        <FilterMenu
          ariaLabel={`Filter ${group === "competitor" ? "competitors" : "customers"}`}
          groups={[
            {
              key: "saved", label: "Saved view",
              values: view === "bookmarks" ? ["bookmarks"] : starredOnly ? ["starred"] : [],
              onChange: next => {
                const selected = next.at(-1);
                setView(selected === "bookmarks" ? "bookmarks" : "companies");
                setStarredOnly(selected === "starred");
              },
              options: [
                { value: "starred", label: `${group === "competitor" ? "Starred competitors" : "Starred companies"} (${starCount})`, icon: Star },
                { value: "bookmarks", label: "Bookmarked items" },
              ],
            },
            {
              key: "division", label: "Division", values: divisionFilter, onChange: setDivisionFilter,
              options: [
                ...DIVISIONS.map(d => ({ value: d, label: DIVISION_META[d].label, badge: DIVISION_META[d].short, color: DIVISION_META[d].color, icon: DIVISION_META[d].icon })),
                { value: UNTAGGED, label: `Untagged (${untaggedCount})`, icon: Tag },
              ],
            },
            {
              key: "period", label: "Time period", values: range === "90" ? [] : [range],
              onChange: next => setRange((next.at(-1) as Range | undefined) ?? "90"),
              options: [
                { value: "1", label: "Past day" },
                { value: "7", label: "Past week" },
                { value: "30", label: "Past month" },
                { value: "90", label: "Past 3 months (default)" },
              ],
            },
          ]}
          onClearAll={() => { setView("companies"); setStarredOnly(false); setDivisionFilter([]); setRange("90"); }}
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
            ...(group === "customer" ? [{ value: "people", label: "By people tracked", color: "var(--ink-teal-deep)" }] : []),
          ]}
        />
        <ColorSelect
          value={layout}
          onChange={value => setLayout(value as "table" | "tile")}
          ariaLabel={`Company view: ${layout === "table" ? "Table" : "Tile"}`}
          iconOnly
          options={[
            { value: "table", label: "Table view", icon: List, color: "var(--ink-bright-blue)" },
            { value: "tile", label: "Tile view", icon: LayoutGrid, color: "var(--ink-bright-blue)" },
          ]}
        />
      </SearchPriority>
      {view === "companies" && catalogueTotal !== undefined && (
        <p className="mb-4 text-[12px] text-text-secondary tnum">
          {catalogueTotal}{" "}
          {group === "competitor"
            ? catalogueTotal === 1 ? "competitor" : "competitors"
            : catalogueTotal === 1 ? "company" : "companies"}{" "}
          total · {total} tracked by you
        </p>
      )}

      {view === "bookmarks" ? <BookmarkedItems query={query} companies={companyDirectory} group={group} /> : total === 0 && emptyState ? emptyState : visible === 0 ? (
        <div className="rounded-xl border border-dashed border-border-light bg-white p-10 text-center text-[13px] text-text-secondary">
          {starredOnly && starCount === 0
            ? "Nothing starred yet. Press the star on any card to mark a favourite."
            : `Nothing matches${q ? ` “${query.trim()}”` : " those filters"}. Clear the ${q ? "search" : "filters"} to see all ${total} ${group === "competitor" ? "competitors" : "customers"} on your page.`}
        </div>
      ) : layout === "table" ? (
        <div key="company-list" className="mi-view-list-in overflow-x-auto rounded-2xl border border-border-light bg-white shadow-[0_12px_36px_-32px_rgba(15,23,42,0.45)]">
          <div className={cn("min-w-[1120px]", group === "customer" && "min-w-[1270px]", isAdmin && "min-w-[1390px]")}>
            <div
              className="grid items-center gap-5 border-b border-border-light bg-surface/80 px-5 py-3 text-[10.5px] font-bold uppercase tracking-[0.08em] text-text-tertiary"
              style={{ gridTemplateColumns: listColumns }}
            >
              <span>Company</span>
              <span>Division</span>
              <span>Activity mix</span>
              <span>Latest intelligence</span>
              {group === "customer" && <span>People</span>}
              {isAdmin && <span>Tracking</span>}
              <span>Last checked</span>
            </div>
            <div className="mi-list-stagger divide-y divide-border-light">
              {listRows.map(row => {
                const card = row.card;
                if (!card) return (
                  <div key={row.id} className="relative grid min-h-[106px] items-center gap-5 px-5 py-4" style={{ gridTemplateColumns: listColumns }}>
                    <div className="flex min-w-0 items-center gap-2.5">
                      <button type="button" aria-label={`${stars.has(row.id) ? "Unstar" : "Star"} ${row.name}`} aria-pressed={stars.has(row.id)} onClick={() => stars.has(row.id) ? setUnstar({id: row.id, name: row.name}) : void setStar(row.id, true)} className={cn("flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-surface", stars.has(row.id) ? "text-amber-600" : "text-text-tertiary")}><Star size={15} fill={stars.has(row.id) ? "currentColor" : "none"} /></button>
                      <MiLogo name={row.name} className="h-10 w-10 shrink-0" />
                      <span className="block min-w-0 text-[13.5px] font-semibold leading-snug text-text-primary">{row.name}</span>
                    </div>
                    <div>{(divisions[row.id] ?? []).length > 0 ? <DivisionChips divisions={divisions[row.id]} /> : <span className="text-[12px] text-text-tertiary">—</span>}</div>
                    <div className="grid grid-cols-1 gap-1.5 opacity-55"><span className="h-7 rounded-lg bg-surface" /><span className="h-7 rounded-lg bg-surface" /><span className="h-7 rounded-lg bg-surface" /></div>
                    <p className="text-[12px] leading-relaxed text-text-tertiary">The first verified posts, news, and website updates will appear here.</p>
                    {group === "customer" && <PeopleSummary people={people[row.id]} companyName={row.name} onOpen={() => setPeoplePanel({ kind: "tracked", companyId: row.id, companyName: row.name, people: people[row.id] ?? [] })} />}
                    {isAdmin && <TrackingSummary state={stateOf(row.id)} companyName={row.name} onOpen={() => setPeoplePanel({ kind: "tracking", companyName: row.name, people: trackingPeople[row.id] ?? [], activeByDefault: stateOf(row.id).byDefault === true })} />}
                    <span className="whitespace-nowrap text-[11px] font-medium text-text-tertiary">Pending</span>
                  </div>
                );

                const story = card.stories[0] ?? null;
                const storyHref = safeHref(story?.url);
                const storyOutlet = story ? outletName(story.source, story.url) : "";
                const count = (value: number) => card.countsKnown === false ? "—" : value;
                return (
                  <div key={card.id} className="group/row relative grid min-h-[118px] items-center gap-5 px-5 py-4 transition-[background-color,box-shadow] duration-200 hover:bg-[rgba(0,113,227,0.025)] hover:shadow-[inset_3px_0_0_var(--blue-primary)]" style={{ gridTemplateColumns: listColumns }}>
                    <div className="flex min-w-0 items-center gap-2.5">
                      <button type="button" aria-label={`${stars.has(card.id) ? "Unstar" : "Star"} ${card.name}`} aria-pressed={stars.has(card.id)} onClick={() => stars.has(card.id) ? setUnstar({id:card.id,name:card.name}) : void setStar(card.id,true)} className={cn("flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-white hover:shadow-sm", stars.has(card.id) ? "text-amber-600" : "text-text-tertiary hover:text-amber-600")}><Star size={15} strokeWidth={2.2} fill={stars.has(card.id) ? "currentColor" : "none"} /></button>
                      <Link href={`/market-intel/${card.id}`} className="flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-primary">
                        <MiLogo name={card.name} logoUrl={card.logoUrl} className="h-11 w-11 shrink-0" />
                        <span className="min-w-0">
                          <span className="block text-[13.5px] font-semibold leading-snug text-text-primary transition-colors group-hover/row:text-blue-primary">
                            {card.name}
                            <ArrowUpRight size={12} className="ml-1 inline-block align-text-top opacity-0 transition-opacity group-hover/row:opacity-100" />
                          </span>
                        </span>
                      </Link>
                    </div>
                    <div>{(divisions[card.id] ?? []).length > 0 ? <DivisionChips divisions={divisions[card.id]} /> : <span className="text-[12px] text-text-tertiary">—</span>}</div>
                    <div className="grid grid-cols-1 gap-1.5">
                      <ActivityMetric icon={<LinkedInIcon size={11} />} label="Posts" value={count(card.counts.posts)} tone="blue" />
                      <ActivityMetric icon={<Newspaper size={11} strokeWidth={2.2} />} label="News" value={count(card.counts.news)} tone="teal" />
                      <ActivityMetric icon={<Globe2 size={11} strokeWidth={2.2} />} label="Website" value={count(card.counts.site)} tone="orange" />
                    </div>
                    <div className="min-w-0">
                      {story ? <>
                        {storyHref ? (
                          <a href={storyHref} target="_blank" rel="noreferrer" aria-label={`Open ${storyOutlet} source`} className="mb-1 inline-block text-[10.5px] font-bold uppercase tracking-[0.055em] text-text-tertiary transition-colors hover:text-blue-primary hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-primary">
                            {storyOutlet}
                          </a>
                        ) : (
                          <p className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.055em] text-text-tertiary">{storyOutlet}</p>
                        )}
                        {storyHref ? <a href={storyHref} target="_blank" rel="noreferrer" className="group/story block overflow-hidden text-[12px] font-medium leading-[1.45] text-text-secondary transition-colors hover:text-blue-primary [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3]">{story.title}<ArrowUpRight size={12} className="ml-1 inline-block align-text-top opacity-0 transition-opacity group-hover/story:opacity-100" /></a> : <p className="overflow-hidden text-[12px] font-medium leading-[1.45] text-text-secondary [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3]">{story.title}</p>}
                      </> : <p className="text-[12px] leading-relaxed text-text-tertiary">No recent headline in this window. Activity tracking is still active.</p>}
                    </div>
                    {group === "customer" && <PeopleSummary people={people[card.id]} companyName={card.name} onOpen={() => setPeoplePanel({ kind: "tracked", companyId: card.id, companyName: card.name, people: people[card.id] ?? [] })} />}
                    {isAdmin && <TrackingSummary state={stateOf(card.id)} companyName={card.name} onOpen={() => setPeoplePanel({ kind: "tracking", companyName: card.name, people: trackingPeople[card.id] ?? [], activeByDefault: stateOf(card.id).byDefault === true })} />}
                    <span className="whitespace-nowrap text-[11px] font-semibold text-text-secondary" title="Latest successful source check">{card.updatedLabel}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <section key="company-tiles" className="mi-view-tiles-in grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] gap-4 stagger">
          {shownPending.map(company => (
            <div key={company.id} className="rounded-2xl border border-border-light bg-white p-4 shadow-[0_12px_36px_-32px_rgba(15,23,42,0.45)]">
              <div className="flex items-center gap-3">
                <MiLogo name={company.name} logoUrl={company.logoUrl} className="h-10 w-10 shrink-0" />
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-text-primary">{company.name}</p><p className="text-xs text-text-secondary">Starting collection</p></div>
                <button type="button" aria-label={`${stars.has(company.id) ? "Unstar" : "Star"} ${company.name}`} aria-pressed={stars.has(company.id)} onClick={() => stars.has(company.id) ? setUnstar({ id: company.id, name: company.name }) : void setStar(company.id, true)} className={cn("flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-surface", stars.has(company.id) ? "text-amber-600" : "text-text-tertiary hover:text-amber-600")}><Star size={15} fill={stars.has(company.id) ? "currentColor" : "none"} /></button>
              </div>
              {(divisions[company.id] ?? []).length > 0 && <DivisionChips divisions={divisions[company.id]} className="mt-3" />}
            </div>
          ))}
          {shown.map(card => (
            <LiveCompanyCard
              key={card.id}
              card={card}
              people={group === "customer" ? people[card.id] : undefined}
              divisions={divisions[card.id] ?? []}
              starred={stars.has(card.id)}
              onStar={on => on ? void setStar(card.id, true) : setUnstar({ id: card.id, name: card.name })}
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
