"use client";

import { useId } from "react";
import { AreaChart, BarChart, DonutChart, DonutLegend } from "@/components/charts/Charts";
import { ExpandedChartModal, type ExpandedChartSpec } from "@/components/charts/ExpandedChartModal";
import { VIZ_SERIES } from "@/components/charts/palette";

type ChartSpec = {
  type: "bar" | "donut" | "area";
  title?: string;
  unit?: string;
  format?: "money" | "number" | "percent";
  data: { label: string; value: number; color?: string }[];
  center?: { label: string; sub?: string };
};

/** Parse a ```chart fenced block. Returns null on anything malformed — a chat
 * message must never crash on a bad spec, it just renders without the chart. */
export function parseChartSpec(raw: string): ChartSpec | null {
  try {
    const spec = JSON.parse(raw) as ChartSpec;
    if (!spec || !Array.isArray(spec.data) || spec.data.length === 0) return null;
    if (spec.type !== "bar" && spec.type !== "donut" && spec.type !== "area") return null;
    if (!spec.data.every((d) => typeof d.label === "string" && Number.isFinite(d.value)))
      return null;
    return spec;
  } catch {
    return null;
  }
}

// A chart IN the conversation — the same polished components every page uses
// (animated, portal-tooltipped, unit-labelled), not a hand-rolled sketch
// (Anir, Jul 25: "really good visualizations, not vibe-coded slop"). The
// agent emits a small JSON spec; anything malformed renders as nothing.
export function ChatChart({ spec }: { spec: ChartSpec }) {
  // Chart + legend hover in lockstep, same as every donut pair in the app.
  const donutSync = useId();
  const series = spec.data.map((d, i) => ({
    label: d.label,
    value: d.value,
    color: d.color || VIZ_SERIES[i % VIZ_SERIES.length],
  }));
  const total = series.reduce((sum, d) => sum + d.value, 0);
  const title = spec.title?.trim() || "Agent chart";
  const expandedChart: ExpandedChartSpec =
    spec.type === "bar"
      ? {
          kind: "bar",
          data: series,
          format: spec.format || "number",
          unit: spec.unit,
        }
      : spec.type === "donut"
        ? {
            kind: "donut",
            segments: series,
            centerLabel: spec.center?.label ?? String(total),
            centerSub: spec.center?.sub,
            format: spec.format || "number",
          }
        : {
            kind: "area",
            label: title,
            color: series[0]?.color || VIZ_SERIES[0],
            data: series.map((d) => d.value),
            format: spec.format || "number",
            unit: spec.unit,
            xLabels: series.map((d) => d.label),
          };
  return (
    <div className="my-2.5 rounded-xl border border-border-light bg-white px-4 py-3.5">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <p className="min-w-0 text-[12.5px] font-semibold text-text-primary">
          {title}
        </p>
        <ExpandedChartModal
          title={title}
          subtitle="Chart generated from this agent response."
          chart={expandedChart}
          className="h-8 px-2.5 text-[11px]"
        />
      </div>
      {spec.type === "bar" && (
        <BarChart data={series} height={170} format={spec.format || "number"} unit={spec.unit} />
      )}
      {spec.type === "donut" && (
        <div className="flex items-center gap-5">
          <DonutChart
            syncId={donutSync}
            segments={series}
            size={124}
            thickness={14}
            centerLabel={spec.center?.label ?? String(total)}
            centerSub={spec.center?.sub}
          />
          <DonutLegend items={series} total={total} syncId={donutSync} />
        </div>
      )}
      {spec.type === "area" && (
        <AreaChart
          data={series.map((d) => d.value)}
          height={150}
          format={spec.format || "number"}
          unit={spec.unit}
          xLabels={series.map((d) => d.label)}
          className="w-full"
        />
      )}
    </div>
  );
}

