"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import {
  Crown,
  CheckCircle2,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  Gauge,
  Pencil,
  PenLine,
  UsersRound,
  ShieldCheck,
  ArrowDownAZ,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  Layers,
  Maximize2,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { ColorSelect } from "@/components/ui/ColorSelect";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatTile } from "@/components/ui/StatTile";
import { GoalZoom } from "./GoalZoom";
import { Avatar } from "@/components/ui/Avatar";
import {
  PrioritySearchInput,
  SearchPriority,
} from "@/components/ui/SearchPriority";
import { useStoredView } from "@/lib/useStoredView";
import { cn } from "@/lib/utils";
import {
  PERIODS,
  actualValue,
  familyValue,
  fmtAmount,
  hasActuals,
  paceVerdict,
  pctMet,
  yearElapsed,
  milestoneByNow,
  type PerfActual,
  type PerformanceState,
  type PeriodKey,
  type PrimaryGoal,
} from "@/lib/performanceShared";
import {
  BarChart,
  DonutChart,
  DonutLegend,
  donutSyncBroadcast,
  useDonutSync,
} from "@/components/charts/Charts";
import { InfoHint } from "@/components/ui/InfoHint";
import { PerformanceExport } from "./PerformanceExport";
import { VerifyGoalModal } from "./VerifyGoalModal";
import type { CurrencyCode, CurrencyRates } from "@/lib/currency";
import { GroupPill, MetPill, PacePill, TypeChip, TypeIconTile, VerifiedPill, typeMeta } from "./bits";
import type { RunOp } from "./PerformanceModule";

/**
 * ORG PERFORMANCE — his words, verbatim: "list the primary goals which I've
 * selected... show me the target, actual, met, percentage met, whether it is
 * verified or not. When I click on this, all the subgoals should expand...
 * within that, for all the people... people's target, actual, percentage met,
 * whether it is verified or not."
 */

const PERIOD_KEYS = ["week", "month", "quarter", "year"] as const;

const PACE_COLOR: Record<string, string> = {
  unscheduled: "#8E98A8",
  met: "#16A34A",
  ahead: "#0F766E",
  ontrack: "#0071E3",
  lagging: "#DC2626",
  unset: "#8AB4E8",
};
const PACE_LABEL: Record<string, string> = {
  unscheduled: "No schedule",
  met: "Target met",
  ahead: "Ahead",
  ontrack: "On track",
  lagging: "Lagging",
  unset: "No target yet",
};

/** Clean chart label: the goal name without its bracketed clarifier. */
function chartName(name: string): string {
  return name.replace(/\s*\(.*?\)\s*/g, " ").replace(/\s+/g, " ").trim();
}

function monthlyTotals(
  actuals: PerfActual[],
  goalId: string,
  year: number
): { label: string; value: number }[] {
  const now = new Date();
  const lastMonth = year === now.getFullYear() ? now.getMonth() : 11;
  const months = Array.from({ length: lastMonth + 1 }, (_, m) => ({
    label: new Date(year, m, 1).toLocaleDateString("en-US", { month: "short" }),
    value: 0,
  }));
  for (const a of actuals) {
    if (a.goalId !== goalId) continue;
    const d = new Date(a.date);
    if (d.getFullYear() !== year || d.getMonth() > lastMonth) continue;
    months[d.getMonth()].value += a.amount;
  }
  return months;
}

/** THE COLOUR OF AN AMOUNT. Every bar that measures money or count uses this
 *  one blue, in the chart and in the table, so the same $250K never appears in
 *  two colours on one screen (Anir, Aug 15). Identity colour stays on the type
 *  chip and the icon tile; status stays on the pace pill. */
const MONEY = "#0071E3";

/** The four windows, widest to narrowest, each with its own mark. */
const PERIOD_META: Record<PeriodKey, { color: string; icon: typeof CalendarDays }> = {
  week: { color: "#0891B2", icon: CalendarRange },
  month: { color: "#0071E3", icon: CalendarDays },
  quarter: { color: "#7C3AED", icon: CalendarClock },
  year: { color: "#0F766E", icon: CalendarCheck },
};

type SortKey = "pace" | "met" | "target" | "actual" | "verified" | "name";
const SORT_KEYS: SortKey[] = ["pace", "met", "target", "actual", "verified", "name"];
/** Worst first: lagging, then behind-but-moving, then fine, then done. */
const PACE_RANK: Record<string, number> = {
  lagging: 0,
  unscheduled: 3.5,
  ontrack: 1,
  ahead: 2,
  met: 3,
  unset: 4,
};

export function OrgPerformanceTab({
  state,
  meName,
  live,
  run,
  onLogActual,
  onGoToMaster,
  onEditGoal,
  onEditSubgoal,
  scope,
}: {
  state: PerformanceState;
  meName: string;
  live: boolean;
  run: RunOp;
  onLogActual: (prefill?: { goalId: string; subgoalId: string | null; person: string }) => void;
  onGoToMaster: () => void;
  onEditGoal: (g: PrimaryGoal) => void;
  onEditSubgoal: (g: PrimaryGoal, s: PrimaryGoal["subgoals"][number]) => void;
  /**
   * SAME SCREEN, NARROWER AUDIENCE (Suren, Aug 15). Group and People
   * performance are this page pointed at fewer people, so they hand in a
   * scoped state plus the words that change: which goals count, what the
   * tiles are counting, and what to say when there is nothing yet. Left out,
   * everything behaves exactly as the org page always has.
   */
  scope?: {
    /**
     * Changes when the subject does — a different group, a different person.
     * Everything BELOW the picker is keyed on it and re-enters like a page
     * change (Anir, Aug 16: "when im switching between groups i want a premium
     * animation on all the visual stuff as if im switching pages"), while the
     * tab strip and the picker itself hold still ("it shouldn't do the
     * animation on the top thing... that should stay the same").
     */
    subjectKey?: string;
    /** Which goals belong on this screen. Org uses "on the goal plan". */
    goals: PrimaryGoal[];
    /** "org goals" → "goals in this group" / "goals" for a person. */
    noun: string;
    picker?: React.ReactNode;
    emptyTitle: string;
    emptyDescription: string;
    /**
     * THE SAME STRUCTURE, NOT THE SAME PAGE (Anir, Aug 15: "he wants a
     * structure between org, group and people performance. The text and stuff
     * have to be a little bit different. They have to know which one they're
     * on"). Identical tiles over identical charts left three screens you could
     * only tell apart by the tab that was lit. Every heading here names who is
     * being counted, so the page says it before the tab bar has to.
     */
    words?: {
      /** First tile: "Goals in this group", "Goals Suren carries". */
      trackedLabel: string;
      /** Its sub-line: "carried by 4 people". */
      trackedSub: string;
      /** Verified tile sub-line: who does the signing off on this screen. */
      verifiedSub: string;
      /**
       * Chart headings. NODES, not strings, because the group name inside them
       * is a GroupPill (Anir, Aug 15: "wherever it says test, it has to be the
       * variable name... it has to be blue with the icon for GROUP always").
       */
      barTitle: React.ReactNode;
      donutTitle: React.ReactNode;
      /** Search placeholder. Plain text: an input placeholder cannot hold a
       *  pill, so this is the one place the name stays bare. */
      searchPlaceholder: string;
    };
    /** The tab's identity colour, on the tile that names the scope. */
    accent?: string;
    /** Goes in an exported filename, e.g. "group-test". */
    exportLabel?: string;
    /**
     * WHAT ELSE THIS ONE SEARCH BAR CAN FIND (Anir, Aug 15: "why is there a
     * search a person button there? There's already a search bar on the left
     * with the filters. Just make sure I can search goals, people, groups,
     * etc."). The bar filters goals and subgoals as you type; these are the
     * people and groups matching the same words, offered as somewhere to go.
     */
    jumps?: {
      kind: "person" | "group";
      id: string;
      name: string;
      sub?: string;
      go: () => void;
    }[];
  };
}) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [paceFilter, setPaceFilter] = useState("all");
  const [verFilter, setVerFilter] = useState("all");
  const [period, choosePeriod] = useStoredView<PeriodKey>(
    "freyr.performance.period",
    "quarter",
    PERIOD_KEYS
  );
  /** Which goals are expanded. A set, not one id, so Expand all can open them
   *  together (Anir, Aug 16: "at the end it should be like [a button] to
   *  expand all"). */
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const toggleOpen = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  /** What YOU want to read the numbers in. A lens, never a stored fact. */
  /** Channel the chart and the table below it share for linked hover. */
  const syncId = `perf-${scope?.exportLabel ?? "org"}`;
  /** Insertion order told you nothing. Every other list in the app opens with
   *  a sort (Team, Customers, Offerings), so this one does too. */
  const [sortBy, setSortBy] = useStoredView<SortKey>(
    "freyr.performance.sort",
    "pace",
    SORT_KEYS
  );

  const picked = scope ? scope.goals : state.goals.filter((g) => g.pickedForOrg);
  const noun = scope?.noun ?? "org goals";
  const words = scope?.words;
  const q = query.trim().toLowerCase();
  /** People and groups this same query matches, offered under the bar. */
  const jumpHits = q
    ? (scope?.jumps ?? [])
        .filter(
          (j) => j.name.toLowerCase().includes(q) || (j.sub ?? "").toLowerCase().includes(q)
        )
        .slice(0, 6)
    : [];
  const shown = picked.filter((g) => {
    if (typeFilter !== "all" && g.type !== typeFilter) return false;
    if (paceFilter !== "all") {
      const a = actualValue(state.actuals, g);
      if (paceVerdict(a, g.target, g.year, g.measure, undefined, milestoneByNow(g)) !== paceFilter)
        return false;
    }
    if (verFilter === "verified" && !g.verified) return false;
    if (verFilter === "unverified" && g.verified) return false;
    return (
      !q ||
      g.name.toLowerCase().includes(q) ||
      g.type.toLowerCase().includes(q) ||
      g.subgoals.some(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.owners.some((o) => o.toLowerCase().includes(q)) ||
          s.people.some((p) => p.name.toLowerCase().includes(q))
      )
    );
  });

  /** Sorted for reading, not for storage: worst pace first by default, so the
   *  goals that need somebody land at the top of the table. */
  const sorted = [...shown].sort((a, b) => {
    const av = actualValue(state.actuals, a);
    const bv = actualValue(state.actuals, b);
    switch (sortBy) {
      case "name":
        return a.name.localeCompare(b.name);
      case "target":
        return b.target - a.target;
      case "actual":
        return bv - av;
      case "met":
        return (
          (b.target > 0 ? pctMet(bv, b.target) : -1) -
          (a.target > 0 ? pctMet(av, a.target) : -1)
        );
      case "verified":
        return Number(b.verified) - Number(a.verified);
      default: {
        const rank = (g: PrimaryGoal, v: number) =>
          PACE_RANK[paceVerdict(v, g.target, g.year, g.measure, undefined, milestoneByNow(g))];
        return rank(a, av) - rank(b, bv);
      }
    }
  });

  const withValue = picked.map((g) => ({
    goal: g,
    actual: actualValue(state.actuals, g),
  }));
  const metCount = withValue.filter(
    (x) => x.goal.target > 0 && x.actual >= x.goal.target
  ).length;
  const laggingCount = withValue.filter(
    (x) =>
      paceVerdict(x.actual, x.goal.target, x.goal.year, x.goal.measure, undefined, milestoneByNow(x.goal)) ===
      "lagging"
  ).length;
  const verifiedCount = picked.filter((g) => g.verified).length;
  const periodLabel =
    PERIODS.find((p) => p.value === period)?.label ?? "This quarter";

  return (
    <div>
      <PerformanceExport
        state={state}
        goals={sorted}
        label={scope?.exportLabel ?? "org"}
        live={live}
      />
      {scope?.picker}
      <div
        key={scope?.subjectKey ?? "static"}
        className={cn(scope?.subjectKey && "scope-swap")}
      >
      <div className={cn("grid grid-cols-2 gap-3 lg:grid-cols-4", Boolean(scope?.picker) && "mt-4")}>
        <StatTile
          icon={Target}
          label={words?.trackedLabel ?? "Goals tracked"}
          value={String(picked.length)}
          color={scope?.accent}
          sub={words?.trackedSub ?? `${state.goals.length} on the master`}
        />
        <StatTile
          icon={CheckCircle2}
          label="Targets met"
          value={String(metCount)}
          color="#16A34A"
          sub={picked.length ? `of ${picked.length} ${noun}` : undefined}
        />
        <StatTile
          icon={TrendingDown}
          label="Lagging the calendar"
          value={String(laggingCount)}
          color="#DC2626"
          warn={laggingCount > 0}
          sub={laggingCount > 0 ? "behind where the year is" : "nothing behind"}
        />
        <StatTile
          icon={ShieldCheck}
          label="Verified"
          value={`${verifiedCount} of ${picked.length}`}
          color="#0F766E"
          sub={words?.verifiedSub ?? "marked by leadership"}
        />
      </div>

      {picked.length > 0 && (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
          {/* flex column + flex-1 on the plot: this card is the short one in
              the row and stretches to match the donut beside it, so the chart
              used to stop mid-card and park its scrollbar across the wrapped
              axis labels (Anir, Aug 15: "the scroll bar is kind of why it is
              so high up... it should be at the bottom"). Now the plot takes
              whatever height is left and the scrollbar lands on the card's
              own bottom edge. -mx-5 with a matching fillCard runs the bars to
              the card's left and right edges. */}
          <Card className="flex flex-col p-5" data-chart-root>
            <p className="flex items-center gap-1 text-[13px] font-semibold text-text-primary">
              {words?.barTitle ?? "How far along each goal is"}
              <InfoHint text="Each bar is one tracked goal: how much of its annual target is achieved so far. Hover a bar to see the subgoals behind it." />
            </p>
            {/* -mb-5 as well as -mx-5: the card's bottom padding was holding the
                scroller 20px off the card's edge, so the scrollbar floated
                above it (Anir, Aug 15: "the scrollbar has to be at the very
                bottom edge and the bars right above it"). Bleeding into all
                three sides puts the bar on the edge and the axis labels
                immediately above it. */}
            <div className="-mx-5 -mb-5 mt-3 min-h-0 flex-1">
              <BarChart
                height={190}
                fillCard={20}
                format="percent"
                syncId={syncId}
                data={sorted.map((g) => {
                  const a = actualValue(state.actuals, g);
                  /**
                   * SOLID IS SIGNED OFF, HATCHED IS SOMEBODY'S WORD (Anir,
                   * Aug 15). The bar still reaches everything logged, so it
                   * agrees with the Actual column, but the part nobody has
                   * checked is drawn hatched instead of filled.
                   *
                   * The colour is the goal's own type colour, never the pace
                   * red: this chart is progress, and red on a progress bar
                   * read as damage ("I have no idea why you are using red...
                   * this is the progress, right?"). Lagging still shows in the
                   * row's pace pill and the donut beside this card.
                   */
                  const verified = familyValue(state, g, { verifiedOnly: true });
                  const awaiting = Math.max(0, a - verified);
                  return {
                    label: chartName(g.name),
                    value: g.target > 0 ? Math.round(pctMet(a, g.target)) : 0,
                    pending:
                      g.target > 0 && awaiting > 0
                        ? Math.round(pctMet(awaiting, g.target))
                        : 0,
                    color: MONEY,
                    /* THE AMOUNT, NOT A LEDGER (Anir, Aug 16: "Maybe just see
                       the amount in the bar chart... u dont need to say $0
                       verified"). Splitting it into verified and waiting put
                       two numbers over a bar that is one number, and led with
                       a $0 on every goal nobody had signed off yet. What is
                       verified is already in the bar itself: solid signed off,
                       hatched still waiting. */
                    caption:
                      g.target > 0
                        ? `${fmtAmount(g.unit, a)} of ${fmtAmount(g.unit, g.target)}`
                        : a > 0
                          ? `${fmtAmount(g.unit, a)} logged`
                          : "no target yet",
                    tip: g.subgoals.map((s) => {
                      const sa = actualValue(state.actuals, g, { subgoalId: s.id });
                      return {
                        name: s.name,
                        value:
                          s.target > 0
                            ? `${Math.round(pctMet(sa, s.target))}%`
                            : fmtAmount(g.unit, sa),
                        sub:
                          s.target > 0
                            ? `${fmtAmount(g.unit, sa)} of ${fmtAmount(g.unit, s.target)}`
                            : "no target set",
                      };
                    }),
                  };
                })}
              />
            </div>
          </Card>
          <Card className="p-5">
            <p className="flex items-center gap-1 text-[13px] font-semibold text-text-primary">
              {words?.donutTitle ?? "Where the goals stand"}
              <InfoHint text="Every tracked goal, judged against where the calendar says it should be by today." />
            </p>
            <div className="mx-auto mt-3 flex w-full max-w-[420px] items-center justify-center gap-6">
              <DonutChart
                size={140}
                thickness={15}
                syncId="perf-pace"
                centerLabel={String(picked.length)}
                centerSub={picked.length === 1 ? noun.replace(/s$/, "") : noun}
                segments={(["met", "ahead", "ontrack", "lagging", "unscheduled", "unset"] as const)
                  .map((k) => ({
                    label: PACE_LABEL[k],
                    color: PACE_COLOR[k],
                    value: withValue.filter(
                      (x) =>
                        paceVerdict(
                          x.actual,
                          x.goal.target,
                          x.goal.year,
                          x.goal.measure,
                          undefined,
                          milestoneByNow(x.goal)
                        ) === k
                    ).length,
                  }))
                  .filter((s) => s.value > 0)}
              />
              <DonutLegend
                className="min-w-0 flex-1 max-w-[230px]"
                syncId="perf-pace"
                total={picked.length}
                items={(["met", "ahead", "ontrack", "lagging", "unscheduled", "unset"] as const)
                  .map((k) => ({
                    label: PACE_LABEL[k],
                    color: PACE_COLOR[k],
                    value: withValue.filter(
                      (x) =>
                        paceVerdict(
                          x.actual,
                          x.goal.target,
                          x.goal.year,
                          x.goal.measure,
                          undefined,
                          milestoneByNow(x.goal)
                        ) === k
                    ).length,
                  }))
                  .filter((s) => s.value > 0)}
              />
            </div>
          </Card>
        </div>
      )}

      <SearchPriority
        query={query}
        className="mt-4 flex flex-wrap items-center gap-2"
      >
        <span className="relative flex min-w-[190px] flex-1 basis-[190px] items-center">
          <PrioritySearchInput
            value={query}
            onChange={setQuery}
            placeholder={words?.searchPlaceholder ?? "Search goals, subgoals, people…"}
            ariaLabel="Search performance"
            grow
            className="w-full"
          />
          {jumpHits.length > 0 && (
            <div className="menu-in absolute left-0 right-0 top-full z-30 mt-1.5 overflow-hidden rounded-xl border border-border-light bg-white p-1 shadow-[0_16px_48px_-12px_rgba(0,0,0,0.22)]">
              <span className="block px-2.5 pb-1 pt-1.5 text-[9.5px] font-bold uppercase tracking-[0.06em] text-text-tertiary">
                Jump to
              </span>
              {jumpHits.map((j) => (
                <button
                  key={`${j.kind}-${j.id}`}
                  type="button"
                  onClick={() => {
                    j.go();
                    setQuery("");
                  }}
                  className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-surface"
                >
                  {j.kind === "person" ? (
                    <Avatar name={j.name} className="h-7 w-7 shrink-0 text-[10px]" />
                  ) : (
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-light">
                      <UsersRound size={13} strokeWidth={2.2} className="text-blue-primary" />
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5">
                      {j.kind === "group" ? (
                        <GroupPill name={j.name} size="sm" />
                      ) : (
                        <span className="truncate text-[13px] font-medium text-text-primary">
                          {j.name}
                        </span>
                      )}
                    </span>
                    {j.sub && (
                      <span className="block truncate text-[11px] text-text-secondary">
                        {j.sub}
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}
        </span>
        <span className="flex flex-wrap items-center gap-2">
          <ColorSelect
            value={sortBy}
            onChange={(v) => setSortBy(v as SortKey)}
            ariaLabel="Sort the goals"
            dense
            minWidth={150}
            options={[
              { value: "pace", label: "Worst pace first", color: "#C2410C", icon: TrendingDown },
              { value: "met", label: "Most complete", color: "#16A34A", icon: Target },
              { value: "target", label: "Biggest target", color: "#0071E3", icon: Layers },
              { value: "actual", label: "Most achieved", color: "#7C3AED", icon: TrendingUp },
              { value: "verified", label: "Verified first", color: "#0F766E", icon: ShieldCheck },
              { value: "name", label: "Name", color: "#0891B2", icon: ArrowDownAZ },
            ]}
          />
          <ColorSelect
            value={typeFilter}
            onChange={setTypeFilter}
            ariaLabel="Goal type"
            dense
            minWidth={170}
            options={[
              { value: "all", label: "All goal types", color: "#0071E3" },
              ...state.types.map((t) => ({
                value: t,
                label: t,
                color: typeMeta(t).color,
                icon: typeMeta(t).icon,
              })),
            ]}
          />
          <ColorSelect
            value={paceFilter}
            onChange={setPaceFilter}
            ariaLabel="Standing"
            dense
            minWidth={150}
            options={[
              { value: "all", label: "Any standing", color: "#0071E3" },
              { value: "met", label: "Target met", color: "#16A34A" },
              { value: "ahead", label: "Ahead", color: "#0F766E" },
              { value: "ontrack", label: "On track", color: "#0071E3" },
              { value: "lagging", label: "Lagging", color: "#DC2626" },
              { value: "unset", label: "No target yet", color: "#8AB4E8" },
            ]}
          />
          <ColorSelect
            value={verFilter}
            onChange={setVerFilter}
            ariaLabel="Verified"
            dense
            minWidth={140}
            options={[
              { value: "all", label: "Verified + not", color: "#0071E3" },
              { value: "verified", label: "Verified", color: "#16A34A" },
              { value: "unverified", label: "Not verified", color: "#0058B0" },
            ]}
          />
          <ColorSelect
            value={period}
            onChange={(v) => choosePeriod(v as PeriodKey)}
            ariaLabel="Recent window"
            dense
            minWidth={150}
            // Four identical blue dots told you nothing (Anir, Aug 15: "you
            // can have some nice icons for these four instead of the same blue
            // circle"). A widening window, drawn as one: a day, a month grid,
            // a quarter's range, a whole year.
            options={PERIODS.map((p) => ({
              value: p.value,
              label: p.label,
              color: PERIOD_META[p.value].color,
              icon: PERIOD_META[p.value].icon,
            }))}
          />
          {live && (
            <button
              type="button"
              onClick={() => onLogActual()}
              className="flex cursor-pointer items-center gap-1.5 rounded-full bg-blue-primary px-3.5 py-2 text-[13px] font-semibold text-white transition-all hover:opacity-90 active:scale-[0.97]"
            >
              <PenLine size={13.5} strokeWidth={2.4} /> Log a result
            </button>
          )}
        </span>
      </SearchPriority>

      {picked.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon={Gauge}
            title={scope ? scope.emptyTitle : "Nothing on the goal plan yet"}
            description={
              scope
                ? scope.emptyDescription
                : "Goals live on the Goal Master. Mark one as 'On the goal plan' and it shows up here with its target, actuals and verification."
            }
            action={
              scope ? undefined : (
              <button
                type="button"
                onClick={onGoToMaster}
                className="cursor-pointer rounded-full bg-blue-primary px-4 py-2 text-[13px] font-semibold text-white transition-all hover:opacity-90"
              >
                Open the Goal Master
              </button>
              )
            }
          />
        </div>
      ) : shown.length === 0 ? (
        <p className="mt-6 rounded-xl bg-surface px-4 py-6 text-center text-[13px] text-text-secondary">
          Nothing matches that search.
        </p>
      ) : (
        <Card className="mt-4 overflow-x-auto p-0">
          {/* TABLE-FIXED, BECAUSE EXPANDING A ROW MUST NOT MOVE THE COLUMNS.
              With the default auto layout the browser re-solves every column
              width whenever the drill-down's colSpan={7} row appears, and the
              only column with no declared width absorbed the difference: Goal
              lost 47px and Verified gained it, so the whole grid jumped
              sideways on every open and close (Anir, Aug 14, with before and
              after screenshots). Fixed layout means the header decides the
              widths once and nothing below can renegotiate them.

              Every column therefore needs a width except Goal, which is
              deliberately left free to absorb the remainder. min-w is raised
              to match: the declared columns total 778px, so 1000px keeps Goal
              readable at the narrowest before the card starts scrolling. */}
          <table className="w-full min-w-[1000px] table-fixed">
            <thead>
              <tr className="border-b border-border-light">
                {(
                  [
                    { h: "Goal" },
                    { h: "Target", hint: "The number to hit for the year. Set it here or in the Goal Master." },
                    { h: "Actual", hint: "Everything logged so far, added up. Latest-value goals (ratios, averages) show the most recent number instead." },
                    { h: "Met", hint: "Met means the actual has reached the target." },
                    { h: "% met", hint: "How much of the target is achieved. The small dark tick is where the calendar says you should be by today." },
                    { h: "Verified", hint: "A manual yes/no from leadership. Click the pill to flip it, once something has been logged — with nothing logged there is nothing to sign off." },
                    { h: "Actions" },
                  ] as { h: string; hint?: string }[]
                ).map((col, i) => (
                  <th
                    key={i}
                    className={cn(
                      "px-4 py-3 text-left text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary",
                      // Column 0 (Goal) stays free and takes what is left.
                      i >= 1 && i <= 3 && "w-[130px]",
                      // % met carries a bar plus its value; 130 clipped it.
                      i === 4 && "w-[150px]",
                      // Verified holds "Not verified" + the VERIFY badge on one
                      // line: 149px of pill plus the cell's 32px of padding.
                      i === 5 && "w-[190px]",
                      /* NARROW (Anir, Aug 16: "You don't need that much space
                         for the last column. so that it stays on like one
                         line"). 120px of Actions was squeezing the Goal cell
                         until the name, the pace pill and the category
                         wrapped onto three lines. */
                      /* LEFT-ALIGNED LIKE EVERY OTHER HEADER (Anir, Aug 16:
                         "the 'actions' text should be on the left it looks
                         like its on the right aligned"). It was the only
                         right-aligned heading in the table, which read as a
                         mistake even though the controls under it are right
                         aligned. Label left, controls right, same as the rest. */
                      i === 6 && "w-[112px] !px-2"
                    )}
                  >
                    {i === 6 ? (
                      /* EXPAND EVERYTHING AT ONCE, from the head of the column
                         the per-row buttons live in. */
                      <span className="flex items-center gap-1.5">
                        <span>{col.h}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setOpenIds((prev) =>
                              prev.size === sorted.length
                                ? new Set()
                                : new Set(sorted.map((g) => g.id))
                            )
                          }
                          title={
                            openIds.size === sorted.length
                              ? "Collapse every goal"
                              : "Expand every goal"
                          }
                          className="cursor-pointer rounded-md p-1 text-text-tertiary transition-colors hover:bg-surface hover:text-blue-primary"
                        >
                          {openIds.size === sorted.length ? (
                            <ChevronsDownUp size={13.5} strokeWidth={2.2} />
                          ) : (
                            <ChevronsUpDown size={13.5} strokeWidth={2.2} />
                          )}
                        </button>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        {col.h}
                        {col.hint && <InfoHint text={col.hint} />}
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light">
              {sorted.map((g, i) => (
                <GoalRows
                  key={g.id}
                  onGoToMaster={onGoToMaster}
                  goal={g}
                  index={i}
                  syncId={syncId}
                  rates={state.rates ?? {}}
                  dimmed={openIds.size > 0 && !openIds.has(g.id)}
                  state={state}
                  meName={meName}
                  actuals={state.actuals}
                  open={openIds.has(g.id)}
                  onToggle={() => toggleOpen(g.id)}
                  live={live}
                  run={run}
                  period={period}
                  periodLabel={periodLabel}
                  onEditGoal={onEditGoal}
                  onLogActual={onLogActual}
                  onEditSubgoal={onEditSubgoal}
                />
              ))}
            </tbody>
          </table>
        </Card>
      )}
      </div>
    </div>
  );
}

function MiniBar({
  actual,
  target,
  pace,
  lit = false,
}: {
  actual: number;
  target: number;
  pace: ReturnType<typeof paceVerdict>;
  /** This row's bar in the chart above is under the cursor. */
  lit?: boolean;
}) {
  const pct = Math.min(100, pctMet(actual, target));
  const color =
    pace === "lagging" ? "#DC2626" : pace === "ontrack" ? "#0071E3" : "#16A34A";
  return (
    <span className="flex items-center gap-2">
      <span
        className={cn(
          "h-1.5 w-24 overflow-hidden rounded-full bg-[rgba(0,113,227,0.10)] transition-all duration-150",
          // Glow when its bar in the chart is hovered, so the eye can carry a
          // number from the chart to its row without counting columns.
          // The container stays put; the FILL is what lights up.
          lit && "h-2 w-28"
        )}
      >
        <span
          className={cn("block h-full rounded-full", lit && "bar-lit")}
          style={{
            width: `${target > 0 ? pct : 0}%`,
            background: color,
            ["--bar-glow" as string]: `${color}BF`,
          }}
        />
      </span>
      <span className="text-[12px] font-semibold tnum" style={{ color }}>
        {target > 0 ? `${Math.round(pctMet(actual, target))}%` : "—"}
      </span>
    </span>
  );
}

function GoalRows({
  onGoToMaster,
  goal,
  index,
  syncId,
  rates,
  dimmed,
  state,
  meName,
  actuals,
  open,
  onToggle,
  live,
  run,
  period,
  periodLabel,
  onEditGoal,
  onEditSubgoal,
  onLogActual,
}: {
  goal: PrimaryGoal;
  /** Position in the same list the chart above draws, for linked hover. */
  index: number;
  syncId: string;
  rates: CurrencyRates;
  /** Another goal is open: step back so the open one reads as the subject. */
  dimmed: boolean;
  actuals: PerfActual[];
  open: boolean;
  onToggle: () => void;
  live: boolean;
  run: RunOp;
  period: PeriodKey;
  periodLabel: string;
  onEditGoal: (g: PrimaryGoal) => void;
  onLogActual: (prefill?: { goalId: string; subgoalId: string | null; person: string }) => void;
  onEditSubgoal: (g: PrimaryGoal, s: PrimaryGoal["subgoals"][number]) => void;
  state: PerformanceState;
  meName: string;
  onGoToMaster: () => void;
}) {
  const actual = actualValue(actuals, goal);
  const pace = paceVerdict(
    actual,
    goal.target,
    goal.year,
    goal.measure,
    undefined,
    milestoneByNow(goal)
  );
  /** Which column the cursor is on in the chart above (or on a sibling row). */
  const linkedIndex = useDonutSync(syncId);
  /** True while this goal's three columns are open on their own, full width
   *  (Anir, Aug 16: "a whole pop-up so that all the bullshit gets hidden"). */
  const [full, setFull] = useState(false);
  const [verifying, setVerifying] = useState(false);
  /**
   * MONEY STAYS IN THE CURRENCY IT WAS SIGNED IN (Anir, Aug 16: "it should be
   * in their original currency, and it can be different for each one").
   *
   * There is no viewing currency any more. A contract signed in euros reads in
   * euros next to one signed in dollars, because converting them for display
   * meant either a typed-in rate nobody maintained or a guess, and the rate
   * dialog put that work on the reader for no benefit.
   */
  const money = (v: number, from?: CurrencyCode) => fmtAmount(goal.unit, v, from);
  const periodDelta =
    goal.measure === "total"
      ? actualValue(actuals, goal, {}, period)
      : null;

  const recentLevelEntries =
    goal.measure === "level"
      ? actuals
          .filter((a) => a.goalId === goal.id)
          .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
          .slice(0, 6)
      : [];

  return (
    <Fragment>
      <VerifyGoalModal
        open={verifying}
        goal={goal}
        state={state}
        meName={meName}
        busy={false}
        run={run}
        onClose={() => setVerifying(false)}
      />
      <Modal
        open={full}
        onClose={() => setFull(false)}
        title={goal.name}
        size="viewer"
        tall
        dialogClassName="!h-[calc(100vh-2rem)]"
      >
        {/* THE SAME THREE COLUMNS, GIVEN THE WHOLE WINDOW (Anir, Aug 16: "I
            meant a full-scale pop-up, not this thin one. I shouldn't even have
            to scroll unless there's just that much data"). Nothing else comes
            with them, and the columns stretch to the window instead of
            stopping at 340px with the rest below the fold. */}
        <div className="flex h-full min-h-0 flex-col">
          <GoalZoom
            state={state}
            goalId={goal.id}
            meName={meName}
            run={run}
            embedded
            fill
          />
        </div>
      </Modal>
      <tr
        onClick={onToggle}
        data-linked={linkedIndex === index ? "true" : undefined}
        className={cn(
          "cursor-pointer transition-all hover:bg-surface",
          // The open goal is the subject: a thick rail in its own type colour
          // down the left, a tinted header, and a hard edge above it so the
          // goal before it clearly ends.
          open &&
            "bg-surface [box-shadow:inset_3px_0_0_0_var(--goal-accent)]",
          dimmed && "opacity-45 hover:opacity-100",
          linkedIndex === index && "bg-blue-light/40"
        )}
        style={{ ["--goal-accent" as string]: typeMeta(goal.type).color }}
      >
        <td className="px-4 py-4">
          <span className="flex items-center gap-3">
            <TypeIconTile type={goal.type} />
            {/* THE MARKS SHARE ONE LINE (Anir, Aug 16: "this has to be on one
                line. the 'financial...' thing is below lagging when it should
                be in line with it"). The pace pill used to sit on the name's
                line and wrap under it the moment the name was long, which put
                three stacked rows in a cell that holds two things. */}
            <span className="flex min-w-0 flex-col gap-1.5">
              {/* self-start, because in a flex COLUMN the link stretched to
                  the widest line under it — the category chip — so clicking
                  the empty space beside a short name hit an invisible link
                  and navigated instead of opening the row (Anir, Aug 17: "it
                  should always do the drop-down unless I explicitly click on
                  the text"). Now the hitbox hugs the words. */}
              <Link
                href={`/performance/goal/${goal.id}`}
                onClick={(e) => e.stopPropagation()}
                className="self-start text-[13.5px] font-semibold text-text-primary transition-colors hover:text-blue-primary"
                title="Open this goal: financial years, quarters, months, weeks, groups and people"
              >
                {goal.name}
              </Link>
              <span className="flex flex-wrap items-center gap-2">
                <TypeChip type={goal.type} size="sm" />
                <span className="text-[10.5px] text-text-tertiary tnum">
                  {goal.year}
                </span>
              </span>
            </span>
          </span>
        </td>
        <td className="whitespace-nowrap px-4 py-4">
          {/* A TARGET YOU CAN CHANGE FROM HERE (Anir, Aug 15: "shouldn't there
              be an edit button here? If I want to remove or change the target,
              how do I do that"). Setting one was already a click; changing one
              meant a trip to the Goal Master. */}
          {goal.target > 0 ? (
            live ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEditGoal(goal);
                }}
                title={`Change or clear the target on ${goal.name}`}
                className="group/tg inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-1.5 py-1 -mx-1.5 text-[13px] font-semibold text-text-primary transition-colors hover:bg-surface tnum"
              >
                {money(goal.target, goal.currency)}
                <Pencil
                  size={12}
                  strokeWidth={2.2}
                  className="text-text-tertiary opacity-0 transition-opacity group-hover/tg:opacity-100"
                />
              </button>
            ) : (
              <span className="text-[13px] font-semibold text-text-primary tnum">
                {money(goal.target, goal.currency)}
              </span>
            )
          ) : live ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEditGoal(goal);
              }}
              className="cursor-pointer rounded-full bg-[rgba(0,113,227,0.08)] px-2.5 py-1 text-[11px] font-bold text-blue-primary transition-colors hover:bg-[rgba(0,113,227,0.14)]"
            >
              Set target
            </button>
          ) : (
            <span className="text-[13px] text-text-tertiary">—</span>
          )}
        </td>
        <td className="whitespace-nowrap px-4 py-4">
          <span className="block text-[13px] font-semibold text-text-primary tnum">
            {money(actual, goal.currency)}
          </span>
          {periodDelta !== null && periodDelta > 0 && (
            <span className="block text-[10.5px] text-text-tertiary tnum">
              +{fmtAmount(goal.unit, periodDelta)}{" "}
              {periodLabel.toLowerCase()}
            </span>
          )}
        </td>
        <td className="px-4 py-4">
          {goal.target > 0 ? (
            <MetPill met={actual >= goal.target} size="sm" />
          ) : (
            <span className="text-[12px] text-text-tertiary">—</span>
          )}
        </td>
        {/* THE SHINE BELONGS TO THE BAR, NOT THE ROW (Anir, Aug 16: "when my
            mouse moves, it's still doing the shining thing. Only when my mouse
            is on top of the bar should it do it, or in the area of the bar").
            The whole row used to broadcast, so crossing any of its seven cells
            lit the bar and its partner in the chart. */}
        <td
          className="px-4 py-4"
          onMouseEnter={() => donutSyncBroadcast(syncId, index)}
          onMouseLeave={() => donutSyncBroadcast(syncId, null)}
        >
          {/* PACE SITS ON THE BAR IT DESCRIBES (Anir, Aug 16: "just move the
              'lagging' to right above the progress bar i think it would look
              good there"). Over in the Goal cell it was a third mark competing
              with the name and the category; here it labels the one number it
              is about. */}
          <span className="mb-1 block">
            <PacePill pace={pace} size="sm" />
          </span>
          <MiniBar
            actual={actual}
            target={goal.target}
            pace={pace}
            lit={linkedIndex === index}
          />

        </td>
        <td className="px-4 py-4">
          <VerifiedPill
            verified={goal.verified}
            size="sm"
            // Nothing logged means nothing to verify, so the pill stays as a
            // status and stops being a button (Anir, Aug 15: "I shouldn't be
            // able to click on it... what's there to verify?"). Signing off on
            // an empty row would record leadership approving zero. An existing
            // yes stays clickable so it can always be undone.
            // Opens the review instead of flipping (Anir, Aug 15: "it
            // shouldn't just instantly change. Whatever I have to see should
            // pop up").
            onToggle={
              live && (hasActuals(actuals, { goalId: goal.id }) || goal.verified)
                ? () => setVerifying(true)
                : undefined
            }
          />
        </td>
        <td className="px-2 py-4">
          {/* THE FIRST ICON STARTS WHERE THE HEADING DOES (Anir, Aug 16: "the
              a should line up with the first icon"). The heading was left
              aligned and the controls right aligned, so they sat on opposite
              edges of the same column and read as two different columns. */}
          <span className="flex items-center justify-start gap-0.5">
          {/* EDIT BELONGS IN ACTIONS (Anir, Aug 16: "where is the edit
              button?"). Editing a goal was only reachable from the Goal
              Master, so the row that shows a goal could not change it — and
              now that a goal carries a schedule, this is the way to it. */}
          {live && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEditGoal(goal);
              }}
              title={`Edit ${goal.name} — target, schedule, tracking`}
              aria-label={`Edit ${goal.name}`}
              className="cursor-pointer rounded-md p-1 text-text-tertiary transition-colors hover:bg-blue-light hover:text-blue-primary"
            >
              <Pencil size={13.5} strokeWidth={2.2} />
            </button>
          )}
          {/* FULL SCREEN LIVES ON THE ROW (Anir, Aug 16: "Expand it. I don't
              see that button. It should be like a button. It should be an
              action column on this row"). Buried in the drill-down header it
              was only reachable once you had already opened the row. */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setFull(true);
            }}
            title={`Open ${goal.name} full screen: organization, groups, people`}
            aria-label={`Open ${goal.name} full screen`}
            className="cursor-pointer rounded-md p-1 text-text-tertiary transition-colors hover:bg-blue-light hover:text-blue-primary"
          >
            <Maximize2 size={13.5} strokeWidth={2.2} />
          </button>
          {/* THE KEYBOARD'S WAY IN (found Aug 16). The row answers the mouse;
              this answers Tab and Enter. It cannot be the row itself — a
              role="button" may not contain the verify pill and the target
              editor, and doing that swallowed their names. */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            aria-expanded={open}
            aria-label={`${open ? "Hide" : "Show"} the breakdown for ${goal.name}`}
            /* SAME INSET AS THE HEADER'S CONTROL (Anir, Aug 16: "This column
               isn't aligned"). The cell and the header cell already share an
               edge to the pixel; it was the two trailing glyphs sitting at
               different paddings inside them, 2px apart, that read as a
               crooked column. */
            className="cursor-pointer rounded-md p-1 transition-colors hover:bg-surface"
          >
          <ChevronDown
            size={13.5}
            strokeWidth={2.2}
            className={cn(
              "text-text-tertiary transition-transform",
              open && "rotate-180 text-blue-primary"
            )}
          />
          </button>
          </span>
        </td>
      </tr>
      {open && (
        <tr className="!border-t-0">
          {/* No tint and no border on the drill-down (Anir, Aug 15: "there
              are so many lines here... remove the rectangle that houses the
              three cards"). The cards inside carry their own outlines; a box
              around a box was one frame too many. */}
          {/* ONE BLOCK WITH THE ROW ABOVE IT (Anir, Aug 15: "there's a lot of
              gap... I'm not getting the sense that this is all part of one
              thing. You're gonna have to have some signifier that shows, okay,
              this is all part of the same goal"). The rail down the left is
              the goal's own type colour, the tint carries on from the open
              row, and the top padding is gone so the two touch. */}
          <td
            colSpan={7}
            className="px-4 pb-4 pt-0 [box-shadow:inset_3px_0_0_0_var(--goal-accent)]"
            style={{ ["--goal-accent" as string]: typeMeta(goal.type).color }}
          >
            <div className="tab-panel space-y-3 pb-3 pl-3.5 pt-1">
              {/* The drill-down that used to need a separate page. Same
                  component, embedded, so the two can never diverge (Anir,
                  Aug 14: "when i click a goal make it a dropdown"). The link
                  out to the full page lives at the bottom of it. */}
              {/* LOG IT FROM WHERE YOU ARE (Anir, Aug 15: "shouldn't there be a
                  button to log it after I click on the goal, in addition to at
                  the top"). The one at the top opens an empty form; this one
                  arrives knowing which goal you were reading, which is the
                  whole reason you drilled in. */}
              <GoalZoom
                state={state}
                goalId={goal.id}
                meName={meName}
                run={run}
                lit={linkedIndex === index}
                onLinkHover={(on) =>
                  donutSyncBroadcast(syncId, on ? index : null)
                }
                onSetSchedule={live ? () => onEditGoal(goal) : undefined}
                embedded
                headerAction={
                  live ? (
                    <button
                      type="button"
                      onClick={() =>
                        onLogActual({
                          goalId: goal.id,
                          subgoalId: null,
                          person: meName,
                        })
                      }
                      title={`Log a result on ${goal.name}`}
                      className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full bg-blue-primary px-3 py-1.5 text-[12px] font-semibold text-white transition-all hover:opacity-90 active:scale-[0.97]"
                    >
                      <PenLine size={12.5} strokeWidth={2.4} /> Log a result
                    </button>
                  ) : undefined
                }
              />
              {/* People holding this goal DIRECTLY (Suren, Aug 12: expand a
                  goal and "all the people who have contributed to this, and
                  their individual performance"). */}
              {(goal.assignments ?? []).length > 0 && (
                <div className="rounded-xl border border-border-light bg-white p-3.5">
                  <p className="text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
                    Assigned people
                  </p>
                  <table className="mt-1.5 w-full text-left text-[12px]">
                    <thead>
                      <tr className="text-[10px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
                        <th className="py-2 pr-3 font-bold">Person</th>
                        <th className="w-[110px] py-2 pr-3 font-bold">Target</th>
                        <th className="w-[110px] py-2 pr-3 font-bold">Actual</th>
                        <th className="w-[150px] py-2 pr-3 font-bold">% met</th>
                        <th className="w-[130px] py-2 font-bold">Verified</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-light">
                      {(goal.assignments ?? []).map((a) => {
                        const aActual = actualValue(actuals, goal, {
                          subgoalId: null,
                          person: a.person,
                        });
                        const share =
                          a.target > 0 ? Math.min(100, pctMet(aActual, a.target)) : null;
                        return (
                          <tr key={a.person}>
                            <td className="py-2.5 pr-3">
                              <span className="flex items-center gap-2">
                                <Avatar name={a.person} className="h-6 w-6 text-[9px]" />
                                <span className="font-semibold text-text-primary">
                                  {a.person}
                                </span>
                              </span>
                            </td>
                            <td className="whitespace-nowrap py-2.5 pr-3 tnum">
                              {a.target > 0 ? fmtAmount(goal.unit, a.target) : "—"}
                            </td>
                            <td className="whitespace-nowrap py-2.5 pr-3 font-bold text-text-primary tnum">
                              {fmtAmount(goal.unit, aActual)}
                            </td>
                            <td className="py-2.5 pr-3">
                              {share !== null ? (
                                <span className="flex items-center gap-2">
                                  <span className="h-1.5 w-20 overflow-hidden rounded-full bg-[rgba(0,113,227,0.10)]">
                                    <span
                                      className="block h-full rounded-full"
                                      style={{
                                        width: `${share}%`,
                                        background:
                                          share >= 85
                                            ? "#16A34A"
                                            : share >= 55
                                              ? "#0071E3"
                                              : "#DC2626",
                                      }}
                                    />
                                  </span>
                                  <span
                                    className={
                                      share < 55
                                        ? "font-semibold text-[color:#DC2626] tnum"
                                        : "font-semibold text-text-primary tnum"
                                    }
                                  >
                                    {Math.round(share)}%
                                  </span>
                                </span>
                              ) : (
                                <span className="text-text-tertiary">—</span>
                              )}
                            </td>
                            <td className="py-2.5">
                              <VerifiedPill
                                verified={a.verified}
                                size="sm"
                                onToggle={
                                  live &&
                                  (hasActuals(actuals, {
                                    goalId: goal.id,
                                    subgoalId: null,
                                    person: a.person,
                                  }) ||
                                    a.verified)
                                    ? () =>
                                        run(
                                          {
                                            op: "set-verified",
                                            goalId: goal.id,
                                            person: a.person,
                                            verified: !a.verified,
                                          },
                                          a.verified
                                            ? `${a.person} marked not verified`
                                            : `${a.person} verified`
                                        )
                                    : undefined
                                }
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {goal.subgoals.length === 0 ? (
                goal.measure === "level" ? (
                  <div className="rounded-xl border border-border-light bg-white p-3.5">
                    <p className="text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
                      Latest reported values
                    </p>
                    {recentLevelEntries.length === 0 ? (
                      <p className="mt-2 text-[12.5px] text-text-secondary">
                        Nothing reported yet — log the first value.
                      </p>
                    ) : (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {recentLevelEntries.map((e) => (
                          <span
                            key={e.id}
                            className="flex items-center gap-2 rounded-lg border border-border-light bg-white px-2.5 py-1.5"
                          >
                            <span className="text-[13px] font-bold text-text-primary tnum">
                              {fmtAmount(goal.unit, e.amount)}
                            </span>
                            <span className="text-[10.5px] text-text-tertiary">
                              {new Date(e.date).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })}{" "}
                              · {e.person.split(" ")[0]}
                            </span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  /* NAMING A PLACE IS NOT SENDING SOMEBODY THERE (Anir,
                     Aug 16: "if ur gonna say this u might as well put a button
                     to take the user there"). */
                  <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-border-light bg-white px-4 py-3">
                    <p className="min-w-0 flex-1 text-[12.5px] text-text-secondary">
                      No subgoals yet — split this goal to assign teams and
                      people.
                    </p>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onGoToMaster();
                      }}
                      className="flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full bg-blue-light px-3.5 py-1.5 text-[12px] font-semibold text-blue-primary transition-all hover:bg-blue-primary hover:text-white active:scale-[0.97]"
                    >
                      <Layers size={12.5} strokeWidth={2.4} /> Open the Goal
                      Master
                    </button>
                  </div>
                )
              ) : (
                goal.subgoals.map((s) => {
                  const subActual = actualValue(actuals, goal, {
                    subgoalId: s.id,
                  });
                  const subPace = paceVerdict(
                    subActual,
                    s.target,
                    goal.year,
                    goal.measure
                  );
                  return (
                    <div
                      key={s.id}
                      className="rounded-xl border border-border-light bg-white p-3.5"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        {/* SAY WHAT THIS CARD IS (Anir, Aug 16: "even this was
                            confusing for me. What is this? What is this
                            showing? What is Growth Accounts and what is
                            Focused Accounts AMR, and why are those people
                            there?"). A bold name with a crown and a table under
                            it gave no clue it was a piece of the goal you had
                            just opened rather than a thing in its own right. */}
                        <span className="flex min-w-0 flex-col">
                          <span className="text-[13px] font-bold text-text-primary">
                            {s.name}
                          </span>
                          <span className="text-[10.5px] text-text-tertiary">
                            A piece of {goal.name}, carried by the people below
                          </span>
                        </span>
                        {s.owners.length > 0 && (
                          <span
                            className="flex items-center gap-1"
                            title={`Goal owner${s.owners.length === 1 ? "" : "s"}: ${s.owners.join(", ")}`}
                          >
                            {s.owners.map((o) => (
                              <Avatar
                                key={o}
                                name={o}
                                tooltip={`Goal owner: ${o}`}
                                className="h-5 w-5 text-[8px]"
                              />
                            ))}
                            <Crown
                              size={10}
                              strokeWidth={2.6}
                              aria-label="Goal owner"
                              className="text-[color:#7C3AED]"
                            />
                            <span className="text-[10.5px] font-medium text-text-secondary">
                              {s.owners.join(", ")}
                            </span>
                          </span>
                        )}
                        <span className="ml-auto flex items-center gap-4">
                          {/* the number and its bar read as ONE unit; the
                              actions sit apart (Anir, Aug 12: "I don't like
                              those buttons and that progress bar"). */}
                          <span className="flex items-center gap-2">
                            <span className="whitespace-nowrap text-[12px] text-text-secondary tnum">
                              <span className="font-bold text-text-primary">
                                {fmtAmount(goal.unit, subActual)}
                              </span>{" "}
                              of{" "}
                              {s.target > 0
                                ? fmtAmount(goal.unit, s.target)
                                : "—"}
                            </span>
                            <MiniBar
                              actual={subActual}
                              target={s.target}
                              pace={subPace}
                            />
                          </span>
                          <span className="flex items-center gap-1.5">
                          <VerifiedPill
                            verified={s.verified}
                            size="sm"
                            onToggle={
                              live &&
                              (hasActuals(actuals, {
                                goalId: goal.id,
                                subgoalId: s.id,
                              }) ||
                                s.verified)
                                ? () =>
                                    run(
                                      {
                                        op: "set-verified",
                                        goalId: goal.id,
                                        subgoalId: s.id,
                                        verified: !s.verified,
                                      },
                                      s.verified
                                        ? `${s.name} marked not verified`
                                        : `${s.name} verified`
                                    )
                                : undefined
                            }
                          />
                          {live && s.target === 0 && (
                            <button
                              type="button"
                              onClick={() => onEditSubgoal(goal, s)}
                              className="cursor-pointer whitespace-nowrap rounded-full border border-[rgba(0,113,227,0.25)] bg-white px-2.5 py-1 text-[11px] font-bold text-blue-primary shadow-sm transition-all hover:-translate-y-px hover:bg-blue-light hover:shadow active:translate-y-0"
                            >
                              Set target
                            </button>
                          )}
                          {/* Set target IS the edit when no target exists —
                              two buttons doing one job was the clutter. */}
                          {live && s.target > 0 && (
                            <button
                              type="button"
                              title="Edit this subgoal - target, owners, people"
                              onClick={() => onEditSubgoal(goal, s)}
                              className="cursor-pointer rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-surface hover:text-blue-primary"
                            >
                              <Pencil size={13} strokeWidth={2.2} />
                            </button>
                          )}
                          </span>
                        </span>
                      </div>
                      {s.people.length > 0 && (
                        <table className="mt-2.5 w-full">
                          <thead>
                            <tr className="border-b border-border-light">
                              {["Person", "Target", "Actual", "% met", "Verified"].map(
                                (h) => (
                                  <th
                                    key={h}
                                    className="px-2 py-1.5 text-left text-[10px] font-bold uppercase tracking-[0.05em] text-text-tertiary"
                                  >
                                    {h}
                                  </th>
                                )
                              )}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border-light">
                            {s.people.map((p) => {
                              const pActual = actualValue(actuals, goal, {
                                subgoalId: s.id,
                                person: p.name,
                              });
                              const pPace = paceVerdict(
                                pActual,
                                p.target,
                                goal.year,
                                goal.measure
                              );
                              const pDelta =
                                goal.measure === "total"
                                  ? actualValue(
                                      actuals,
                                      goal,
                                      { subgoalId: s.id, person: p.name },
                                      period
                                    )
                                  : null;
                              return (
                                <tr key={p.name}>
                                  <td className="px-2 py-2">
                                    <span className="flex items-center gap-2">
                                      <Avatar
                                        name={p.name}
                                        className="h-6 w-6 text-[9px]"
                                      />
                                      <span className="text-[12.5px] font-medium text-text-primary">
                                        {p.name}
                                      </span>
                                    </span>
                                  </td>
                                  <td className="whitespace-nowrap px-2 py-2 text-[12.5px] text-text-secondary tnum">
                                    {p.target > 0
                                      ? fmtAmount(goal.unit, p.target)
                                      : "—"}
                                  </td>
                                  <td className="whitespace-nowrap px-2 py-2">
                                    <span className="text-[12.5px] font-semibold text-text-primary tnum">
                                      {fmtAmount(goal.unit, pActual)}
                                    </span>
                                    {pDelta !== null && pDelta > 0 && (
                                      <span className="ml-1.5 text-[10px] text-text-tertiary tnum">
                                        +{fmtAmount(goal.unit, pDelta)}{" "}
                                        {periodLabel.toLowerCase()}
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-2 py-2">
                                    <MiniBar
                                      actual={pActual}
                                      target={p.target}
                                      pace={pPace}
                                    />
                                  </td>
                                  <td className="px-2 py-2">
                                    <VerifiedPill
                                      verified={p.verified}
                                      size="sm"
                                      onToggle={
                                        live &&
                                        (hasActuals(actuals, {
                                          goalId: goal.id,
                                          subgoalId: s.id,
                                          person: p.name,
                                        }) ||
                                          p.verified)
                                          ? () =>
                                              run(
                                                {
                                                  op: "set-verified",
                                                  goalId: goal.id,
                                                  subgoalId: s.id,
                                                  person: p.name,
                                                  verified: !p.verified,
                                                },
                                                p.verified
                                                  ? `${p.name} marked not verified`
                                                  : `${p.name} verified on ${s.name}`
                                              )
                                          : undefined
                                      }
                                    />
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                      {s.people.length === 0 && (
                        // A real empty state, centred (Anir, Aug 12: "make
                        // that section bigger and put Assign people in the
                        // center") — the squeezed row read as a footnote.
                        <div className="mt-2.5 flex flex-col items-center justify-center gap-2.5 rounded-xl border border-dashed border-border-light bg-white px-4 py-6 text-center">
                          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[rgba(0,113,227,0.08)] text-blue-primary">
                            <UsersRound size={17} strokeWidth={2} />
                          </span>
                          <span className="block text-[12.5px] leading-relaxed text-text-secondary">
                            {s.owners.length > 0 ? (
                              <>
                                <Crown
                                  size={11}
                                  strokeWidth={2.6}
                                  aria-hidden="true"
                                  className="mr-1 inline align-[-1px] text-[color:#7C3AED]"
                                />
                                <span className="font-semibold text-text-primary">
                                  {s.owners.join(" and ")}
                                </span>{" "}
                                {s.owners.length === 1 ? "owns" : "own"} this
                                subgoal. No one carries a personal target yet —
                                owners can be assigned one too.
                              </>
                            ) : (
                              <>
                                No people on this subgoal yet — each person
                                gets their own target.
                              </>
                            )}
                          </span>
                          {live && (
                            <button
                              type="button"
                              onClick={() => onEditSubgoal(goal, s)}
                              className="cursor-pointer rounded-full bg-blue-primary px-4 py-2 text-[12.5px] font-semibold text-white transition-all hover:opacity-90 active:scale-[0.97]"
                            >
                              Assign people
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}
