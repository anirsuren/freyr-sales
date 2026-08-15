"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import {
  knownPeople,
  scopeStateToPeople,
  type PerformanceState,
  type PrimaryGoal,
} from "@/lib/performanceShared";
import { OrgPerformanceTab } from "./OrgPerformanceTab";
import { Avatar } from "@/components/ui/Avatar";
import { MyEntriesCard, VerifyQueueCard } from "./EntryCards";
import { RoleChip } from "./bits";
import type { RunOp } from "./PerformanceModule";

/**
 * PEOPLE PERFORMANCE — the Org screen pointed at one person (Suren, Aug 15:
 * same UI, same overall structure, everywhere).
 *
 * Same component as Org and Group: four tiles, both charts, the filter row,
 * the goal table with its drill-down. Only the data is narrowed, so "Actual"
 * is what this person logged and "Target" is what they personally carry.
 *
 * You land on yourself. Searching a name shows anyone the server lets you
 * see, which for most people is exactly themselves (Suren, Aug 12: "you
 * cannot list all the people, but if somebody wants to search some people
 * name, then that people name can come").
 */
export function PeopleTab({
  state,
  live,
  run,
  meName,
  memberRoles,
  onLogActual,
  onEditGoal,
  onEditSubgoal,
}: {
  state: PerformanceState;
  live: boolean;
  run: RunOp;
  meName: string;
  memberRoles?: Record<string, string>;
  onLogActual: () => void;
  onEditGoal: (g: PrimaryGoal) => void;
  onEditSubgoal: (g: PrimaryGoal, s: PrimaryGoal["subgoals"][number]) => void;
}) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const person = picked ?? meName;

  const names = useMemo(() => knownPeople(state, meName), [state, meName]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return names.filter((n) => n.toLowerCase().includes(q)).slice(0, 8);
  }, [names, query]);

  const scoped = useMemo(
    () => scopeStateToPeople(state, [person]),
    [state, person]
  );

  /** Who you are looking at, and how to look at someone else. */
  const picker = (
    <div className="flex flex-wrap items-center gap-3">
      <span className="flex items-center gap-2.5">
        <Avatar name={person} className="h-9 w-9 text-[12px]" />
        <span className="min-w-0">
          <span className="flex items-center gap-2 text-[14px] font-bold text-text-primary">
            {person}
            {person === meName && (
              <span className="rounded-full bg-blue-light px-2 py-0.5 text-[10px] font-bold text-blue-primary">
                YOU
              </span>
            )}
            {memberRoles?.[person.trim()] && (
              <RoleChip role={memberRoles[person.trim()]} />
            )}
          </span>
          {picked && picked !== meName && (
            <button
              type="button"
              onClick={() => setPicked(null)}
              className="mt-0.5 cursor-pointer text-[11.5px] font-semibold text-blue-primary hover:underline"
            >
              Back to me
            </button>
          )}
        </span>
      </span>

      <div className="relative ml-auto w-full max-w-[320px]">
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
                <span className="flex items-center gap-2 text-[13px] font-medium text-text-primary">
                  {n}
                  {memberRoles?.[n.trim()] && (
                    <RoleChip role={memberRoles[n.trim()]} />
                  )}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div>
      {/* The verification queue and this person's own entries stay: they are
          about claims, not goals, and the Org screen has no equivalent. */}
      <div className="mb-4 space-y-4">
        <VerifyQueueCard state={state} run={run} meName={meName} busy={false} />
      </div>

      <OrgPerformanceTab
        state={scoped}
        meName={meName}
        live={live}
        run={run}
        onLogActual={onLogActual}
        onGoToMaster={() => undefined}
        onEditGoal={onEditGoal}
        onEditSubgoal={onEditSubgoal}
        scope={{
          goals: scoped.goals,
          noun: "goals",
          picker,
          emptyTitle:
            person === meName
              ? "You carry no goals yet"
              : `Nothing assigned to ${person.split(" ")[0]} yet`,
          emptyDescription:
            person === meName
              ? "Pick one up from the Goal Master, or a manager assigns you one. It shows up here with its target and everything you log against it."
              : "A goal reaches someone either way: they pick it up from the Goal Master, or leadership assigns it to them.",
        }}
      />

      <div className="mt-4">
        <MyEntriesCard state={state} person={person} />
      </div>
    </div>
  );
}
