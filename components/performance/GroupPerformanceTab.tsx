"use client";

import { useMemo, useState } from "react";
import { Crown, Settings2, UsersRound } from "lucide-react";
import Link from "next/link";
import {
  scopeStateToPeople,
  type PerformanceState,
  type PrimaryGoal,
} from "@/lib/performanceShared";
import { OrgPerformanceTab } from "./OrgPerformanceTab";
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
 * A group still never holds goals itself. It is exactly its members' goals
 * added up, which is what the scoping does.
 */
export function GroupPerformanceTab({
  state,
  meName,
  live,
  run,
  onLogActual,
  onEditGoal,
  onEditSubgoal,
}: {
  state: PerformanceState;
  meName: string;
  live: boolean;
  run: RunOp;
  onLogActual: () => void;
  onEditGoal: (g: PrimaryGoal) => void;
  onEditSubgoal: (g: PrimaryGoal, s: PrimaryGoal["subgoals"][number]) => void;
}) {
  const groups = state.groups;
  const [pickedId, setPickedId] = useState<string | null>(
    groups.length ? groups[0].id : null
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
    () => (group ? scopeStateToPeople(state, members) : state),
    [state, members, group]
  );

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
              <span className="flex items-center gap-1.5 text-[13px] font-semibold text-text-primary">
                {g.name}
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
        accent: "#0F766E",
        // Every heading names the group, so this screen can never be mistaken
        // for Org or People (Anir, Aug 15: "they have to know which one
        // they're on").
        words: {
          trackedLabel: "Goals in this group",
          trackedSub: group
            ? `carried by ${members.length} ${members.length === 1 ? "person" : "people"} in ${group.name}`
            : "carried by its people",
          verifiedSub: group
            ? `signed off by ${group.head.split(" ")[0]}`
            : "signed off by the group owner",
          barTitle: group
            ? `How far along ${group.name} is on each goal`
            : "How far along this group is on each goal",
          donutTitle: group ? `Where ${group.name} stands` : "Where this group stands",
          searchPlaceholder: group
            ? `Search ${group.name}'s goals and people…`
            : "Search this group's goals and people…",
        },
        emptyTitle: group
          ? `Nobody in ${group.name} carries a goal yet`
          : "No group selected",
        emptyDescription:
          "Goals reach a group through its people: assign one from the Goal Master, or the person picks it up themselves. It then adds up here.",
      }}
    />
  );
}
