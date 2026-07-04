"use client";

import { useState } from "react";
import { LineChart, VIZ } from "@/components/charts/Charts";
import { cn } from "@/lib/utils";

// Engagement over time with metric toggles (Anir, Jul 4: "line graphs…
// there should be a lot of customization"). Series are computed server-side
// and passed in; the rep picks which lines to watch.
const SERIES_META = [
  { key: "sent", label: "Sent", color: VIZ.blue },
  { key: "opened", label: "Opened", color: VIZ.green },
  { key: "replied", label: "Replied", color: VIZ.indigo },
] as const;

export function EngagementChart({
  days,
  sent,
  opened,
  replied,
}: {
  days: string[]; // x labels (subset shown)
  sent: number[];
  opened: number[];
  replied: number[];
}) {
  const [on, setOn] = useState<Record<string, boolean>>({
    sent: true,
    opened: true,
    replied: true,
  });
  const data: Record<string, number[]> = { sent, opened, replied };
  const active = SERIES_META.filter((s) => on[s.key]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        {SERIES_META.map((s) => (
          <button
            key={s.key}
            onClick={() => setOn((prev) => ({ ...prev, [s.key]: !prev[s.key] }))}
            aria-pressed={on[s.key]}
            className={cn(
              "inline-flex items-center gap-1.5 text-[12px] font-semibold rounded-full px-2.5 py-1 border transition-colors",
              on[s.key]
                ? "border-transparent text-white"
                : "border-border-light text-text-tertiary bg-white hover:text-text-secondary"
            )}
            style={on[s.key] ? { background: s.color } : undefined}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: on[s.key] ? "rgba(255,255,255,0.85)" : s.color }}
            />
            {s.label}
          </button>
        ))}
      </div>
      {active.length === 0 ? (
        <p className="text-[13px] text-text-tertiary py-10 text-center">
          Pick at least one metric to chart.
        </p>
      ) : (
        <LineChart
          series={active.map((s) => ({
            label: s.label,
            color: s.color,
            points: data[s.key],
          }))}
          xLabels={days}
          height={170}
        />
      )}
    </div>
  );
}
