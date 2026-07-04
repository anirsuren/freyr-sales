"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { BarChart } from "@/components/charts/Charts";
import { cn } from "@/lib/utils";
import { formatMoney, CURRENT_REP } from "@/lib/pipeline";

export type RepStat = {
  name: string;
  deals: number;
  openValue: number;
  winRate: number;
  stages: { stage: string; count: number }[];
};

const RANGES = [
  { k: "7d", l: "7D" },
  { k: "30d", l: "30D" },
  { k: "90d", l: "90D" },
  { k: "all", l: "All" },
];

export function RepAnalytics({
  reps,
  range,
}: {
  reps: RepStat[];
  range: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(reps[0]?.name || "");
  const active = reps.find((r) => r.name === selected) || reps[0];

  return (
    <Card>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h2 className="text-[17px] font-semibold text-text-primary">
          Rep performance
        </h2>
        <div className="flex items-center gap-1 bg-surface p-1 rounded-lg border border-border-light">
          {RANGES.map((r) => (
            <button
              key={r.k}
              onClick={() => router.push(`/analytics?range=${r.k}`, { scroll: false })}
              className={cn(
                "px-2.5 py-1 rounded-md text-[11px] font-semibold uppercase tracking-[0.05em] transition-colors",
                range === r.k
                  ? "bg-white shadow-card text-text-primary"
                  : "text-text-secondary hover:text-text-primary"
              )}
            >
              {r.l}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* leaderboard — click to drill in */}
        <div className="space-y-3 stagger">
          {reps.map((rep, i) => (
            <button
              key={rep.name}
              onClick={() => setSelected(rep.name)}
              aria-pressed={selected === rep.name}
              className={cn(
                "w-full flex items-center gap-4 rounded-lg p-2 -mx-2 text-left transition-colors",
                selected === rep.name ? "bg-blue-light" : "hover:bg-surface"
              )}
            >
              <span className="w-5 text-[13px] font-bold text-text-tertiary tnum text-center">
                {i + 1}
              </span>
              <Avatar name={rep.name} className="w-9 h-9 text-[13px]" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-3 mb-1">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span
                      className={cn(
                        "text-[14px] font-medium truncate",
                        selected === rep.name ? "text-blue-primary" : "text-text-primary"
                      )}
                    >
                      {rep.name}
                    </span>
                    {rep.name === CURRENT_REP && (
                      <span className="text-[10px] font-bold uppercase tracking-[0.04em] px-1.5 py-0.5 rounded bg-blue-light text-blue-primary shrink-0">
                        You
                      </span>
                    )}
                  </span>
                  <span className="text-[13px] text-text-secondary tnum shrink-0">
                    {formatMoney(rep.openValue)} · {rep.deals} deals · {rep.winRate}% win
                  </span>
                </div>
              </div>
            </button>
          ))}
          {reps.length === 0 && (
            <p className="text-[13px] text-text-secondary">
              No rep activity in this period.
            </p>
          )}
        </div>

        {/* drill-down for the selected rep */}
        {active && (
          <div className="rounded-xl border border-border-light p-4">
            <div className="flex items-center gap-2.5 mb-4">
              <Avatar name={active.name} className="w-10 h-10 text-[14px]" />
              <div>
                <p className="text-[14px] font-semibold text-text-primary">{active.name}</p>
                <p className="text-[12px] text-text-secondary">Selected rep</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {[
                { label: "Open", value: formatMoney(active.openValue) },
                { label: "Deals", value: String(active.deals) },
                { label: "Win", value: `${active.winRate}%` },
              ].map((s) => (
                <div key={s.label} className="bg-surface rounded-lg p-2.5 text-center">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
                    {s.label}
                  </p>
                  <p className="text-[16px] font-bold text-text-primary tnum mt-0.5">
                    {s.value}
                  </p>
                </div>
              ))}
            </div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-2">
              Deals by stage
            </p>
            <BarChart
              data={active.stages.map((st) => ({
                label: st.stage,
                value: st.count,
              }))}
              height={120}
            />
          </div>
        )}
      </div>
    </Card>
  );
}
