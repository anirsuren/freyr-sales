"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  visiblePeople,
  scopeStateToPeople,
  type PerformanceState,
  type PrimaryGoal,
} from "@/lib/performanceShared";
import { OrgPerformanceTab } from "./OrgPerformanceTab";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";
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
  /**
   * ONLY THE PEOPLE YOU MAY LOOK AT (Anir, Aug 16: "Restrict"). Admins get the
   * whole workspace; everybody else gets themselves plus the groups they head.
   * See visiblePeople — this list is also what a `?person=` link is validated
   * against below, so a link cannot reach past it.
   */
  const names = useMemo(
    () => visiblePeople(state, meName, memberRoles?.[meName.trim()]),
    [state, meName, memberRoles]
  );
  /** Nobody else to look at: the name is a label, not a control. */
  const canSwitch = names.length > 1;

  /**
   * A NAME IN A LINK IS A REQUEST, NOT A FACT (found Aug 16, sweeping the
   * detail routes for ids that do not exist). `?person=` seeded the selection
   * with whatever the URL said, unchecked — so
   * /performance/people?person=ZZ Ghost Person drew that name in the picker,
   * generated initials for an avatar beside it, and announced "Nothing
   * assigned to ZZ yet", as though a colleague by that name worked here and
   * had simply been given no goals. A stale link, a misspelling, or somebody
   * who has left all produce it.
   *
   * The workspace's own list of people is right here, so the link only wins
   * when it names one of them. Anything else falls back to the documented
   * default — your own performance — instead of inventing a teammate.
   */
  const validInitial = useMemo(() => {
    const requested = (initialPerson ?? "").trim();
    if (!requested) return null;
    return (
      names.find((n) => n.toLowerCase() === requested.toLowerCase()) ?? null
    );
  }, [initialPerson, names]);

  const [picked, setPicked] = useState<string | null>(validInitial);
  const [pickOpen, setPickOpen] = useState(false);
  const person = picked ?? meName;
  const first = person.trim().split(/\s+/)[0] || person;

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
      {/* WHO YOU ARE LOOKING AT, AND HOW TO LOOK AT SOMEONE ELSE.
          Suren, via Anir, Aug 15: "when I go to people performance and then
          look at only Ananth, for that I have to log in as Ananth. What the
          heck?" You never had to — but after the duplicate search box came out
          the only way left was to type a name into the filter bar, which reads
          as filtering YOUR goals, not switching person. So the name itself is
          the control now. */}
      <span className="relative flex items-center gap-2.5">
        <Avatar name={person} className="h-9 w-9 text-[12px]" />
        <span className="min-w-0">
          <button
            type="button"
            onClick={() => setPickOpen((v) => !v)}
            aria-expanded={pickOpen}
            className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-0.5 -mx-1.5 text-[14px] font-bold text-text-primary transition-colors hover:bg-surface"
          >
            {person}
            {person === meName && (
              <span className="rounded-full bg-blue-light px-2 py-0.5 text-[10px] font-bold text-blue-primary">
                YOU
              </span>
            )}
            {memberRoles?.[person.trim()] && (
              <RoleChip role={memberRoles[person.trim()]} />
            )}
            <ChevronDown
              size={15}
              strokeWidth={2.4}
              aria-hidden="true"
              className={cn(
                "text-text-tertiary transition-transform",
                pickOpen && "rotate-180"
              )}
            />
          </button>
          <span className="block text-[11.5px] text-text-secondary">
            {person === meName
              ? "your goals — pick a name to see somebody else's"
              : `viewing ${first}'s goals`}
          </span>
        </span>

        {pickOpen && (
          <>
            <span
              className="fixed inset-0 z-20"
              onClick={() => setPickOpen(false)}
              aria-hidden="true"
            />
            <div className="menu-in absolute left-11 top-full z-30 mt-1.5 max-h-[320px] w-[280px] overflow-y-auto rounded-xl border border-border-light bg-white p-1 shadow-[0_16px_48px_-12px_rgba(0,0,0,0.22)]">
              {names.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => {
                    setPicked(n === meName ? null : n);
                    setPickOpen(false);
                  }}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-surface",
                    n === person && "bg-blue-light/50"
                  )}
                >
                  <Avatar name={n} className="h-7 w-7 shrink-0 text-[10px]" />
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-[13px] font-medium text-text-primary">
                      {n}
                    </span>
                    {n === meName && (
                      <span className="rounded-full bg-blue-light px-1.5 py-0.5 text-[9px] font-bold text-blue-primary">
                        YOU
                      </span>
                    )}
                    {memberRoles?.[n.trim()] && <RoleChip role={memberRoles[n.trim()]} />}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
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
          exportLabel: `person-${person}`,
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
