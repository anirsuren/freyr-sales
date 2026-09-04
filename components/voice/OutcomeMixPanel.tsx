"use client";

import {
  DonutChart,
  donutSyncBroadcast,
  useDonutSync,
  type TipItem,
} from "@/components/charts/Charts";
import { Avatar } from "@/components/ui/Avatar";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { HoverCard } from "@/components/ui/HoverCard";
import { OutcomeBadge } from "@/components/ui/Badge";
import { cn, OUTCOME_META } from "@/lib/utils";
import { tint } from "@/lib/tint";

export type OutcomeSlice = {
  /** OUTCOME_META key — the colour + icon come from the app's own outcome map. */
  key: string;
  label: string;
  value: number;
  /** Bright chart fill (the badge colour is deliberately darker — it's text). */
  color: string;
  tip: TipItem[];
};

export type OutcomeDay = {
  /** Short axis label ("7/21"). */
  key: string;
  /** Full label for the tooltip ("Mon, Jul 21"). */
  label: string;
  total: number;
  /** Outcome slices of this day's column, in the same order + colours as the
   *  legend above, so the chart needs no legend of its own. */
  stack: { key: string; label: string; color: string; value: number }[];
  people: { id: string; name: string; company: string; outcome: string }[];
};

/**
 * "How calls ended" — the donut, a legend whose every row carries the outcome's
 * own colour + icon and a share bar right after the number, and a second real
 * chart underneath (Suren, Jul 27: "you know how you do that thing where you
 * have the horizontal bar signifying the percentage right after the number? I
 * would add that and then just put some other graph below"). The donut itself is
 * untouched — same size, same segments, same tooltips.
 */
export function OutcomeMixPanel({
  segments,
  totalCalls,
  days,
  syncId,
}: {
  segments: OutcomeSlice[];
  totalCalls: number;
  days: OutcomeDay[];
  syncId: string;
}) {
  const lit = useDonutSync(syncId);
  const sum = segments.reduce((s, x) => s + x.value, 0) || 1;
  const dayMax = Math.max(...days.map((d) => d.total), 1);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-3">
        <div className="relative shrink-0" style={{ width: 120, height: 120 }}>
          <DonutChart
            segments={segments}
            size={120}
            thickness={12}
            centerLabel={String(totalCalls)}
            centerSub="calls"
            syncId={syncId}
          />
        </div>
        {/* One shared grid so every share bar starts at the same x. */}
        <div className="grid min-w-[168px] flex-1 grid-cols-[18px_minmax(0,auto)_auto_auto_minmax(36px,1fr)] items-center gap-x-2 gap-y-0.5">
          {segments.map((segment, i) => {
            const meta = OUTCOME_META[segment.key];
            const Icon = meta?.icon;
            const pct = Math.round((segment.value / sum) * 100);
            return (
              <div
                key={segment.key}
                onMouseEnter={() => donutSyncBroadcast(syncId, i)}
                onMouseLeave={() => donutSyncBroadcast(syncId, null)}
                className={cn(
                  "col-span-full grid cursor-pointer grid-cols-subgrid items-center rounded-md px-1 py-[3px] transition-all duration-150",
                  lit === i && "scale-[1.015] shadow-[0_2px_10px_rgba(0,0,0,0.07)]"
                )}
                style={
                  lit === i
                    ? {
                        background: tint(segment.color, 12),
                        boxShadow: `inset 0 0 0 1px ${tint(segment.color, 35)}`,
                      }
                    : undefined
                }
              >
                <span
                  className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md"
                  style={{ color: segment.color, background: tint(segment.color, 14) }}
                  aria-hidden="true"
                >
                  {Icon && <Icon size={12} strokeWidth={2.2} />}
                </span>
                {/* Never truncated — long outcome names wrap at spaces. */}
                <span className="min-w-0 break-normal text-[12.5px] text-text-secondary">
                  {segment.label}
                </span>
                <span className="justify-self-end text-[12.5px] font-semibold text-text-primary tnum">
                  {segment.value}
                </span>
                <span className="justify-self-end text-[11px] text-text-tertiary tnum">
                  {pct}%
                </span>
                <span className="h-1.5 w-full overflow-hidden rounded-full bg-surface">
                  <span
                    className="block h-full rounded-full transition-all"
                    style={{
                      width: `${Math.max(pct, 3)}%`,
                      background: segment.color,
                    }}
                  />
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Second chart — the SAME outcomes, day by day, in the same colours as
          the legend above, so it needs no legend of its own. */}
      <div className="mt-4 flex min-h-0 flex-1 flex-col">
        <p className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
            How they ended, day by day, last 7 days
          </span>
          <span className="text-[10px] text-text-tertiary">calls</span>
        </p>
        <div data-reach-plot className="flex min-h-[64px] flex-1 items-stretch gap-1.5">
          {days.map((day) => {
            const total = day.total;
            const pct = (total / dayMax) * 100;
            return (
              <div key={day.key} className="flex min-w-0 flex-1 flex-col">
                <div className="relative w-full flex-1">
                  {/* Zero-call days keep an honest empty slot, not a fake bar. */}
                  <span className="absolute inset-x-0 bottom-0 h-[3px] rounded-full bg-surface" />
                  {total > 0 && (
                    <div
                      className="absolute inset-x-0 bottom-0"
                      style={{ height: `${Math.max(pct, 6)}%` }}
                    >
                      <HoverCard
                        side="top"
                        width={250}
                        delayMs={0}
                        clearAncestor="[data-reach-plot]"
                        className="flex h-full w-full cursor-pointer flex-col justify-end overflow-hidden rounded-t-[4px] transition-transform hover:-translate-y-0.5"
                        content={
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                              {day.label}
                            </p>
                            <p className="mt-0.5 text-[15px] font-bold text-text-primary tnum">
                              {total} {total === 1 ? "call" : "calls"}
                            </p>
                            <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 rounded-md bg-surface px-2.5 py-2 text-[11px]">
                              {day.stack
                                .filter((part) => part.value > 0)
                                .map((part) => (
                                  <span key={part.key} className="contents">
                                    <span className="flex items-center gap-1.5 text-text-tertiary">
                                      <span
                                        className="h-2 w-2 shrink-0 rounded-full"
                                        style={{ background: part.color }}
                                      />
                                      {part.label}
                                    </span>
                                    <span className="text-right font-semibold text-text-primary tnum">
                                      {part.value}
                                    </span>
                                  </span>
                                ))}
                            </div>
                            {day.people.length > 0 && (
                              <div className="mt-2.5 space-y-1.5 border-t border-border-light pt-2.5">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
                                  Who was called
                                </p>
                                {day.people.slice(0, 5).map((person) => (
                                  <div
                                    key={person.id}
                                    className="flex items-center gap-2 text-[12px]"
                                  >
                                    <Avatar
                                      name={person.name}
                                      className="h-6 w-6 shrink-0 text-[8px]"
                                    />
                                    <span className="min-w-0 flex-1 leading-tight">
                                      <span className="block font-medium text-text-primary">
                                        {person.name}
                                      </span>
                                      <span className="flex items-center gap-1 text-[10.5px] text-text-tertiary">
                                        <CompanyLogo
                                          name={person.company}
                                          className="h-[14px] w-[14px] shrink-0 text-[6px]"
                                        />
                                        {person.company}
                                      </span>
                                    </span>
                                    <OutcomeBadge outcome={person.outcome} />
                                  </div>
                                ))}
                                {day.people.length > 5 && (
                                  <p className="text-[10.5px] text-text-tertiary">
                                    +{day.people.length - 5} more
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        }
                      >
                        {day.stack
                          .filter((part) => part.value > 0)
                          .map((part) => (
                            <span
                              key={part.key}
                              className="w-full shrink-0"
                              style={{
                                height: `${(part.value / total) * 100}%`,
                                background: part.color,
                              }}
                            />
                          ))}
                      </HoverCard>
                    </div>
                  )}
                </div>
                <span className="mt-1 text-center text-[9.5px] leading-tight text-text-tertiary tnum">
                  {day.key}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
