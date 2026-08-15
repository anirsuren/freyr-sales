"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
  initialPerson = null,
}: {
  state: PerformanceState;
  live: boolean;
  run: RunOp;
  meName: string;
  memberRoles?: Record<string, string>;
  onLogActual: (prefill?: { goalId: string; subgoalId: string | null; person: string }) => void;
  onEditGoal: (g: PrimaryGoal) => void;
  onEditSubgoal: (g: PrimaryGoal, s: PrimaryGoal["subgoals"][number]) => void;
  /** Landed here from a search on another tab: open on that person. */
  initialPerson?: string | null;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<string | null>(initialPerson);
  const person = picked ?? meName;
  const first = person.trim().split(/\s+/)[0] || person;

  const names = useMemo(() => knownPeople(state, meName), [state, meName]);

  const scoped = useMemo(
    () => scopeStateToPeople(state, [person]),
    [state, person]
  );

  /**
   * WHO YOU ARE LOOKING AT. Nothing more — the search that used to live out
   * here was a second box doing what the filter row's box already does (Anir,
   * Aug 15: "why is there a search a person button there? That makes zero
   * sense. There's already a search bar on the left with the filters").
   * People and groups are matched by that one bar now, below.
   */
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
    </div>
  );

  /** Everyone the server lets you see, plus every group, reachable from the
   *  one search bar in the filter row. */
  const jumps = useMemo(
    () => [
      ...names
        .filter((n) => n !== person)
        .map((n) => ({
          kind: "person" as const,
          id: n,
          name: n,
          sub: memberRoles?.[n.trim()],
          go: () => setPicked(n),
        })),
      ...state.groups.map((g) => ({
        kind: "group" as const,
        id: g.id,
        name: g.name,
        sub: `${g.head} · group`,
        go: () => router.push(`/performance/groups?group=${encodeURIComponent(g.id)}`),
      })),
    ],
    [names, person, memberRoles, state.groups, router]
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
          jumps,
          accent: "#B4318F",
          // Named after the person you are looking at, so the screen says who
          // it is about before you check which tab is lit (Anir, Aug 15).
          words: {
            trackedLabel:
              person === meName ? "Goals you carry" : `Goals ${first} carries`,
            trackedSub:
              person === meName
                ? "assigned to you or picked up by you"
                : `assigned to ${first} or picked up by them`,
            verifiedSub:
              person === meName
                ? "signed off by your group owner"
                : `signed off by ${first}'s group owner`,
            barTitle:
              person === meName
                ? "How far along you are on each goal"
                : `How far along ${first} is on each goal`,
            donutTitle:
              person === meName ? "Where you stand" : `Where ${first} stands`,
            searchPlaceholder:
              person === meName
                ? "Search your goals and subgoals…"
                : `Search ${first}'s goals and subgoals…`,
          },
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
        <MyEntriesCard
          state={state}
          person={person}
          run={run}
          meName={meName}
        />
      </div>
    </div>
  );
}
