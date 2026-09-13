"use client";

import { useEffect, useState } from "react";
import { PendingCompanyCard } from "./PendingCompanyCard";
import { useCollectionStatusRefresh } from "./useCollectionStatusRefresh";
import { useRouter } from "next/navigation";
import {
  ArrowDownAZ,
  ArrowDownWideNarrow,
  CalendarClock,
  Flame,
  Layers,
  Moon,
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

type Activity = "all" | "busy" | "quiet";
type Sort = "active" | "month" | "az";
const UNTAGGED = "__untagged__";

export function LiveCompanyGrid({
  cards,
  pending,
  people,
  group,
  divisions,
  watch,
  starred = [],
  isAdmin = false,
  addedAt = {},
}: {
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
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [unstar, setUnstar] = useState<{id: string; name: string} | null>(null);
  const [query, setQuery] = useState("");
  const [activity, setActivity] = useState<Activity>("all");
  const [sort, setSort] = useState<Sort>("active");
  const [divisionFilter, setDivisionFilter] = useState<string[]>([]);
  const [starredOnly, setStarredOnly] = useState(false);
  const [stars, setStars] = useState<Set<string>>(new Set(starred));
  const stateOf = (id: string): WatchState => watch[id] ?? { followers: 0 };

  useCollectionStatusRefresh(pending);
  useEffect(()=>{const added=()=>{setQuery("");setActivity("all");setDivisionFilter([]);setStarredOnly(false);};window.addEventListener("mi-company-added",added);return ()=>window.removeEventListener("mi-company-added",added);},[]);
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

  const passesActivity = (c: CompanyCard) =>
    activity === "all" ||
    (activity === "busy" ? c.itemsThisMonth >= 10 : c.itemsThisMonth === 0);

  const passesDivision = (id: string) => {
    if (divisionFilter.length === 0) return true;
    const tags = divisions[id] ?? [];
    if (tags.length === 0) return divisionFilter.includes(UNTAGGED);
    return tags.some((d) => divisionFilter.includes(d));
  };

  const passesStar = (id: string) => !starredOnly || stars.has(id);

  const shown = cards
    .filter((c) => matches(c.id, c.name) && passesActivity(c) && passesDivision(c.id) && passesStar(c.id))
    .sort((a, b) =>
      sort !== "az" && ((Date.parse(addedAt[a.id] || "") || 0) > Date.now()-86400_000 || (Date.parse(addedAt[b.id] || "") || 0) > Date.now()-86400_000)
        ? (Date.parse(addedAt[b.id] || "") || 0)-(Date.parse(addedAt[a.id] || "") || 0)
        : sort === "az"
        ? a.name.localeCompare(b.name)
        : sort === "month"
          ? b.itemsThisMonth - a.itemsThisMonth
          : b.itemsInWindow - a.itemsInWindow
    );

  // Pending companies have no items yet, so they count as quiet.
  const shownPending =
    activity === "busy"
      ? []
      : pending.filter(
          (c) => matches(c.id, c.name, c.industry) && passesDivision(c.id) && passesStar(c.id)
        );

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
          className="flex-1"
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
          value={activity}
          onChange={(v) => setActivity(v as Activity)}
          ariaLabel="Filter by activity"
          minWidth={168}
          options={[
            { value: "all", label: "All activity", icon: Layers, color: "var(--ink-bright-blue)" },
            { value: "busy", label: "Busy this month", icon: Flame, color: "var(--ink-orange)" },
            { value: "quiet", label: "Quiet this month", icon: Moon, color: "var(--ink-violet)" },
          ]}
        />
        <ColorSelect
          value={sort}
          onChange={(v) => setSort(v as Sort)}
          ariaLabel="Sort companies"
          minWidth={170}
          options={[
            { value: "active", label: "By most items", icon: ArrowDownWideNarrow, color: "var(--ink-bright-blue)" },
            { value: "month", label: "By this month", icon: CalendarClock, color: "var(--ink-teal-deep)" },
            { value: "az", label: "By name (A to Z)", icon: ArrowDownAZ, color: "var(--ink-magenta)" },
          ]}
        />
      </SearchPriority>

      {visible === 0 ? (
        <div className="rounded-xl border border-dashed border-border-light bg-white p-10 text-center text-[13px] text-text-secondary">
          {starredOnly && starCount === 0
            ? "Nothing starred yet. Press the star on any card to mark a favourite."
            : `Nothing matches${q ? ` “${query.trim()}”` : " those filters"}. Clear the ${q ? "search" : "filters"} to see all ${total} ${group === "competitor" ? "competitors" : "customers"} on your page.`}
        </div>
      ) : (
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 stagger">
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
