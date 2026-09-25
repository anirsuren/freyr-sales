"use client";

import { useId } from "react";
import { AreaChart, BarChart, DonutChart, DonutLegend } from "@/components/charts/Charts";
import { ExpandedChartModal, type ExpandedChartSpec } from "@/components/charts/ExpandedChartModal";
import { VIZ_SERIES } from "@/components/charts/palette";
import { PaceTimeline } from "@/components/performance/bits";

type ChartSpec = {
  type: "bar" | "donut" | "area" | "goal-progress";
  title?: string;
  unit?: string;
  format?: "money" | "number" | "percent";
  data: { label: string; value: number; color?: string }[];
  center?: { label: string; sub?: string };
  goal?: { verified: number; pending: number; sentBack?: number; target?: number | null };
};

function exactValue(value: number, format: ChartSpec["format"], unit?: string) {
  if (format === "money")
    return new Intl.NumberFormat("en-US", { style: "currency", currency: unit && /^[A-Z]{3}$/.test(unit) ? unit : "USD", maximumFractionDigits: 2 }).format(value);
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value) + (format === "percent" ? "%" : "");
}

/** Parse a ```chart fenced block. Returns null on anything malformed — a chat
 * message must never crash on a bad spec, it just renders without the chart. */
export function parseChartSpec(raw: string): ChartSpec | null {
  try {
    const spec = JSON.parse(raw) as ChartSpec;
    if (!spec) return null;
    if (spec.type === "goal-progress") {
      const goal = spec.goal;
      if (!goal || !Number.isFinite(goal.verified) || !Number.isFinite(goal.pending) ||
        goal.verified < 0 || goal.pending < 0 ||
        (goal.target != null && (!Number.isFinite(goal.target) || goal.target < 0)) ||
        (goal.sentBack != null && (!Number.isFinite(goal.sentBack) || goal.sentBack < 0 || goal.sentBack > goal.pending))) return null;
      return spec;
    }
    if (!Array.isArray(spec.data) || spec.data.length === 0) return null;
    if (spec.type !== "bar" && spec.type !== "donut" && spec.type !== "area") return null;
    if (!spec.data.every((d) => typeof d.label === "string" && Number.isFinite(d.value)))
      return null;
    const labels = spec.data.map((d) => d.label.toLowerCase());
    if ((spec.type === "bar" || spec.type === "donut") &&
      labels.some((label) => /target|goal/.test(label)) &&
      labels.some((label) => /verified|pending|sent.back|completed/.test(label))) return null;
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
  const series = (spec.data || []).map((d, i) => ({
    label: d.label,
    value: d.value,
    color: d.color || VIZ_SERIES[i % VIZ_SERIES.length],
  }));
  const total = series.reduce((sum, d) => sum + d.value, 0);
  const title = spec.title?.trim() || "Agent chart";
  // Shared chart defaults abbreviate money with a dollar sign. For other
  // currencies, keep the amount and ISO code instead of silently relabelling.
  const chartFormat = spec.format === "money" && spec.unit && spec.unit !== "USD" ? "number" : spec.format || "number";
  const chartUnit = spec.unit;
  if (spec.type === "goal-progress" && spec.goal) {
    const { verified, pending, sentBack = 0, target } = spec.goal;
    const format = spec.format || "number";
    return (
      <div className="my-2.5 rounded-xl border border-border-light bg-white px-4 py-3.5">
        <p className="mb-3 text-[12.5px] font-semibold text-text-primary">{title}</p>
        {target != null && target > 0 && (format !== "money" || !spec.unit || spec.unit === "USD") ? (
          <>
            <PaceTimeline title={title} verified={verified} awaiting={pending} sentBack={sentBack}
              target={target} expectedPct={0} unit={format === "money" ? "currency" : format === "percent" ? "percent" : "count"} compact />
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-text-secondary">
              <span>Verified: {exactValue(verified, format, spec.unit)}</span>
              <span>Target: {exactValue(target, format, spec.unit)}</span>
              <span>Waiting: {exactValue(Math.max(0, pending - sentBack), format, spec.unit)}</span>
              {sentBack > 0 && <span>Sent back: {exactValue(sentBack, format, spec.unit)}</span>}
            </div>
          </>
        ) : target != null && target > 0 ? (
          <div className="space-y-2 text-xs text-text-secondary">
            <div className="flex justify-between gap-3"><span>Verified: {exactValue(verified, format, spec.unit)}</span><span>Target: {exactValue(target, format, spec.unit)}</span></div>
            <div className="flex h-3 overflow-hidden rounded-full bg-surface" role="img" aria-label={`Verified ${exactValue(verified, format, spec.unit)} of ${exactValue(target, format, spec.unit)} target`}>
              <span style={{ width: `${Math.min(100, verified / target * 100)}%`, background: "var(--entry-verified)" }} />
            </div>
            <div>Waiting: {exactValue(Math.max(0, pending - sentBack), format, spec.unit)}{sentBack > 0 ? ` · Sent back: ${exactValue(sentBack, format, spec.unit)}` : ""}</div>
          </div>
        ) : (
          <div className="space-y-2.5 text-sm text-text-secondary">
            {format !== "percent" && verified + pending > 0 && (
              <div>
                <p className="mb-1.5 text-xs">Share of recorded activity</p>
                <div className="flex h-3 overflow-hidden rounded-full bg-surface" role="img" aria-label={`Verified ${exactValue(verified, format, spec.unit)}, waiting ${exactValue(pending - sentBack, format, spec.unit)}, sent back ${exactValue(sentBack, format, spec.unit)}`}>
                  <span style={{ width: `${verified / (verified + pending) * 100}%`, background: "var(--entry-verified)" }} />
                  <span style={{ width: `${(pending - sentBack) / (verified + pending) * 100}%`, background: "var(--entry-waiting)" }} />
                  <span style={{ width: `${sentBack / (verified + pending) * 100}%`, background: "var(--entry-sent-back)" }} />
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <span>Verified: {exactValue(verified, format, spec.unit)}</span>
              <span>Waiting: {exactValue(Math.max(0, pending - sentBack), format, spec.unit)}</span>
              {sentBack > 0 && <span>Sent back: {exactValue(sentBack, format, spec.unit)}</span>}
            </div>
            <p className="text-xs">Target not set for this period</p>
          </div>
        )}
      </div>
    );
  }
  const expandedChart: ExpandedChartSpec =
    spec.type === "bar"
      ? {
          kind: "bar",
          data: series,
          format: chartFormat,
          unit: chartUnit,
        }
      : spec.type === "donut"
        ? {
            kind: "donut",
            segments: series,
            centerLabel: spec.center?.label ?? exactValue(total, spec.format, spec.unit),
            centerSub: spec.center?.sub,
            format: chartFormat,
          }
        : {
            kind: "area",
            label: title,
            color: series[0]?.color || VIZ_SERIES[0],
            data: series.map((d) => d.value),
            format: chartFormat,
            unit: chartUnit,
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
        <BarChart data={series} height={170} format={chartFormat} unit={chartUnit} />
      )}
      {spec.type === "donut" && (
        <div className="flex items-center gap-5">
          <DonutChart
            syncId={donutSync}
            segments={series}
            size={124}
            thickness={14}
            centerLabel={spec.center?.label ?? exactValue(total, spec.format, spec.unit)}
            centerSub={spec.center?.sub}
          />
          <DonutLegend items={series} total={total} syncId={donutSync} format={spec.format === "money" ? (value) => exactValue(value, "money", spec.unit) : chartFormat} />
        </div>
      )}
      {spec.type === "area" && (
        <AreaChart
          data={series.map((d) => d.value)}
          height={150}
          format={chartFormat}
          unit={chartUnit}
          xLabels={series.map((d) => d.label)}
          className="w-full"
        />
      )}
    </div>
  );
}
