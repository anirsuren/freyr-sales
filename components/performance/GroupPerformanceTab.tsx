"use client";

import { useState } from "react";
import { ChevronDown, Crown, PencilLine, Settings2 } from "lucide-react";
import Link from "next/link";
import {
  actualValue,
  fmtAmount,
  paceVerdict,
  pctMet,
  personGoalRows,
  type PerformanceState,
} from "@/lib/performanceShared";
import { GoalZoom } from "./GoalZoom";
import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { InfoHint } from "@/components/ui/InfoHint";
import { cn } from "@/lib/utils";
import { GoalBar, PacePill, TypeChip } from "./bits";

/**
 * GROUP PERFORMANCE (Suren, Aug 12): "you'll have all the group names...
 * and when you double click on that, all the people under that group you can
 * see." A group never holds goals itself — it is exactly its members' person
 * goals added up. Groups are CREATED in Settings → User groups (admin);
 * this page only reads them.
 */
export function GroupPerformanceTab({
  state,
  meName,
  live,
  onLogActual,
}: {
  state: PerformanceState;
  meName: string;
  live: boolean;
  onLogActual: (prefill: {
    goalId: string;
    subgoalId: string | null;
    person: string;
  }) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  /** Which person+goal pair inside an open group is showing its drill-down.
   *  Same idea as Org performance: the detail opens where you clicked it. */
  const [openGoal, setOpenGoal] = useState<string | null>(null);

  if (state.groups.length === 0) {
    return (
      <EmptyState
        icon={Settings2}
        title="No user groups yet"
        description="Groups are created by admins on the Admin page. Once a group exists, its members' goals add up here automatically."
      />
    );
  }

  return (
    <div className="space-y-3">
      {state.groups.map((group) => {
        const members = [
          ...new Set(
            [group.head, ...group.members].map((m) => m.trim()).filter(Boolean)
          ),
        ];
        const memberRows = members.map((person) => ({
          person,
          rows: personGoalRows(state, person),
        }));
        // Group attainment: average of every member-goal % that has a target.
        const pcts: number[] = [];
        for (const m of memberRows) {
          for (const r of m.rows) {
            if (r.target > 0) {
              const actual = actualValue(state.actuals, r.goal, {
                subgoalId: r.subgoal ? r.subgoal.id : null,
                person: m.person,
              });
              pcts.push(Math.min(150, pctMet(actual, r.target)));
            }
          }
        }
        const attainment =
          pcts.length > 0
            ? pcts.reduce((a, b) => a + b, 0) / pcts.length
            : null;
        const isOpen = open === group.id;
        const isMine =
          group.head.trim().toLowerCase() === meName.trim().toLowerCase();
        return (
          <Card key={group.id} className="overflow-hidden p-0">
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : group.id)}
              className="flex w-full cursor-pointer items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface"
            >
              <span className="min-w-0 sm:w-72 sm:shrink-0">
                <span className="flex items-center gap-2 text-[14px] font-bold text-text-primary">
                  {group.name}
                  {isMine && (
                    <span className="rounded-full bg-[rgba(124,58,237,0.10)] px-2 py-0.5 text-[10px] font-bold text-[color:#7C3AED]">
                      YOURS
                    </span>
                  )}
                </span>
                <span className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-text-secondary">
                  <Avatar name={group.head} className="h-4.5 w-4.5 h-[18px] w-[18px] text-[7px]" />
                  <Crown
                    size={10}
                    strokeWidth={2.6}
                    className="text-[color:#7C3AED]"
                    aria-label="Group owner"
                  />
                  {group.head} · {members.length}{" "}
                  {members.length === 1 ? "person" : "people"}
                </span>
              </span>
              <span className="hidden flex-1 items-center gap-2.5 sm:flex">
                <span className="shrink-0 text-[11.5px] text-text-tertiary tnum">
                  {pcts.length} {pcts.length === 1 ? "target" : "targets"} set
                </span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[rgba(0,113,227,0.10)]">
                  {attainment !== null && (
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${Math.min(100, attainment)}%`,
                        background:
                          attainment >= 85
                            ? "#16A34A"
                            : attainment >= 55
                              ? "#0071E3"
                              : "#DC2626",
                      }}
                    />
                  )}
                </span>
                <span className="w-12 shrink-0 text-right text-[12px] font-semibold text-text-primary tnum">
                  {attainment !== null ? `${Math.round(attainment)}%` : "—"}
                </span>
              </span>
              <ChevronDown
                size={15}
                strokeWidth={2.2}
                className={cn(
                  "shrink-0 text-text-tertiary transition-transform",
                  isOpen && "rotate-180 text-blue-primary"
                )}
              />
            </button>
            {isOpen && (
              <div className="tab-panel space-y-2.5 bg-surface px-4 pb-4 pt-3">
                {memberRows.map(({ person, rows }) => (
                  <div key={person} className="rounded-xl bg-white p-3.5">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={person} className="h-8 w-8 text-[11px]" />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-text-primary">
                        {person}
                        {person === group.head && (
                          <Crown
                            size={11}
                            strokeWidth={2.6}
                            className="ml-1.5 inline text-[color:#7C3AED]"
                            aria-label="Group owner"
                          />
                        )}
                      </span>
                      <span className="shrink-0 text-[11.5px] text-text-tertiary tnum">
                        {rows.length} {rows.length === 1 ? "goal" : "goals"}
                      </span>
                    </div>
                    {rows.length === 0 ? (
                      <p className="mt-2 rounded-lg bg-surface px-3 py-2.5 text-[12px] text-text-secondary">
                        No goals assigned yet — pick some up from the Goal
                        Master.
                      </p>
                    ) : (
                      <div className="mt-2.5 space-y-2.5">
                        {rows.map((r) => {
                          const actual = actualValue(state.actuals, r.goal, {
                            subgoalId: r.subgoal ? r.subgoal.id : null,
                            person,
                          });
                          const pace = paceVerdict(
                            actual,
                            r.target,
                            r.goal.year,
                            r.goal.measure
                          );
                          const rowKey = `${person}:${r.goal.id}:${r.subgoal?.id ?? "direct"}`;
                          const goalOpen = openGoal === rowKey;
                          return (
                            <div key={rowKey}>
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
                                className="flex cursor-pointer flex-wrap items-center gap-2 rounded-lg transition-colors hover:bg-surface">
                                <TypeChip type={r.goal.type} size="sm" />
                                <span className="text-[12.5px] font-semibold text-text-primary">
                                  {r.goal.name}
                                </span>
                                {r.subgoal && (
                                  <span className="text-[11px] text-text-tertiary">
                                    — {r.subgoal.name}
                                  </span>
                                )}
                                <span className="ml-auto flex items-center gap-1.5">
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
                                      <PencilLine size={11} strokeWidth={2.2} />{" "}
                                      Log an actual
                                    </button>
                                  )}
                                </span>
                              </div>
                              <GoalBar
                                className="mt-1.5"
                                actual={actual}
                                target={r.target}
                                year={r.goal.year}
                                unit={r.goal.unit}
                                pace={pace}
                                showExpected={r.goal.measure === "total"}
                              />
                              {goalOpen && (
                                <div className="tab-panel mt-3 rounded-xl border border-border-light bg-surface/50 p-3">
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
                  </div>
                ))}
              </div>
            )}
          </Card>
        );
      })}
      <p className="flex items-center gap-1.5 text-[11.5px] text-text-tertiary">
        <Settings2 size={13} strokeWidth={2} />
        Creating groups and managing who&apos;s in them lives on the{" "}
        <Link href="/admin" className="font-semibold text-blue-primary hover:underline">
          Admin page
        </Link>{" "}
        — admins only.
      </p>
    </div>
  );
}
