"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Maximize2, Minus, MoveHorizontal, Plus } from "lucide-react";
import { AreaChart, BarChart, DonutChart, DonutLegend } from "@/components/charts/Charts";
import { ExpandedChartModal, type ExpandedChartSpec } from "@/components/charts/ExpandedChartModal";
import { VIZ_SERIES } from "@/components/charts/palette";
import { PaceTimeline } from "@/components/performance/bits";
import { Modal } from "@/components/ui/Modal";

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

/** Without a period target, the rail describes recorded outcomes, never a
 * manufactured finish line. The same status colors and zoom gestures used by
 * the Goals timelines still apply. */
function UntargetedGoalRail({ goal, format, unit }: {
  goal: NonNullable<ChartSpec["goal"]>;
  format: ChartSpec["format"];
  unit?: string;
}) {
  const verified = goal.verified;
  const sentBack = goal.sentBack || 0;
  const waiting = Math.max(0, goal.pending - sentBack);
  const total = verified + waiting + sentBack;
  const target = goal.target && goal.target > 0 ? goal.target : null;
  const domain = Math.max(total, target || 0);
  const [view, setView] = useState({ zoom: 1, start: 0 });
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; start: number; pointerId: number } | null>(null);
  const clampStart = (start: number, zoom: number) => Math.min(Math.max(0, start), 1 - 1 / zoom);
  const updateZoom = useCallback((next: number, anchor = 0.5) => {
    setView((current) => {
      const zoom = Math.min(12, Math.max(1, next));
      return { zoom, start: clampStart(current.start + anchor / current.zoom - anchor / zoom, zoom) };
    });
  }, []);
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || domain === 0) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY) && !event.ctrlKey) {
        setView((current) => ({ ...current, start: clampStart(current.start + event.deltaX / Math.max(1, rect.width * current.zoom), current.zoom) }));
      } else {
        updateZoom(view.zoom * Math.exp(-event.deltaY * (event.ctrlKey ? 0.012 : 0.006)), Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)));
      }
    };
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [domain, updateZoom, view.zoom]);
  const parts = [
    { label: "Verified, counts now", value: verified, color: "var(--entry-verified)", striped: false },
    { label: "Sent back, needs a fix", value: sentBack, color: "var(--entry-sent-back)", striped: true },
    { label: "Waiting for verification", value: waiting, color: "var(--entry-waiting)", striped: true },
  ];
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-text-secondary">{exactValue(total, format, unit)} recorded · {target ? `${exactValue(target, format, unit)} target` : "no period target"}</span>
        {domain > 0 && <div className="flex items-center gap-2">
          <span className="hidden items-center gap-1 text-[10px] text-text-tertiary sm:flex"><MoveHorizontal size={12} /> Scroll to zoom · drag to move</span>
          <div className="flex items-center rounded-lg border border-border-light bg-white p-0.5 shadow-sm">
            <button type="button" aria-label="Zoom out goal progress" disabled={view.zoom <= 1.001} onClick={() => updateZoom(view.zoom / 1.6)} className="grid h-6 w-6 place-items-center rounded-md text-text-secondary hover:bg-surface disabled:opacity-35"><Minus size={12} /></button>
            <button type="button" aria-label="Reset goal progress zoom" onClick={() => setView({ zoom: 1, start: 0 })} className="min-w-9 rounded-md px-1 text-[10px] font-semibold text-text-secondary hover:bg-surface">{view.zoom <= 1.001 ? "Fit" : `${view.zoom.toFixed(1)}×`}</button>
            <button type="button" aria-label="Zoom in goal progress" disabled={view.zoom >= 11.999} onClick={() => updateZoom(view.zoom * 1.6)} className="grid h-6 w-6 place-items-center rounded-md text-text-secondary hover:bg-surface disabled:opacity-35"><Plus size={12} /></button>
          </div>
        </div>}
      </div>
      <div ref={viewportRef} className="select-none overflow-hidden rounded-lg py-3" style={{ touchAction: "pan-y", cursor: domain ? "grab" : undefined }}
        onPointerDown={(event) => {
          if (event.button !== 0 || view.zoom <= 1 || (event.target as HTMLElement).closest("button")) return;
          dragRef.current = { x: event.clientX, start: view.start, pointerId: event.pointerId };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          const width = Math.max(1, event.currentTarget.getBoundingClientRect().width);
          setView((current) => ({ ...current, start: clampStart(drag.start - (event.clientX - drag.x) / (width * current.zoom), current.zoom) }));
        }}
        onPointerUp={(event) => {
          if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => { dragRef.current = null; }}>
        <div className="relative h-3 rounded-full bg-surface" style={{ width: `${view.zoom * 100}%`, transform: `translateX(-${view.start * 100}%)` }} role="img" aria-label={`Verified ${exactValue(verified, format, unit)}, waiting ${exactValue(waiting, format, unit)}, sent back ${exactValue(sentBack, format, unit)}`}>
          <div className="flex h-full overflow-hidden rounded-full">
            {parts.map((part) => part.value > 0 && <span key={part.label} className={part.striped ? "unverified-fill h-full shrink-0" : "h-full shrink-0"} style={{ width: `${part.value / domain * 100}%`, background: part.striped ? undefined : part.color, ["--fill" as string]: part.color }} />)}
          </div>
          {total > 0 && <span className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-sm" style={{ left: `${total / domain * 100}%`, background: parts.findLast((part) => part.value > 0)?.color }} aria-hidden="true" />}
          {target && <span className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-text-tertiary bg-white" style={{ left: `${target / domain * 100}%` }} aria-hidden="true" />}
        </div>
      </div>
      <div className="grid gap-1.5 sm:grid-cols-3">
        {parts.map((part) => <div key={part.label} className="flex items-center gap-1.5 text-[11px] text-text-secondary"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: part.color }} /><span className="min-w-0 flex-1">{part.label}</span><strong className="tabular-nums text-text-primary">{exactValue(part.value, format, unit)}</strong></div>)}
      </div>
    </div>
  );
}

function GoalProgressChart({ spec, title }: { spec: ChartSpec; title: string }) {
  const goal = spec.goal!;
  const [expanded, setExpanded] = useState(false);
  const format = spec.format || "number";
  const hasTarget = goal.target != null && goal.target > 0;
  const content = (large: boolean) => hasTarget && (format !== "money" || !spec.unit || spec.unit === "USD") ? (
    <PaceTimeline title={title} verified={goal.verified} awaiting={goal.pending} sentBack={goal.sentBack || 0}
      target={goal.target!} expectedPct={0} unit={format === "money" ? "currency" : format === "percent" ? "percent" : "count"}
      compact={!large} interactive />
  ) : <UntargetedGoalRail goal={goal} format={format} unit={spec.unit} />;
  return <div className="my-2.5 rounded-xl border border-border-light bg-white px-4 py-3.5">
    <div className="mb-3 flex items-center justify-between gap-3"><p className="text-[12.5px] font-semibold text-text-primary">{title}</p>
      <button type="button" aria-label={`Expand ${title}`} onClick={() => setExpanded(true)} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border-light text-text-secondary hover:bg-surface"><Maximize2 size={14} /></button></div>
    {content(false)}
    <Modal open={expanded} onClose={() => setExpanded(false)} title={title} size="chart">
      <div className="p-5">{content(true)}</div>
    </Modal>
  </div>;
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
    return <GoalProgressChart spec={spec} title={title} />;
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
