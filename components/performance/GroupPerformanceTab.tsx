"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Crown, Settings2, UsersRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  knownPeople,
  scopeStateToPeople,
  type PerfGroup,
  type PerformanceState,
  type PrimaryGoal,
} from "@/lib/performanceShared";
import { OrgPerformanceTab } from "./OrgPerformanceTab";
import { GroupPill } from "./bits";
import { Avatar } from "@/components/ui/Avatar";
import { PersonFan } from "@/components/ui/PersonFan";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";
import type { RunOp } from "./PerformanceModule";

/**
 * GROUP PERFORMANCE — the Org screen pointed at one group (Suren, Aug 15:
 * "the exact same UI as org performance on group performance", same overall
 * structure).
 *
 * It is literally the same component: the four tiles, both charts, the filter
 * row and the goal table all come from OrgPerformanceTab. Only the DATA is
 * narrowed, by scopeStateToPeople, so every number on screen is this group's
 * rather than the company's — and there is one implementation to keep right
 * instead of three that drift.
 *
 * A group CAN hold a goal now (Suren, via Anir on Aug 15). Assigning one gives
 * the department a target of its own; achievement is still only ever its
 * people's, added up, which is what the scoping does.
 */
export function GroupPerformanceTab({
  state,
  meName,
  live,
  run,
  onLogActual,
  onEditGoal,
  onEditSubgoal,
  initialGroupId = null,
}: {
  state: PerformanceState;
  meName: string;
  live: boolean;
  run: RunOp;
  onLogActual: (prefill?: { goalId: string; subgoalId: string | null; person: string }) => void;
  onEditGoal: (g: PrimaryGoal) => void;
  onEditSubgoal: (g: PrimaryGoal, s: PrimaryGoal["subgoals"][number]) => void;
  /** Landed here from a search on another tab: open on that group. */
  initialGroupId?: string | null;
}) {
  const router = useRouter();
  const groups = state.groups;
  const [pickedId, setPickedId] = useState<string | null>(
    initialGroupId ?? (groups.length ? groups[0].id : null)
  );
  const group = groups.find((g) => g.id === pickedId) ?? groups[0] ?? null;

  /**
   * COUNTING SCOPE = THE ROSTER, NOT THE CROWN (Suren, Aug 16: "the group
   * owner doesn't have to carry a target. Only the member is carrying the
   * target... but they can put themselves as a member"). The owner still
   * runs this page — sees it, verifies from it — but their own numbers only
   * roll in if they joined the roster like anyone else. The chip faces above
   * still show the owner, because who runs it is display, not math.
   */
  const members = useMemo(
    () =>
      group
        ? [...new Set(group.members.map((m) => m.trim()).filter(Boolean))]
        : [],
    [group]
  );

  const scoped = useMemo(
    () => (group ? scopeStateToPeople(state, members, group.id) : state),
    [state, members, group]
  );

  /** The one search bar reaches the other groups and every person from here
   *  too (Anir, Aug 15: "I can search goals, people, groups, etc."). */
  const jumps = [
    ...groups
      .filter((g) => g.id !== group?.id)
      .map((g) => ({
        kind: "group" as const,
        id: g.id,
        name: g.name,
        sub: `${g.head} · group`,
        go: () => setPickedId(g.id),
      })),
    ...knownPeople(state, meName).map((n) => ({
      kind: "person" as const,
      id: n,
      name: n,
      sub: members.includes(n) ? `in ${group?.name ?? "this group"}` : undefined,
      go: () => router.push(`/performance/people?person=${encodeURIComponent(n)}`),
    })),
  ];

  const stripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = stripRef.current?.querySelector('[data-picked="true"]');
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [pickedId]);

  if (groups.length === 0) {
    return (
      <EmptyState
        icon={Settings2}
        title="No user groups yet"
        description="Groups are created by admins on the Admin page. Once a group exists, its members' goals add up here automatically."
      />
    );
  }

  /**
   * HOW MANY GOALS EACH GROUP CARRIES, on the card itself (Anir, Aug 19: "is
   * it a good idea to show right here how many goals each group has?").
   *
   * Counted the same way the tiles below count them once the group is open,
   * so the number on the card and the number on the page never disagree.
   */
  const goalCountFor = (g: PerfGroup) => {
    const roster = [...new Set(g.members.map((m) => m.trim()).filter(Boolean))];
    return scopeStateToPeople(state, roster, g.id).goals.length;
  };

  /**
   * THE PICKER AT TEN GROUPS, NOT THREE (Anir, Aug 19: "if there are like ten
   * groups, how's this gonna work?... You have to extrapolate. You can't just
   * do this with the given data").
   *
   * The cards used to wrap, so ten of them stacked four rows deep and pushed
   * every tile and chart below the fold before you had read a number. The
   * strip is now ONE line that scrolls sideways, so the page keeps its shape
   * whether there are two groups or fifty, and the selected card scrolls
   * itself into view — a group picked from the search below must never sit
   * off-screen. Finding one of forty is the search bar's job, not a second
   * dropdown up here (Anir, Aug 19: "remove the dropdown"); it already
   * reaches every other group and person on the page.
   */
  const picker = (
    <div className="flex items-center gap-3">
      <div
        ref={stripRef}
        className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]"
      >
      {groups.map((g) => {
        const isOpen = g.id === group?.id;
        const isMine =
          g.head.trim().toLowerCase() === meName.trim().toLowerCase();
        const count = new Set(
          [g.head, ...g.members].map((m) => m.trim()).filter(Boolean)
        ).size;
        return (
          <button
            key={g.id}
            type="button"
            data-picked={isOpen ? "true" : undefined}
            onClick={() => setPickedId(g.id)}
            aria-pressed={isOpen}
            className={cn(
              "flex shrink-0 cursor-pointer items-stretch gap-2 rounded-xl border py-2 pl-3 pr-2 text-left transition-colors",
              isOpen
                ? "border-blue-primary bg-blue-light"
                : "border-border-light bg-white hover:bg-surface"
            )}
          >
            {/* THE GROUP'S FACES, ALWAYS ON THE CHIP (Anir, Aug 15: "there's
                no way here I can see the people in my group... just include the
                profile pictures of each one and when I hover over the profile
                picture it'll show me the expanded view"). The owner's face
                alone told you who runs it, never who is in it. */}
            <PersonFan
              people={[
                ...new Set(
                  [g.head, ...g.members].map((m) => m.trim()).filter(Boolean)
                ),
              ].map((m) => ({
                name: m,
                role: m === g.head ? "Group owner" : "In this group",
                context: g.name,
              }))}
              avatarClassName="h-6 w-6 text-[8px]"
            />
            <span className="min-w-0">
              {/* The name IS the pill here too, so a group reads the same on
                  the picker as it does in the headings below it. */}
              <span className="flex items-center gap-1.5">
                <GroupPill name={g.name} />
                {isMine && (
                  <Crown
                    size={11}
                    strokeWidth={2.6}
                    className="text-[color:#7C3AED]"
                    aria-label="You own this group"
                  />
                )}
              </span>
              {/* THE OWNER WEARS THEIR FACE AND THE CROWN (Anir, Aug 16: "i
                  need the crown and the pfp next to the owner name"). The
                  faces on the left are everyone in the group; this one says
                  which of them runs it, in the same purple used everywhere
                  else for ownership. */}
              <span className="flex items-center gap-1.5 text-[11px] text-text-secondary">
                <Avatar name={g.head} className="h-4 w-4 shrink-0 text-[6px]" />
                <span className="truncate">{g.head}</span>
                <Crown
                  size={10}
                  strokeWidth={2.8}
                  aria-label="Group owner"
                  className="shrink-0 text-[color:#7C3AED]"
                />
                <span className="shrink-0 text-text-tertiary">
                  · {count} {count === 1 ? "person" : "people"}
                </span>
              </span>
            </span>
            {/* THE THIRD BLOCK, not a fourth word (Anir, Aug 19: "you can't
                put it after where it says '5 people'. You can't put it below,
                because that is going to look asymmetrical"). Faces on the
                left, who-and-how-many in the middle, the workload on the
                right behind a hairline — the card reads as three columns and
                every card is the same height. */}
            <span
              className={cn(
                "ml-1 flex shrink-0 flex-col items-center justify-center self-stretch border-l pl-2.5 pr-1",
                isOpen ? "border-[rgba(0,113,227,0.25)]" : "border-border-light"
              )}
            >
              <b
                className={cn(
                  "text-[15px] font-extrabold leading-none tnum",
                  isOpen ? "text-blue-primary" : "text-text-primary"
                )}
              >
                {goalCountFor(g)}
              </b>
              <span className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
                {goalCountFor(g) === 1 ? "goal" : "goals"}
              </span>
            </span>
          </button>
        );
      })}
      </div>
    </div>
  );

  return (
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
        subjectKey: group?.id ?? "none",
        goals: scoped.goals,
        noun: "goals in this group",
        picker,
        jumps,
        accent: "#0F766E",
        exportLabel: `group-${group?.name ?? "all"}`,
        // Every heading names the group, so this screen can never be mistaken
        // for Org or People (Anir, Aug 15: "they have to know which one
        // they're on").
        words: {
          trackedLabel: "Goals in this group",
          trackedSub: group
            ? `carried by ${members.length} ${members.length === 1 ? "person" : "people"}`
            : "carried by its people",
          verifiedSub: group
            ? `signed off by ${group.head.split(" ")[0]}`
            : "signed off by the group owner",
          barTitle: group ? (
            <>
              How far along <GroupPill name={group.name} /> is on each goal
            </>
          ) : (
            "How far along this group is on each goal"
          ),
          donutTitle: group ? (
            <>
              Where <GroupPill name={group.name} /> stands
            </>
          ) : (
            "Where this group stands"
          ),
          searchPlaceholder: group
            ? `Search ${group.name}'s goals and people…`
            : "Search this group's goals and people…",
        },
        emptyTitle: group
          ? `Nobody in ${group.name} carries a goal yet`
          : "No group selected",
        emptyDescription:
          "Assign one to this group from the Goal Master, or give it to somebody in it. Either way it shows up here, and what its people log adds up into it.",
      }}
    />
  );
}
