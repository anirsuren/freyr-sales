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
  LayoutGrid,
  List,
  ArrowDownWideNarrow,
  CalendarDays,
  CalendarRange,
  History,
  Sun,
  Layers,
  Star,
  Tag,
} from "lucide-react";

import { ColorSelect, MultiColorSelect } from "@/components/ui/ColorSelect";
import {
  PrioritySearchInput,
  SearchPriority,
} from "@/components/ui/SearchPriority";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import {
  LiveCompanyCard,
  type CardPerson,
} from "@/components/market-intel/LiveCompanyCard";

import { type WatchState } from "@/components/market-intel/WatchStatus";
import type { CompanyCard } from "@/lib/marketIntelFeed";
import type { TrackedCompany } from "@/lib/marketIntelTracking";
import { DIVISIONS, DIVISION_META, type Division } from "@/lib/offeringMaterials";
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

export function LiveCompanyGrid({
  cards,
  viewerId = "",
  defaultView = "tiles",
  pending,
  people,
  group,
  divisions,
  watch,
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
  /** This person's favourites, from the server. */
  starred?: string[];
  isAdmin?: boolean;
  addedAt?: Record<string,string>;
  cardsByRange?: Record<string, CompanyCard[]>;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [unstar, setUnstar] = useState<{id: string; name: string} | null>(null);
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
        <div className="overflow-x-auto rounded-xl border border-border-light bg-white">
          <table className="w-full min-w-[780px] text-left text-[12px]">
            <thead className="border-b border-border-light bg-surface text-[10.5px] uppercase tracking-wide text-text-secondary">
              <tr><th className="w-10 px-3 py-3"><span className="sr-only">Starred</span></th><th className="px-3 py-3">Company</th><th className="px-3 py-3">Division</th>
                {["Signals", "Posts", "News", "Website", ...(group === "customer" ? ["People tracked"] : [])].map(label => <th key={label} className="px-3 py-3 text-right">{label}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light">
              {listRows.map(row => {
                const card = row.card;
                if (!card) return <tr key={row.id}><td className="px-3 py-3" /><td className="px-3 py-3 font-semibold">{row.name}<span className="ml-2 text-[11px] font-normal text-text-secondary">Collecting first updates</span></td><td className="px-3 py-3"><DivisionChips divisions={divisions[row.id] ?? []} /></td><td colSpan={group === "customer" ? 5 : 4} className="px-3 py-3 text-right text-text-tertiary">Pending</td></tr>;
                return <tr key={card.id} className="hover:bg-surface/60">
                <td className="px-3 py-3"><button type="button" aria-label={`${stars.has(card.id) ? "Unstar" : "Star"} ${card.name}`} aria-pressed={stars.has(card.id)} onClick={() => stars.has(card.id) ? setUnstar({id:card.id,name:card.name}) : void setStar(card.id,true)} className={cn("flex h-7 w-7 cursor-pointer items-center justify-center rounded-md hover:bg-surface", stars.has(card.id) ? "text-amber-600" : "text-text-tertiary")}><Star size={15} fill={stars.has(card.id) ? "currentColor" : "none"} /></button></td>
                <td className="px-3 py-3"><Link href={`/market-intel/${card.id}`} className="inline-flex items-center gap-2 font-semibold text-text-primary hover:text-blue-primary"><MiLogo name={card.name} logoUrl={card.logoUrl} className="h-8 w-8 shrink-0" /><span>{card.name}</span></Link></td>
                <td className="px-3 py-3"><DivisionChips divisions={divisions[card.id] ?? []} /></td>
                {[card.signalTotal,card.counts.posts,card.counts.news,card.counts.site].map((count,index) => <td key={index} className="px-3 py-3 text-right tnum">{card.countsKnown === false ? "—" : count.toLocaleString()}</td>)}
                {group === "customer" && <td className="px-3 py-3 text-right tnum">{people[card.id]?.length ?? 0}</td>}
              </tr>;
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <section className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] gap-4 stagger">
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
