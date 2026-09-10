"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDownAZ,
  ArrowDownWideNarrow,
  CalendarClock,
  Flame,
  Hourglass,
  Layers,
  Moon,
  PauseCircle,
  Star,
  Swords,
  Tag,
  Users,
} from "lucide-react";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { ColorSelect, MultiColorSelect } from "@/components/ui/ColorSelect";
import {
  PrioritySearchInput,
  SearchPriority,
} from "@/components/ui/SearchPriority";
import { useToast } from "@/components/ui/Toast";
import {
  LiveCompanyCard,
  type CardPerson,
} from "@/components/market-intel/LiveCompanyCard";
import { DivisionChips } from "@/components/market-intel/DivisionChips";
import { WatchStatus, isPaused, type WatchState } from "@/components/market-intel/WatchStatus";
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
 * Sep 10 (Saras): a DIVISION filter (MPR, MDV, CON, or untagged), and MY
 * COMPANIES, the star on each card and the toggle here, so a person can see
 * only the companies they added or chose to follow.
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
  isAdmin = false,
  showAll = false,
}: {
  cards: CompanyCard[];
  pending: TrackedCompany[];
  people: Record<string, CardPerson[]>;
  group: "customer" | "competitor";
  /** Division tags by company id, for every company on the page. */
  divisions: Record<string, Division[]>;
  /** Standing watch / followers / paused, by company id. */
  watch: Record<string, WatchState>;
  /** Admins can see paused companies and bring them back. */
  isAdmin?: boolean;
  /** Whether the page shows every company the team tracks, or only mine. */
  showAll?: boolean;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activity, setActivity] = useState<Activity>("all");
  const [sort, setSort] = useState<Sort>("active");
  const [divisionFilter, setDivisionFilter] = useState<string[]>([]);
  const [mineOnly, setMineOnly] = useState(false);
  const [pausedOnly, setPausedOnly] = useState(false);
  const [mine, setMine] = useState<Set<string> | null>(null);
  const stateOf = (id: string): WatchState => watch[id] ?? { standing: false, followers: 0 };
  /* PAUSED COMPANIES ARE OUT OF THE WAY: nobody has them, so they are not
     refreshed and not shown, except to an admin who asks for them. */
  const passesPaused = (id: string) => (pausedOnly ? isPaused(stateOf(id)) : !isPaused(stateOf(id)));

  // My list, read after mount so the server never guesses who is looking.
  useEffect(() => {
    let alive = true;
    fetch("/api/market-intel/bookmarks")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (alive) setMine(new Set<string>(Array.isArray(data?.companyIds) ? data.companyIds : []));
      })
      .catch(() => {
        if (alive) setMine(new Set());
      });
    return () => {
      alive = false;
    };
  }, []);

  const setBookmark = async (id: string, on: boolean) => {
    const before = mine ?? new Set<string>();
    const next = new Set(before);
    if (on) next.add(id);
    else next.delete(id);
    setMine(next);
    try {
      const res = await fetch("/api/market-intel/bookmarks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, on }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not save.");
      const name = cards.find((c) => c.id === id)?.name ?? pending.find((c) => c.id === id)?.name ?? "It";
      if (data?.paused) toast(`${name} is off your list. Nobody has it now, so it's paused.`);
      else if (data?.resumed) toast(`${name} is back on the watch.`);
      // The page is my list: a star added or removed changes what is on it.
      router.refresh();
    } catch (caught) {
      setMine(before);
      toast(caught instanceof Error ? caught.message : "Could not save your list.", "error");
    }
  };

  const q = query.trim().toLowerCase();
  const matches = (id: string, name: string, industry?: string | null) =>
    !q ||
    name.toLowerCase().includes(q) ||
    (industry ?? "").toLowerCase().includes(q) ||
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

  const passesMine = (id: string) => !mineOnly || (mine?.has(id) ?? false);

  const shown = cards
    .filter((c) => matches(c.id, c.name) && passesActivity(c) && passesDivision(c.id) && passesMine(c.id) && passesPaused(c.id))
    .sort((a, b) =>
      sort === "az"
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
          (c) => matches(c.id, c.name, c.industry) && passesDivision(c.id) && passesMine(c.id) && passesPaused(c.id)
        );

  const pausedCount = [...cards.map((c) => c.id), ...pending.map((c) => c.id)].filter((id) => isPaused(stateOf(id))).length;
  const total = cards.length + pending.length - (pausedOnly ? 0 : pausedCount);
  const visible = shown.length + shownPending.length;
  const mineCount = mine
    ? cards.filter((c) => mine.has(c.id)).length + pending.filter((c) => mine.has(c.id)).length
    : 0;
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
        {/* MY LIST: only worth a toggle when the page is showing everyone's. */}
        {showAll && (
        <button
          type="button"
          onClick={() => setMineOnly((v) => !v)}
          aria-pressed={mineOnly}
          title="Only the companies on your list"
          className={cn(
            "flex h-[34px] cursor-pointer items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-semibold transition-colors",
            mineOnly
              ? "border-transparent bg-[#B45309] text-white"
              : "border-border-light bg-white text-text-secondary hover:border-blue-subtle hover:text-text-primary"
          )}
        >
          <Star size={13} strokeWidth={2.2} fill={mineOnly ? "currentColor" : "none"} />
          My list
          <span className={cn("tnum", mineOnly ? "opacity-85" : "text-text-tertiary")}>{mineCount}</span>
        </button>
        )}
        {isAdmin && pausedCount > 0 && (
          <button
            type="button"
            onClick={() => setPausedOnly((v) => !v)}
            aria-pressed={pausedOnly}
            title="Companies nobody has on their list, so nothing new is collected. Add one to your list to bring it back, or delete it for good."
            className={cn(
              "flex h-[34px] cursor-pointer items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-semibold transition-colors",
              pausedOnly
                ? "border-transparent bg-[#5B6B8C] text-white"
                : "border-border-light bg-white text-text-secondary hover:border-blue-subtle hover:text-text-primary"
            )}
          >
            <PauseCircle size={13} strokeWidth={2.2} />
            Paused
            <span className={cn("tnum", pausedOnly ? "opacity-85" : "text-text-tertiary")}>{pausedCount}</span>
          </button>
        )}
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
          {pausedOnly
            ? "Nothing is paused. Every company on the watch has somebody who wants it."
            : !showAll && total === 0
            ? "Nothing on your page yet. Open Manage companies to star the companies you want here, or tick Show all companies to see everything the team tracks."
            : mineOnly && mineCount === 0
            ? "Nothing on your list yet. Press the star on any company to add it, or track a new one with the button above."
            : `Nothing matches${q ? ` “${query.trim()}”` : " those filters"}. Clear the ${q ? "search" : "filters"} to see all ${total} ${group === "competitor" ? "competitors" : "customers"}.`}
        </div>
      ) : (
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 stagger">
          {shown.map((card) => (
            <LiveCompanyCard
              key={card.id}
              card={card}
              people={people[card.id]}
              divisions={divisions[card.id] ?? []}
              bookmarked={mine?.has(card.id) ?? false}
              onBookmark={(on) => void setBookmark(card.id, on)}
              watch={stateOf(card.id)}
            />
          ))}

          {shownPending.map((company) => {
            const peopleCount = (people[company.id] ?? []).length;
            const on = mine?.has(company.id) ?? false;
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
                      <span className="mt-0.5 block">
                        <WatchStatus state={stateOf(company.id)} />
                      </span>
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <span className="flex items-center gap-1 rounded-full bg-[rgba(0,113,227,0.08)] px-2 py-0.5 text-[11px] font-bold text-[color:var(--ink-bright-blue)]">
                      New
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void setBookmark(company.id, !on);
                      }}
                      aria-pressed={on}
                      aria-label={on ? `Remove ${company.name} from my list` : `Add ${company.name} to my list`}
                      className={cn(
                        "flex h-6 w-6 cursor-pointer items-center justify-center rounded-full transition-colors",
                        on ? "bg-[rgba(180,83,9,0.12)] text-[#B45309]" : "text-text-tertiary hover:bg-surface hover:text-[#B45309]"
                      )}
                    >
                      <Star size={13} strokeWidth={2.2} fill={on ? "currentColor" : "none"} />
                    </button>
                  </span>
                </div>
                <div className="mt-3 flex h-9 items-center justify-center rounded-md border border-dashed border-border-light text-[10.5px] font-medium text-text-tertiary">
                  Collecting the first weeks of activity
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {group !== "competitor" && (
                    <span className="flex items-center gap-1 rounded-full bg-[rgba(0,113,227,0.08)] px-2 py-0.5 text-[11px] font-semibold text-[color:var(--ink-bright-blue)]">
                      <Users size={10.5} strokeWidth={2.2} />
                      {peopleCount} {peopleCount === 1 ? "person" : "people"} followed
                    </span>
                  )}
                  <span className="flex items-center gap-1 rounded-full bg-[rgba(180,49,143,0.10)] px-2 py-0.5 text-[11px] font-semibold text-[color:var(--ink-magenta)]">
                    <Swords size={10.5} strokeWidth={2.2} />
                    {company.competitors.length}{" "}
                    {company.competitors.length === 1
                      ? "competitor"
                      : "competitors"}
                  </span>
                  {(divisions[company.id] ?? []).length > 0 && (
                    <DivisionChips divisions={divisions[company.id]} className="ml-auto" />
                  )}
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
      )}
    </>
  );
}
