"use client";

import { useMemo, useState } from "react";
import { Crown, Settings2, UsersRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  knownPeople,
  scopeStateToPeople,
  type PerformanceState,
  type PrimaryGoal,
} from "@/lib/performanceShared";
import { OrgPerformanceTab } from "./OrgPerformanceTab";
import { GroupPill } from "./bits";
import { Avatar } from "@/components/ui/Avatar";
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

  const members = useMemo(
    () =>
      group
        ? [
            ...new Set(
              [group.head, ...group.members].map((m) => m.trim()).filter(Boolean)
            ),
          ]
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

  if (groups.length === 0) {
    return (
      <EmptyState
        icon={Settings2}
        title="No user groups yet"
        description="Groups are created by admins on the Admin page. Once a group exists, its members' goals add up here automatically."
      />
    );
  }

  /** The group picker, above the tiles. One click, not a click-then-click. */
  const picker = (
    <div className="flex flex-wrap items-center gap-2">
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
            onClick={() => setPickedId(g.id)}
            aria-pressed={isOpen}
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors",
              isOpen
                ? "border-blue-primary bg-blue-light"
                : "border-border-light bg-white hover:bg-surface"
            )}
          >
            <Avatar name={g.head} className="h-6 w-6 shrink-0 text-[9px]" />
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
              <span className="block text-[11px] text-text-secondary">
                {g.head} · {count} {count === 1 ? "person" : "people"}
              </span>
            </span>
          </button>
        );
      })}
      <Link
        href="/admin"
        className="ml-auto flex items-center gap-1.5 text-[11.5px] font-semibold text-blue-primary hover:underline"
      >
        <UsersRound size={13} strokeWidth={2.2} />
        Manage groups
      </Link>
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
