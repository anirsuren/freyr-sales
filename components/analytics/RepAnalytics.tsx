"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";
import { formatMoney, CURRENT_REP } from "@/lib/pipeline";

export type RepStat = {
  name: string;
  deals: number;
  openCount: number;
  openValue: number;
  weighted: number;
  avgDeal: number;
  qualifiedPlus: number;
  meetings: number;
  stageValues: { stage: string; color: string; count: number; value: number }[];
};

const RANGES = [
  { k: "7d", l: "7D" },
  { k: "30d", l: "30D" },
  { k: "90d", l: "90D" },
  { k: "all", l: "All" },
];

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function RepAnalytics({
  reps,
  range,
}: {
  reps: RepStat[];
  range: string;
}) {
  const router = useRouter();

  return (
    <Card>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h2 className="text-[17px] font-semibold text-text-primary">
            Rep performance
          </h2>
          <p className="text-[12.5px] text-text-tertiary mt-0.5">
            Open pipeline, weighted value and stage mix per teammate — ranked by
            pipeline. Click a rep for the full breakdown.
          </p>
        </div>
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

      {reps.length === 0 ? (
        <p className="text-[13px] text-text-secondary py-4">
          No rep activity in this period.
        </p>
      ) : (
        <div className="space-y-2 stagger">
          {reps.map((rep, i) => {
            const total = rep.openValue || 1;
            return (
              <Link
                key={rep.name}
                href={`/analytics/reps/${slugify(rep.name)}`}
                className="group flex items-center gap-4 rounded-xl p-4 border border-transparent hover:border-blue-subtle hover:bg-surface transition-colors"
              >
                <span className="w-5 text-[15px] font-bold text-text-tertiary tnum text-center shrink-0">
                  {i + 1}
                </span>
                <Avatar name={rep.name} className="w-11 h-11 text-[14px] shrink-0" />

                {/* Middle — identity + the composition graph, at a glance */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[14.5px] font-semibold text-text-primary truncate group-hover:text-blue-primary">
                      {rep.name}
                    </span>
                    {rep.name === CURRENT_REP && (
                      <span className="text-[10px] font-bold uppercase tracking-[0.04em] px-1.5 py-0.5 rounded bg-blue-light text-blue-primary shrink-0">
                        You
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] text-text-tertiary tnum mt-0.5">
                    {rep.openCount} open deal{rep.openCount === 1 ? "" : "s"} ·{" "}
                    {formatMoney(rep.weighted)} weighted · {formatMoney(rep.avgDeal)} avg
                  </p>

                  {/* Stacked pipeline-by-stage bar (value) */}
                  <div className="mt-2 h-2.5 rounded-full bg-surface overflow-hidden flex max-w-[440px]">
                    {rep.stageValues
                      .filter((s) => s.value > 0)
                      .map((s) => (
                        <div
                          key={s.stage}
                          style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
                          title={`${s.stage}: ${formatMoney(s.value)} (${s.count})`}
                        />
                      ))}
                  </div>
                  {/* Legend — the stages behind the bar */}
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                    {rep.stageValues.map((s) => (
                      <span
                        key={s.stage}
                        className="inline-flex items-center gap-1.5 text-[11px] text-text-tertiary"
                      >
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ background: s.color }}
                        />
                        {s.stage}
                        <span className="font-semibold text-text-secondary tnum">
                          {s.count}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Right — the headline numbers */}
                <div className="text-right shrink-0 hidden sm:block">
                  <p className="text-[19px] font-bold text-text-primary tnum leading-none">
                    {formatMoney(rep.openValue)}
                  </p>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-text-tertiary mt-1">
                    open pipeline
                  </p>
                  <p className="text-[11.5px] text-text-tertiary tnum mt-1.5">
                    {rep.qualifiedPlus} qualified+ · {rep.meetings} meeting
                    {rep.meetings === 1 ? "" : "s"}
                  </p>
                </div>
                <ChevronRight
                  size={17}
                  strokeWidth={2}
                  className="text-text-tertiary group-hover:text-blue-primary group-hover:translate-x-0.5 transition-transform shrink-0"
                />
              </Link>
            );
          })}
        </div>
      )}
    </Card>
  );
}
