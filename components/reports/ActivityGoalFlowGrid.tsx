"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { typeMeta } from "@/components/performance/bits";
import { fmtAmount, type GoalUnit } from "@/lib/performanceShared";

/**
 * ACTIVITIES × GOALS, GLOWING BY REAL MONEY (Anir, Aug 17: the heat-map
 * version of the Activity Master — "how much of the goal is filled… how much
 * each activity actually pushed into each goal"). Every cell is the sum of
 * results stamped with that activity, landing on that goal. Intensity scales
 * against the biggest cell on the board, so the hottest flow reads first.
 */
export function ActivityGoalFlowGrid({
  goals,
  cells,
}: {
  goals: { id: string; name: string; unit: string; type: string }[];
  cells: {
    activity: { id: string; label: string; color: string };
    goals: { goalId: string; amount: number; entries: number; display: string }[];
  }[];
}) {
  const [hover, setHover] = useState<string | null>(null);
  const active = cells.filter((c) => c.goals.some((g) => g.entries > 0));
  const max = Math.max(
    1,
    ...active.flatMap((c) => c.goals.map((g) => g.amount))
  );
  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] table-fixed border-collapse text-left">
          <thead>
            <tr className="border-b border-border-light text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
              <th className="w-[240px] px-4 py-2.5">Goal</th>
              {active.map((c) => (
                <th key={c.activity.id} className="border-l border-border-light px-3 py-2.5">
                  <span
                    className="inline-flex items-center rounded-lg px-2 py-1 text-[12px] font-semibold normal-case tracking-normal"
                    style={{ background: `${c.activity.color}16`, color: c.activity.color }}
                  >
                    {c.activity.label}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border-light">
            {goals.map((g) => {
              const t = typeMeta(g.type);
              return (
                <tr key={g.id}>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2 text-[12.5px] font-semibold text-text-primary">
                      <t.icon
                        size={13}
                        strokeWidth={2.4}
                        aria-hidden="true"
                        style={{ color: t.color }}
                        className="shrink-0"
                      />
                      <span className="min-w-0 whitespace-normal leading-snug">{g.name}</span>
                    </span>
                  </td>
                  {active.map((c) => {
                    const cell = c.goals.find((x) => x.goalId === g.id);
                    const amount = cell?.amount ?? 0;
                    const key = `${c.activity.id}:${g.id}`;
                    const heat = amount > 0 ? 0.12 + 0.55 * (amount / max) : 0;
                    return (
                      <td
                        key={key}
                        onMouseEnter={() => setHover(key)}
                        onMouseLeave={() => setHover(null)}
                        title={
                          amount > 0
                            ? `${cell!.entries} ${cell!.entries === 1 ? "result" : "results"} · ${fmtAmount(g.unit as GoalUnit, amount)} from ${c.activity.label} into ${g.name}`
                            : undefined
                        }
                        className="border-l border-border-light px-3 py-3 transition-[box-shadow]"
                        style={{
                          background:
                            amount > 0
                              ? `${c.activity.color}${Math.round(heat * 255)
                                  .toString(16)
                                  .padStart(2, "0")}`
                              : undefined,
                          boxShadow:
                            hover === key && amount > 0
                              ? `inset 0 0 0 2px ${c.activity.color}`
                              : undefined,
                        }}
                      >
                        {amount > 0 ? (
                          <span className="text-[12.5px] font-bold text-text-primary tnum">
                            {fmtAmount(g.unit as GoalUnit, amount)}
                          </span>
                        ) : (
                          <span className="text-[11px] text-text-tertiary">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
