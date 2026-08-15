"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import {
  Crown,
  CheckCircle2,
  ChevronDown,
  Gauge,
  Pencil,
  PenLine,
  UsersRound,
  ShieldCheck,
  Target,
  TrendingDown,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
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
  fmtAmount,
  hasActuals,
  paceVerdict,
  pctMet,
  yearElapsed,
  type PerfActual,
  type PerformanceState,
  type PeriodKey,
  type PrimaryGoal,
} from "@/lib/performanceShared";
import { BarChart, DonutChart, DonutLegend } from "@/components/charts/Charts";
import { InfoHint } from "@/components/ui/InfoHint";
import { MetPill, PacePill, TypeChip, TypeIconTile, VerifiedPill, typeMeta } from "./bits";
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
  met: "#16A34A",
  ahead: "#0F766E",
  ontrack: "#0071E3",
  lagging: "#DC2626",
  unset: "#8AB4E8",
};
const PACE_LABEL: Record<string, string> = {
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
  onLogActual: () => void;
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
      /** Bar chart heading: "How far along Growth Accounts is on each goal". */
      barTitle: string;
      /** Donut heading: "Where Growth Accounts stands". */
      donutTitle: string;
      /** Search placeholder, so even the empty field says the scope. */
      searchPlaceholder: string;
    };
    /** The tab's identity colour, on the tile that names the scope. */
    accent?: string;
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
  const [openId, setOpenId] = useState<string | null>(null);

  const picked = scope ? scope.goals : state.goals.filter((g) => g.pickedForOrg);
  const noun = scope?.noun ?? "org goals";
  const words = scope?.words;
  const q = query.trim().toLowerCase();
  const shown = picked.filter((g) => {
    if (typeFilter !== "all" && g.type !== typeFilter) return false;
    if (paceFilter !== "all") {
      const a = actualValue(state.actuals, g);
      if (paceVerdict(a, g.target, g.year, g.measure) !== paceFilter)
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

  const withValue = picked.map((g) => ({
    goal: g,
    actual: actualValue(state.actuals, g),
  }));
  const metCount = withValue.filter(
    (x) => x.goal.target > 0 && x.actual >= x.goal.target
  ).length;
  const laggingCount = withValue.filter(
    (x) =>
      paceVerdict(x.actual, x.goal.target, x.goal.year, x.goal.measure) ===
      "lagging"
  ).length;
  const verifiedCount = picked.filter((g) => g.verified).length;
  const periodLabel =
    PERIODS.find((p) => p.value === period)?.label ?? "This quarter";

  return (
    <div>
      {scope?.picker}
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
          <Card className="flex flex-col p-5">
            <p className="flex items-center gap-1 text-[13px] font-semibold text-text-primary">
              {words?.barTitle ?? "How far along each goal is"}
              <InfoHint text="Each bar is one tracked goal: how much of its annual target is achieved so far. Hover a bar to see the subgoals behind it." />
            </p>
            <div className="-mx-5 mt-3 min-h-0 flex-1">
              <BarChart
                height={190}
                fillCard={20}
                format="percent"
                data={picked.map((g) => {
                  const a = actualValue(state.actuals, g);
                  const p = paceVerdict(a, g.target, g.year, g.measure);
                  return {
                    label: chartName(g.name),
                    value: g.target > 0 ? Math.round(pctMet(a, g.target)) : 0,
                    color: PACE_COLOR[p],
                    caption:
                      g.target > 0
                        ? `${fmtAmount(g.unit, a)} of ${fmtAmount(g.unit, g.target)}`
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
                segments={(["met", "ahead", "ontrack", "lagging", "unset"] as const)
                  .map((k) => ({
                    label: PACE_LABEL[k],
                    color: PACE_COLOR[k],
                    value: withValue.filter(
                      (x) =>
                        paceVerdict(
                          x.actual,
                          x.goal.target,
                          x.goal.year,
                          x.goal.measure
                        ) === k
                    ).length,
                  }))
                  .filter((s) => s.value > 0)}
              />
              <DonutLegend
                className="min-w-0 flex-1 max-w-[230px]"
                syncId="perf-pace"
                total={picked.length}
                items={(["met", "ahead", "ontrack", "lagging", "unset"] as const)
                  .map((k) => ({
                    label: PACE_LABEL[k],
                    color: PACE_COLOR[k],
                    value: withValue.filter(
                      (x) =>
                        paceVerdict(
                          x.actual,
                          x.goal.target,
                          x.goal.year,
                          x.goal.measure
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
        <PrioritySearchInput
          value={query}
          onChange={setQuery}
          placeholder={words?.searchPlaceholder ?? "Search goals, subgoals, people…"}
          ariaLabel="Search org performance"
          grow
          className="min-w-[200px] flex-1"
        />
        <span className="ml-auto flex flex-wrap items-center gap-2">
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
              { value: "unverified", label: "Not verified", color: "#B45309" },
            ]}
          />
          <ColorSelect
            value={period}
            onChange={(v) => choosePeriod(v as PeriodKey)}
            ariaLabel="Recent window"
            dense
            minWidth={150}
            options={PERIODS.map((p) => ({
              value: p.value,
              label: p.label,
              color: "#0071E3",
            }))}
          />
          {live && (
            <button
              type="button"
              onClick={onLogActual}
              className="flex cursor-pointer items-center gap-1.5 rounded-full bg-blue-primary px-3.5 py-2 text-[13px] font-semibold text-white transition-all hover:opacity-90 active:scale-[0.97]"
            >
              <PenLine size={13.5} strokeWidth={2.4} /> Log an actual
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
                    { h: "" },
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
                      i === 6 && "w-12"
                    )}
                  >
                    <span className="flex items-center gap-1">
                      {col.h}
                      {col.hint && <InfoHint text={col.hint} />}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light">
              {shown.map((g) => (
                <GoalRows
                  key={g.id}
                  goal={g}
                  state={state}
                  meName={meName}
                  actuals={state.actuals}
                  open={openId === g.id}
                  onToggle={() => setOpenId(openId === g.id ? null : g.id)}
                  live={live}
                  run={run}
                  period={period}
                  periodLabel={periodLabel}
                  onEditGoal={onEditGoal}
                  onEditSubgoal={onEditSubgoal}
                />
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function MiniBar({
  actual,
  target,
  pace,
}: {
  actual: number;
  target: number;
  pace: ReturnType<typeof paceVerdict>;
}) {
  const pct = Math.min(100, pctMet(actual, target));
  const color =
    pace === "lagging" ? "#DC2626" : pace === "ontrack" ? "#0071E3" : "#16A34A";
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-24 overflow-hidden rounded-full bg-[rgba(0,113,227,0.10)]">
        <span
          className="block h-full rounded-full"
          style={{ width: `${target > 0 ? pct : 0}%`, background: color }}
        />
      </span>
      <span className="text-[12px] font-semibold tnum" style={{ color }}>
        {target > 0 ? `${Math.round(pctMet(actual, target))}%` : "—"}
      </span>
    </span>
  );
}

function GoalRows({
  goal,
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
}: {
  goal: PrimaryGoal;
  actuals: PerfActual[];
  open: boolean;
  onToggle: () => void;
  live: boolean;
  run: RunOp;
  period: PeriodKey;
  periodLabel: string;
  onEditGoal: (g: PrimaryGoal) => void;
  onEditSubgoal: (g: PrimaryGoal, s: PrimaryGoal["subgoals"][number]) => void;
  state: PerformanceState;
  meName: string;
}) {
  const actual = actualValue(actuals, goal);
  const pace = paceVerdict(actual, goal.target, goal.year, goal.measure);
  const periodDelta =
    goal.measure === "total"
      ? actualValue(actuals, goal, {}, period)
      : null;
  const expectedPct = Math.round(yearElapsed(goal.year) * 100);

  const recentLevelEntries =
    goal.measure === "level"
      ? actuals
          .filter((a) => a.goalId === goal.id)
          .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
          .slice(0, 6)
      : [];

  return (
    <Fragment>
      <tr
        onClick={onToggle}
        className={cn(
          "cursor-pointer transition-colors hover:bg-surface",
          open && "bg-surface"
        )}
      >
        <td className="px-4 py-4">
          <span className="flex items-center gap-3">
            <TypeIconTile type={goal.type} />
            <span className="flex min-w-0 flex-col gap-2">
              <span className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/performance/goal/${goal.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-[13.5px] font-semibold text-text-primary transition-colors hover:text-blue-primary"
                  title="Open this goal: financial years, quarters, months, weeks, groups and people"
                >
                  {goal.name}
                </Link>
                <PacePill pace={pace} size="sm" />
              </span>
              <span className="flex items-center gap-1.5">
                <TypeChip type={goal.type} size="sm" />
                <span className="text-[10.5px] text-text-tertiary tnum">
                  {goal.year}
                </span>
              </span>
            </span>
          </span>
        </td>
        <td className="whitespace-nowrap px-4 py-4">
          {goal.target > 0 ? (
            <span className="text-[13px] font-semibold text-text-primary tnum">
              {fmtAmount(goal.unit, goal.target)}
            </span>
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
            {fmtAmount(goal.unit, actual)}
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
        <td className="px-4 py-4">
          <MiniBar actual={actual} target={goal.target} pace={pace} />
          {goal.measure === "total" && goal.target > 0 && (
            <span className="mt-0.5 block text-[10px] text-text-tertiary tnum">
              calendar says {expectedPct}%
            </span>
          )}
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
            onToggle={
              live && (hasActuals(actuals, { goalId: goal.id }) || goal.verified)
                ? () =>
                    run(
                      {
                        op: "set-verified",
                        goalId: goal.id,
                        verified: !goal.verified,
                      },
                      goal.verified
                        ? `${goal.name} marked not verified`
                        : `${goal.name} verified`
                    )
                : undefined
            }
          />
        </td>
        <td className="px-4 py-4">
          <ChevronDown
            size={15}
            strokeWidth={2.2}
            className={cn(
              "text-text-tertiary transition-transform",
              open && "rotate-180 text-blue-primary"
            )}
          />
        </td>
      </tr>
      {open && (
        <tr className="!border-t-0">
          {/* No tint and no border on the drill-down (Anir, Aug 15: "there
              are so many lines here... remove the rectangle that houses the
              three cards"). The cards inside carry their own outlines; a box
              around a box was one frame too many. */}
          <td colSpan={7} className="px-4 pb-5 pt-3">
            <div className="tab-panel space-y-3">
              {/* The drill-down that used to need a separate page. Same
                  component, embedded, so the two can never diverge (Anir,
                  Aug 14: "when i click a goal make it a dropdown"). The link
                  out to the full page lives at the bottom of it. */}
              <GoalZoom
                state={state}
                goalId={goal.id}
                meName={meName}
                run={run}
                embedded
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
                  <p className="rounded-xl border border-dashed border-border-light bg-white px-4 py-3 text-[12.5px] text-text-secondary">
                    No subgoals yet — split this goal in the Goal Master to
                    assign teams and people.
                  </p>
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
                        <span className="text-[13px] font-bold text-text-primary">
                          {s.name}
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
