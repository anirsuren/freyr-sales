"use client";

import { Fragment, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  Gauge,
  PenLine,
  ShieldCheck,
  Target,
  TrendingDown,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { ColorSelect } from "@/components/ui/ColorSelect";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatTile } from "@/components/ui/StatTile";
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
  paceVerdict,
  pctMet,
  yearElapsed,
  type PerfActual,
  type PerformanceState,
  type PeriodKey,
  type PrimaryGoal,
} from "@/lib/performanceShared";
import { MetPill, PacePill, TypeChip, VerifiedPill } from "./bits";
import type { RunOp } from "./PerformanceModule";

/**
 * ORG PERFORMANCE — his words, verbatim: "list the primary goals which I've
 * selected... show me the target, actual, met, percentage met, whether it is
 * verified or not. When I click on this, all the subgoals should expand...
 * within that, for all the people... people's target, actual, percentage met,
 * whether it is verified or not."
 */

const PERIOD_KEYS = ["week", "month", "quarter", "year"] as const;

export function OrgPerformanceTab({
  state,
  live,
  run,
  onLogActual,
  onGoToMaster,
}: {
  state: PerformanceState;
  live: boolean;
  run: RunOp;
  onLogActual: () => void;
  onGoToMaster: () => void;
}) {
  const [query, setQuery] = useState("");
  const [period, choosePeriod] = useStoredView<PeriodKey>(
    "freyr.performance.period",
    "quarter",
    PERIOD_KEYS
  );
  const [openId, setOpenId] = useState<string | null>(null);

  const picked = state.goals.filter((g) => g.pickedForOrg);
  const q = query.trim().toLowerCase();
  const shown = picked.filter(
    (g) =>
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
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          icon={Target}
          label="Goals on the plan"
          value={String(picked.length)}
          sub={`${state.goals.length} on the master`}
        />
        <StatTile
          icon={CheckCircle2}
          label="Targets met"
          value={String(metCount)}
          color="#16A34A"
          sub={picked.length ? `of ${picked.length} org goals` : undefined}
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
          sub="marked by leadership"
        />
      </div>

      <SearchPriority
        query={query}
        className="mt-4 flex flex-wrap items-center gap-2"
      >
        <PrioritySearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search goals, subgoals, people…"
          ariaLabel="Search org performance"
          grow
          growMaxWidth={340}
          growExpandedMaxWidth={460}
          className="min-w-[200px] flex-1"
        />
        <span className="ml-auto flex items-center gap-2">
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
            title="Nothing on the goal plan yet"
            description="Goals live on the Goal Master. Mark one as 'On the goal plan' and it shows up here with its target, actuals and verification."
            action={
              <button
                type="button"
                onClick={onGoToMaster}
                className="cursor-pointer rounded-full bg-blue-primary px-4 py-2 text-[13px] font-semibold text-white transition-all hover:opacity-90"
              >
                Open the Goal Master
              </button>
            }
          />
        </div>
      ) : shown.length === 0 ? (
        <p className="mt-6 rounded-xl bg-surface px-4 py-6 text-center text-[13px] text-text-secondary">
          Nothing matches that search.
        </p>
      ) : (
        <Card className="mt-4 overflow-x-auto p-0">
          <table className="w-full min-w-[860px]">
            <thead>
              <tr className="border-b border-border-light">
                {["Goal", "Target", "Actual", "Met", "% met", "Verified", ""].map(
                  (h, i) => (
                    <th
                      key={i}
                      className={cn(
                        "px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary",
                        i >= 1 && i <= 4 && "w-[130px]",
                        i === 6 && "w-8"
                      )}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light">
              {shown.map((g) => (
                <GoalRows
                  key={g.id}
                  goal={g}
                  actuals={state.actuals}
                  open={openId === g.id}
                  onToggle={() => setOpenId(openId === g.id ? null : g.id)}
                  live={live}
                  run={run}
                  period={period}
                  periodLabel={periodLabel}
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
  actuals,
  open,
  onToggle,
  live,
  run,
  period,
  periodLabel,
}: {
  goal: PrimaryGoal;
  actuals: PerfActual[];
  open: boolean;
  onToggle: () => void;
  live: boolean;
  run: RunOp;
  period: PeriodKey;
  periodLabel: string;
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
        <td className="px-4 py-3">
          <span className="flex flex-col gap-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-[13.5px] font-semibold text-text-primary">
                {goal.name}
              </span>
              <PacePill pace={pace} size="sm" />
            </span>
            <span className="flex items-center gap-1.5">
              <TypeChip type={goal.type} size="sm" />
              <span className="text-[10.5px] text-text-tertiary tnum">
                {goal.year}
              </span>
            </span>
          </span>
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-[13px] font-semibold text-text-primary tnum">
          {goal.target > 0 ? fmtAmount(goal.unit, goal.target) : "—"}
        </td>
        <td className="whitespace-nowrap px-4 py-3">
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
        <td className="px-4 py-3">
          <MetPill met={goal.target > 0 && actual >= goal.target} size="sm" />
        </td>
        <td className="px-4 py-3">
          <MiniBar actual={actual} target={goal.target} pace={pace} />
          {goal.measure === "total" && goal.target > 0 && (
            <span className="mt-0.5 block text-[10px] text-text-tertiary tnum">
              calendar says {expectedPct}%
            </span>
          )}
        </td>
        <td className="px-4 py-3">
          <VerifiedPill
            verified={goal.verified}
            size="sm"
            onToggle={
              live
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
        <td className="px-4 py-3">
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
        <tr>
          <td colSpan={7} className="bg-[var(--surface)] px-4 pb-4 pt-1">
            <div className="tab-panel space-y-3">
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
                          <span className="flex items-center gap-1">
                            {s.owners.map((o) => (
                              <Avatar
                                key={o}
                                name={o}
                                tooltip={`Goal owner: ${o}`}
                                className="h-5 w-5 text-[8px]"
                              />
                            ))}
                            <span className="text-[10.5px] font-medium text-text-tertiary">
                              {s.owners.join(", ")}
                            </span>
                          </span>
                        )}
                        <span className="ml-auto flex items-center gap-2">
                          <span className="text-[12px] text-text-secondary tnum">
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
                          <VerifiedPill
                            verified={s.verified}
                            size="sm"
                            onToggle={
                              live
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
                                        live
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
