"use client";

import { useState } from "react";
import {
  AlarmClock,
  ChevronDown,
  CircleSlash,
  Target,
  TriangleAlert,
  UserRoundPlus,
} from "lucide-react";
import {
  actualValue,
  entryStatus,
  headedGroups,
  type PerformanceState,
  type PrimaryGoal,
} from "@/lib/performanceShared";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";
import { typeMeta } from "./bits";

/**
 * WHAT IS BROKEN, NOT WHAT IS BEHIND (Anir, Aug 15: "so many features people
 * would need that just don't exist").
 *
 * "Lagging" already has a pill and a chart. Nothing surfaced the goals that
 * are not behind but MISSING something — tracked all year with no target,
 * carried by nobody, never logged against — or the claims that have been
 * sitting on a verifier for over a week. An admin had to read every row of
 * every tab to find them, so nobody did.
 *
 * Each finding names the fix and puts it one click away.
 */
type Finding = {
  key: string;
  kind: "target" | "owner" | "silent" | "stale";
  goal?: PrimaryGoal;
  title: string;
  detail: string;
  person?: string;
};

const KIND_META = {
  target: { icon: Target, color: "#0071E3", label: "No target" },
  owner: { icon: UserRoundPlus, color: "#7C3AED", label: "Nobody carries it" },
  silent: { icon: CircleSlash, color: "#0891B2", label: "Nothing logged" },
  stale: { icon: AlarmClock, color: "#C2410C", label: "Waiting too long" },
} as const;

/** A claim nobody has looked at in this many days is chasing somebody. */
const STALE_DAYS = 7;

export function NeedsAttention({
  state,
  goals,
  meName,
  live,
  onEditGoal,
  onAssign,
}: {
  state: PerformanceState;
  /** The goals in scope for the tab this is rendered on. */
  goals: PrimaryGoal[];
  meName: string;
  live: boolean;
  onEditGoal: (g: PrimaryGoal) => void;
  onAssign: (g: PrimaryGoal) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!live) return null;

  const heads = headedGroups(state, meName);
  const mine = new Set(
    heads.flatMap((g) => [g.head, ...g.members].map((m) => m.trim().toLowerCase()))
  );

  const findings: Finding[] = [];
  for (const g of goals) {
    if (g.target <= 0) {
      findings.push({
        key: `t-${g.id}`,
        kind: "target",
        goal: g,
        title: g.name,
        detail: "Tracked, but there is nothing to measure it against.",
      });
    }
    const people = (g.assignments ?? []).length;
    const groups = (g.groupAssignments ?? []).length;
    if (people === 0 && groups === 0) {
      findings.push({
        key: `o-${g.id}`,
        kind: "owner",
        goal: g,
        title: g.name,
        detail: "No person and no group carries this.",
      });
    }
    if (g.target > 0 && actualValue(state.actuals, g) === 0) {
      findings.push({
        key: `s-${g.id}`,
        kind: "silent",
        goal: g,
        title: g.name,
        detail: "Nothing has been logged against it all year.",
      });
    }
  }

  // Claims parked on a verifier. Only the ones this reader can actually clear.
  const now = Date.now();
  for (const a of state.actuals) {
    if (entryStatus(a) !== "reported") continue;
    if (!mine.has(a.person.trim().toLowerCase())) continue;
    const age = Math.floor((now - Date.parse(a.addedAt)) / 86_400_000);
    if (!Number.isFinite(age) || age < STALE_DAYS) continue;
    const goal = state.goals.find((g) => g.id === a.goalId);
    findings.push({
      key: `w-${a.id}`,
      kind: "stale",
      goal,
      person: a.person,
      title: `${a.person} · ${goal?.name ?? "a goal"}`,
      detail: `Claimed ${age} days ago and still waiting on you.`,
    });
  }

  if (findings.length === 0) return null;

  const counts = findings.reduce<Record<string, number>>((acc, f) => {
    acc[f.kind] = (acc[f.kind] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <Card className="mb-4 overflow-hidden p-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-surface"
      >
        <TriangleAlert size={15} strokeWidth={2.2} className="shrink-0 text-[color:#C2410C]" />
        <span className="text-[13.5px] font-semibold text-text-primary">
          Needs a decision
        </span>
        <span className="rounded-full bg-[rgba(194,65,12,0.12)] px-2 py-0.5 text-[10.5px] font-bold text-[color:#C2410C] tnum">
          {findings.length}
        </span>
        <span className="ml-1 flex flex-wrap items-center gap-1.5">
          {(Object.keys(KIND_META) as (keyof typeof KIND_META)[])
            .filter((k) => counts[k])
            .map((k) => {
              const meta = KIND_META[k];
              return (
                <span
                  key={k}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
                  style={{ background: `${meta.color}1A`, color: meta.color }}
                >
                  <meta.icon size={10} strokeWidth={2.4} />
                  {counts[k]} {meta.label.toLowerCase()}
                </span>
              );
            })}
        </span>
        <ChevronDown
          size={16}
          strokeWidth={2.2}
          aria-hidden="true"
          className={cn(
            "ml-auto shrink-0 text-text-tertiary transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div className="tab-panel divide-y divide-border-light border-t border-border-light">
          {findings.slice(0, 24).map((f) => {
            const meta = KIND_META[f.kind];
            return (
              <div key={f.key} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                  style={{ background: `${meta.color}14`, color: meta.color }}
                >
                  <meta.icon size={14} strokeWidth={2.2} />
                </span>
                {f.person && (
                  <Avatar name={f.person} className="h-6 w-6 shrink-0 text-[9px]" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <b className="text-[13px] text-text-primary">{f.title}</b>
                    {f.goal && (
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold"
                        style={{
                          background: `${typeMeta(f.goal.type).color}14`,
                          color: typeMeta(f.goal.type).color,
                        }}
                      >
                        {f.goal.type}
                      </span>
                    )}
                  </span>
                  <span className="block text-[11.5px] text-text-secondary">
                    {f.detail}
                  </span>
                </span>
                {f.goal && f.kind !== "stale" && (
                  <button
                    type="button"
                    onClick={() =>
                      f.kind === "owner" ? onAssign(f.goal!) : onEditGoal(f.goal!)
                    }
                    className="shrink-0 cursor-pointer rounded-lg bg-blue-light px-3 py-1.5 text-[12px] font-semibold text-blue-primary transition-all hover:bg-blue-primary hover:text-white active:scale-[0.97]"
                  >
                    {f.kind === "owner" ? "Assign it" : "Set a target"}
                  </button>
                )}
                {f.kind === "stale" && (
                  <span className="shrink-0 text-[11.5px] font-semibold text-[color:#C2410C]">
                    Verify it above
                  </span>
                )}
              </div>
            );
          })}
          {findings.length > 24 && (
            <p className="px-4 py-2 text-[11.5px] text-text-tertiary">
              And {findings.length - 24} more.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
