"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  ClipboardList,
  ShieldCheck,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";
import {
  actualValue,
  scopeStateToPeople,
  type PerfActual,
  type PerformanceState,
  type PrimaryGoal,
} from "@/lib/performanceShared";

/**
 * WHAT THIS GROUP IS ACTUALLY CARRYING, TWO CLICKS DEEP (Anir, Aug 25: "I
 * would like to see here who the six goals are. I want to see more. If I click
 * on Group 1 I want to see all their goals and how they're doing on the goals.
 * Maybe when I click the dropdown below the people, it shows me the goals, and
 * then I can click into each goal. It's another dropdown, and then I can see
 * what I have to verify. It's just saying '1 to verify'").
 *
 * The card said "6 goals" and "1 to verify" and stopped there — two numbers
 * with no way to reach what they counted, so the only way to find out WHICH
 * goal, or WHOSE result was waiting, was to leave for Group performance and
 * hunt. The people list opens the group; the goals open under it; each goal
 * opens onto the people carrying it and the results waiting on a signature.
 *
 * Every number here comes from scopeStateToPeople and actualValue, the same
 * two functions Group performance uses, for the reason written on the rollup
 * above: these chips have drifted from that room once already and must not
 * again.
 */

const PENDING: PerfActual["status"][] = ["reported", "sent_back"];
const isPending = (a: PerfActual) => PENDING.includes(a.status);

function money(n: number, unit: PrimaryGoal["unit"]): string {
  if (unit !== "currency") return n.toLocaleString();
  if (Math.abs(n) >= 1_000_000) {
    const m = n / 1_000_000;
    return `$${m >= 10 ? Math.round(m) : Math.round(m * 10) / 10}M`;
  }
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

export function GroupGoalsDrilldown({
  state,
  groupId,
  groupName,
  members,
}: {
  state: PerformanceState;
  groupId: string;
  groupName: string;
  members: string[];
}) {
  const [open, setOpen] = useState(false);
  const [openGoal, setOpenGoal] = useState<string | null>(null);

  const scoped = scopeStateToPeople(state, members, groupId);
  const goals = scoped.goals;
  const inGroup = (name: string) =>
    members.some((m) => m.toLowerCase() === name.trim().toLowerCase());

  /** Everything waiting on a signature, across the whole group. */
  const waitingAll = state.actuals.filter(
    (a) => inGroup(a.person) && isPending(a)
  );

  return (
    <div className="mt-3 border-t border-border-light pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-1 py-1 text-left transition-colors hover:bg-surface"
      >
        <ChevronDown
          size={14}
          strokeWidth={2.2}
          aria-hidden="true"
          className={cn(
            "shrink-0 transition-transform duration-200",
            open ? "text-blue-primary" : "-rotate-90 text-text-tertiary"
          )}
        />
        <ClipboardList size={13} strokeWidth={2.2} className="shrink-0 text-blue-primary" />
        <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
          The goals this group carries
        </span>
        <span className="rounded-full bg-surface px-1.5 py-0.5 text-[11px] font-bold text-text-tertiary tnum">
          {goals.length}
        </span>
        {waitingAll.length > 0 && (
          <span className="rounded-full bg-[rgba(180,83,9,0.10)] px-2 py-0.5 text-[11px] font-bold text-[color:#B45309] tnum">
            {waitingAll.length} to verify
          </span>
        )}
      </button>

      {open && (
        <div className="tab-panel mt-2 space-y-1.5">
          {goals.length === 0 ? (
            <p className="px-1 text-[12.5px] text-text-secondary">
              Nobody in {groupName} carries a goal yet. Assign one on the Goal
              Master and it appears here.
            </p>
          ) : (
            goals.map((goal) => {
              const isOpen = openGoal === goal.id;
              const target = goal.target || 0;
              const achieved = actualValue(scoped.actuals, goal, {
                rates: scoped.rates,
              });
              const pct =
                target > 0
                  ? Math.min(100, Math.round((achieved / target) * 100))
                  : 0;
              /* Who is on it, and what each of them has logged — the answer to
                 "how they're doing on the goals", per person rather than as
                 one group total. */
              const rows = members
                .map((person) => {
                  const theirs = scoped.actuals.filter(
                    (a) => a.goalId === goal.id && a.person === person
                  );
                  const assigned = (goal.assignments ?? []).find(
                    (x) => x.person.toLowerCase() === person.toLowerCase()
                  );
                  if (!theirs.length && !assigned) return null;
                  return {
                    person,
                    share: assigned?.target ?? 0,
                    done: actualValue(theirs, goal, { rates: scoped.rates }),
                    waiting: theirs.filter(isPending),
                  };
                })
                .filter((r): r is NonNullable<typeof r> => !!r);
              const goalWaiting = rows.reduce(
                (n, r) => n + r.waiting.length,
                0
              );

              return (
                <div
                  key={goal.id}
                  className="overflow-hidden rounded-lg border border-border-light bg-white"
                >
                  <button
                    type="button"
                    onClick={() => setOpenGoal(isOpen ? null : goal.id)}
                    aria-expanded={isOpen}
                    className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-surface"
                  >
                    <ChevronRight
                      size={13}
                      strokeWidth={2.3}
                      aria-hidden="true"
                      className={cn(
                        "shrink-0 text-text-tertiary transition-transform duration-200",
                        isOpen && "rotate-90 text-blue-primary"
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-text-primary">
                      {goal.name}
                    </span>
                    {target > 0 && (
                      <>
                        <span className="hidden h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-[rgba(0,113,227,0.10)] sm:flex">
                          <span
                            className="block h-full rounded-full bg-blue-primary"
                            style={{ width: `${pct}%` }}
                          />
                        </span>
                        <span className="shrink-0 whitespace-nowrap text-[11.5px] font-semibold text-text-secondary tnum">
                          {money(achieved, goal.unit)} of {money(target, goal.unit)}
                        </span>
                      </>
                    )}
                    {goalWaiting > 0 && (
                      <span className="shrink-0 rounded-full bg-[rgba(180,83,9,0.10)] px-2 py-0.5 text-[11px] font-bold text-[color:#B45309] tnum">
                        {goalWaiting} to verify
                      </span>
                    )}
                  </button>

                  {isOpen && (
                    <div className="tab-panel border-t border-border-light bg-surface/50 px-3 py-2.5">
                      {rows.length === 0 ? (
                        <p className="text-[12px] text-text-secondary">
                          Nobody in this group has logged against it yet.
                        </p>
                      ) : (
                        <div className="space-y-1.5">
                          {rows.map((r) => (
                            <div
                              key={r.person}
                              className="flex flex-wrap items-center gap-2 rounded-md bg-white px-2.5 py-1.5"
                            >
                              <Avatar
                                name={r.person}
                                className="h-6 w-6 shrink-0 text-[8px]"
                              />
                              <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-text-primary">
                                {r.person}
                              </span>
                              <span className="shrink-0 text-[11.5px] text-text-secondary tnum">
                                {money(r.done, goal.unit)}
                                {r.share > 0 && (
                                  <> of {money(r.share, goal.unit)}</>
                                )}
                              </span>
                              {r.waiting.length > 0 && (
                                <span className="shrink-0 rounded-full bg-[rgba(180,83,9,0.10)] px-2 py-0.5 text-[11px] font-bold text-[color:#B45309] tnum">
                                  {r.waiting.length} waiting on you
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {/* THE WAY TO ACTUALLY DO SOMETHING ABOUT IT. Reading
                          that a result is waiting and having nowhere to sign
                          it off is what made "1 to verify" a dead number. */}
                      <Link
                        href={`/performance/groups?group=${encodeURIComponent(groupId)}&goal=${encodeURIComponent(goal.id)}`}
                        className="mt-2.5 inline-flex items-center gap-1 rounded-md border border-border-light bg-white px-2.5 py-1.5 text-[12px] font-semibold text-blue-primary transition-colors hover:border-blue-subtle hover:bg-blue-light"
                      >
                        {goalWaiting > 0 ? (
                          <>
                            <ShieldCheck size={12} strokeWidth={2.3} />
                            Verify {goalWaiting} on Group performance
                          </>
                        ) : (
                          <>Open this goal on Group performance</>
                        )}
                        <ChevronRight size={12} strokeWidth={2.4} />
                      </Link>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
