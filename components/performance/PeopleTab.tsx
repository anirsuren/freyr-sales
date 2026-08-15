"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, PencilLine, Search, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  actualValue,
  fmtAmount,
  knownPeople,
  paceVerdict,
  pctMet,
  personGoalRows,
  type PerformanceState,
} from "@/lib/performanceShared";
import { GoalZoom } from "./GoalZoom";
import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import { InfoHint } from "@/components/ui/InfoHint";
import type { RunOp } from "./PerformanceModule";
import { MyEntriesCard, VerifyQueueCard } from "./EntryCards";
import { GoalBar, PacePill, TypeChip, typeMeta } from "./bits";
import { MultiColorSelect } from "@/components/ui/ColorSelect";

/**
 * PEOPLE PERFORMANCE (Suren, Aug 12): "I just want to do only individual
 * people... you cannot list all the people, but if somebody wants to search
 * some people name, then that people name can come. Whoever logs in is able
 * to see his thing." You land on yourself; the search finds anyone the
 * server let you see — which for most people is exactly themselves.
 */
export function PeopleTab({
  state,
  live,
  run,
  meName,
  onLogActual,
}: {
  state: PerformanceState;
  live: boolean;
  run: RunOp;
  meName: string;
  onLogActual: (prefill: {
    goalId: string;
    subgoalId: string | null;
    person: string;
  }) => void;
}) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  /** Which of this person's goal rows is showing its drill-down. Same idea,
   *  and the same GoalZoom, as Org and Group performance: the detail opens
   *  where you clicked it rather than on a page of its own. */
  const [openGoal, setOpenGoal] = useState<string | null>(null);
  /** FILTERS, because a person will carry a lot of goals before long (Anir,
   *  Aug 15: "eventually were gonna have lots of stuff here"). Same control
   *  and same shape as the Offerings and Customers filter rows. */
  const [typeFilter, setTypeFilter] = useState("");
  const [paceFilter, setPaceFilter] = useState("");

  const names = useMemo(() => knownPeople(state, meName), [state, meName]);
  const person = picked ?? meName;
  const allRows = personGoalRows(state, person);

  const typeOptions = useMemo(() => {
    const seen = new Map<string, number>();
    for (const r of allRows)
      seen.set(r.goal.type, (seen.get(r.goal.type) ?? 0) + 1);
    return [...seen.keys()].sort();
  }, [allRows]);

  /** The verdict a row's pace pill shows, so filtering matches what is read
   *  on screen rather than a second opinion computed differently. */
  const rowPace = (r: (typeof allRows)[number]) =>
    paceVerdict(
      actualValue(state.actuals, r.goal, {
        subgoalId: r.subgoal ? r.subgoal.id : null,
        person,
      }),
      r.target,
      r.goal.year,
      r.goal.measure
    );

  const rows = useMemo(() => {
    const types = typeFilter ? new Set(typeFilter.split(",")) : null;
    const paces = paceFilter ? new Set(paceFilter.split(",")) : null;
    return allRows.filter((r) => {
      if (types && !types.has(r.goal.type)) return false;
      if (paces && !paces.has(rowPace(r))) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRows, typeFilter, paceFilter, state.actuals, person]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return names
      .filter((n) => n.toLowerCase().includes(q))
      .slice(0, 8);
  }, [names, query]);

  const pcts = rows
    .filter((r) => r.target > 0)
    .map((r) =>
      Math.min(
        150,
        pctMet(
          actualValue(state.actuals, r.goal, {
            subgoalId: r.subgoal ? r.subgoal.id : null,
            person,
          }),
          r.target
        )
      )
    );
  const attainment =
    pcts.length > 0 ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null;

  const PACE_OPTIONS = [
    { value: "ahead", label: "Ahead", color: "#0F766E" },
    { value: "ontrack", label: "On track", color: "#0071E3" },
    { value: "lagging", label: "Lagging", color: "#B45309" },
    { value: "met", label: "Met", color: "#15803D" },
    { value: "unset", label: "No target yet", color: "#64748B" },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2.5">
      <div className="relative w-full max-w-[420px] sm:w-auto sm:flex-1">
        <Search
          size={15}
          strokeWidth={2}
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a person…"
          aria-label="Search a person"
          className="w-full rounded-lg border border-border-light bg-white py-2.5 pl-9 pr-3 text-[13px] text-text-primary outline-none transition-colors placeholder:text-text-tertiary focus:border-blue-primary"
        />
        {matches.length > 0 && (
          <div className="menu-in absolute left-0 right-0 top-full z-30 mt-1.5 overflow-hidden rounded-xl border border-border-light bg-white p-1 shadow-[0_16px_48px_-12px_rgba(0,0,0,0.22)]">
            {matches.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => {
                  setPicked(n);
                  setQuery("");
                }}
                className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-surface"
              >
                <Avatar name={n} className="h-7 w-7 text-[10px]" />
                <span className="text-[13px] font-medium text-text-primary">
                  {n}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
        {allRows.length > 0 && (
          <MultiColorSelect
            values={typeFilter ? typeFilter.split(",") : []}
            onChange={(next) => setTypeFilter(next.join(","))}
            minWidth={150}
            width={118}
            maxWidth={200}
            triggerLabel="Goal type"
            dense
            className="shrink-0"
            allLabel="All goal types"
            ariaLabel="Filter by goal type"
            options={typeOptions.map((t) => ({
              value: t,
              label: t,
              color: typeMeta(t).color,
              icon: typeMeta(t).icon,
            }))}
          />
        )}
        {allRows.length > 0 && (
          <MultiColorSelect
            values={paceFilter ? paceFilter.split(",") : []}
            onChange={(next) => setPaceFilter(next.join(","))}
            minWidth={140}
            width={110}
            maxWidth={180}
            triggerLabel="Pace"
            dense
            className="shrink-0"
            allLabel="Any pace"
            ariaLabel="Filter by pace"
            options={PACE_OPTIONS}
          />
        )}
      </div>

      <div className="mt-4 space-y-4">
        <VerifyQueueCard state={state} run={run} meName={meName} busy={false} />
      </div>

      <Card className="mt-4 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <Avatar name={person} className="h-11 w-11 text-[14px]" />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-[15px] font-bold text-text-primary">
              {person}
              {person === meName && (
                <span className="rounded-full bg-blue-light px-2 py-0.5 text-[10px] font-bold text-blue-primary">
                  YOU
                </span>
              )}
            </p>
            <p className="text-[12px] text-text-secondary">
              {rows.length === allRows.length
                ? `${rows.length} ${rows.length === 1 ? "goal" : "goals"} assigned`
                : `${rows.length} of ${allRows.length} goals shown`}
            </p>
          </div>
          {attainment !== null && (
            <div className="text-right">
              <p className="text-[20px] font-bold text-text-primary tnum">
                {Math.round(attainment)}%
              </p>
              <p className="flex items-center gap-1 text-[10.5px] text-text-tertiary">
                average attainment
                <InfoHint text="The average of this person's % met across every goal that has a personal target." />
              </p>
            </div>
          )}
          {picked && picked !== meName && (
            <button
              type="button"
              onClick={() => setPicked(null)}
              className="cursor-pointer rounded-full bg-surface px-3 py-1.5 text-[11.5px] font-semibold text-text-secondary transition-colors hover:bg-border-light"
            >
              Back to me
            </button>
          )}
        </div>

        {rows.length === 0 && allRows.length > 0 ? (
          /* Filtered to nothing is not the same as carrying nothing, and
             telling someone to go and assign a goal they already have is
             worse than saying nothing. */
          <div className="mt-4 flex flex-col items-center gap-2 rounded-xl bg-surface px-4 py-8 text-center">
            <p className="text-[13px] font-semibold text-text-primary">
              No goals match these filters
            </p>
            <p className="text-[12.5px] text-text-secondary">
              {person === meName ? "You carry" : `${person} carries`}{" "}
              {allRows.length} {allRows.length === 1 ? "goal" : "goals"} in
              total.
            </p>
            <button
              type="button"
              onClick={() => {
                setTypeFilter("");
                setPaceFilter("");
              }}
              className="mt-0.5 cursor-pointer rounded-full bg-white px-3 py-1.5 text-[11.5px] font-semibold text-blue-primary shadow-sm transition-colors hover:bg-blue-light"
            >
              Clear filters
            </button>
          </div>
        ) : rows.length === 0 ? (
          <div className="mt-4 flex flex-col items-center gap-1.5 rounded-xl bg-surface px-4 py-8 text-center">
            <UserRound size={20} strokeWidth={1.8} className="text-text-tertiary" />
            <p className="text-[13px] font-semibold text-text-primary">
              No goals yet
            </p>
            <p className="max-w-[420px] text-[12.5px] leading-relaxed text-text-secondary">
              Goals land here from the Goal Master — open it and assign one
              {person === meName ? " to yourself" : ""}, or ask a manager.
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {rows.map((r) => {
              const actual = actualValue(state.actuals, r.goal, {
                subgoalId: r.subgoal ? r.subgoal.id : null,
                person,
              });
              const pace = paceVerdict(actual, r.target, r.goal.year, r.goal.measure);
              const rowKey = `${r.goal.id}:${r.subgoal?.id ?? "direct"}`;
              const goalOpen = openGoal === rowKey;
              return (
                <div
                  key={rowKey}
                  className="rounded-xl border border-border-light bg-white p-3.5"
                >
                  <div
                    role="button"
                    tabIndex={0}
                    aria-expanded={goalOpen}
                    onClick={() => setOpenGoal(goalOpen ? null : rowKey)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setOpenGoal(goalOpen ? null : rowKey);
                      }
                    }}
                    className="flex cursor-pointer flex-wrap items-center gap-2 rounded-lg transition-colors hover:bg-surface"
                  >
                    <TypeChip type={r.goal.type} size="sm" />
                    {/* The row expands in place; this name still takes you to
                        the full page, which is the option Anir asked to keep
                        ("if i want to actually go to that page that should be
                        an option too"). It stops propagation so the link
                        navigates instead of toggling the row it sits in. */}
                    <Link
                      href={`/performance/goal/${r.goal.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-[13px] font-semibold text-text-primary transition-colors hover:text-blue-primary"
                      title="Open this goal on its own page: financial years, quarters, months, weeks, groups and people"
                    >
                      {r.goal.name}
                    </Link>
                    {r.subgoal ? (
                      <span className="text-[11.5px] text-text-tertiary">
                        {r.subgoal.name}
                      </span>
                    ) : (
                      <span className="rounded-full bg-[rgba(124,58,237,0.08)] px-2 py-0.5 text-[10px] font-bold text-[color:#7C3AED]">
                        DIRECT
                      </span>
                    )}
                    <span className="ml-auto flex items-center gap-1.5">
                      <span className="text-[12px] text-text-secondary tnum">
                        <span className="font-bold text-text-primary">
                          {fmtAmount(r.goal.unit, actual)}
                        </span>{" "}
                        of {r.target > 0 ? fmtAmount(r.goal.unit, r.target) : "—"}
                      </span>
                      <PacePill pace={pace} size="sm" />
                      {live && (
                        <button
                          type="button"
                          onClick={(e) => {
                            // The row itself is a toggle now.
                            e.stopPropagation();
                            onLogActual({
                              goalId: r.goal.id,
                              subgoalId: r.subgoal?.id ?? null,
                              person,
                            });
                          }}
                          className="flex cursor-pointer items-center gap-1 rounded-full bg-blue-light px-2.5 py-1 text-[11px] font-semibold text-blue-primary transition-all hover:bg-blue-primary hover:text-white active:scale-[0.97]"
                        >
                          <PencilLine size={11} strokeWidth={2.2} /> Log an actual
                        </button>
                      )}
                      {/* The row opens its drill-down, and until now nothing
                          said so: the toggle worked but wore no affordance, so
                          it read as flat text (Anir, Aug 14: "I think this
                          should be a dropdown"). Same chevron, same rotation
                          as Org performance. */}
                      <ChevronDown
                        size={15}
                        strokeWidth={2.2}
                        aria-hidden="true"
                        className={cn(
                          "shrink-0 text-text-tertiary transition-transform",
                          goalOpen && "rotate-180 text-blue-primary"
                        )}
                      />
                    </span>
                  </div>
                  <GoalBar
                    className="mt-2"
                    actual={actual}
                    target={r.target}
                    year={r.goal.year}
                    unit={r.goal.unit}
                    pace={pace}
                    showExpected={r.goal.measure === "total"}
                  />
                  {goalOpen && (
                    <div className="tab-panel mt-3 rounded-xl border border-border-light bg-surface/50 p-3">
                      {/* No `run`: it only drives the verification queue,
                          which embedded mode does not render. Same call as
                          Group performance, so the three tabs stay identical. */}
                      <GoalZoom
                        state={state}
                        goalId={r.goal.id}
                        meName={meName}
                        embedded
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <div className="mt-4">
        <MyEntriesCard state={state} person={person} />
      </div>
    </div>
  );
}
