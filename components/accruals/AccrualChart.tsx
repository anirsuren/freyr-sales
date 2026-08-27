"use client";

import { useEffect, useState } from "react";
import {
  AreaChart,
  BarChart,
  LineChart,
  VIZ,
  type TipItem,
} from "@/components/charts/Charts";
import { ColorSelect } from "@/components/ui/ColorSelect";
import { AreaChart as AreaIcon, BarChart3, LineChart as LineIcon } from "lucide-react";

/**
 * ONE MONTH-BY-MONTH CHART, DRAWN THE WAY YOU WANT TO SEE IT.
 *
 * Anir, Aug 27: "there should be multiple ways to view this. I want a line
 * chart, and there should be options, like a dropdown, and you can choose
 * what type of graph you want to see." And then, on the first cut, which put
 * ONE dropdown on the page: "No, I meant for each company."
 *
 * So the choice lives PER CARD. Every plan card carries its own picker, and
 * the page summary has one of its own — each remembered separately, because
 * the reason to flip one card to a line ("is Haleon's plan flat?") is not a
 * reason to redraw every other card. One localStorage map holds all of them.
 */
export type AccrualChartKind = "bar" | "line" | "area";

const STORE_KEY = "freyr.accruals.charts";
/** The pre-"for each company" single choice; folded in as the page default. */
const OLD_KEY = "freyr.accruals.chart";

function isKind(v: unknown): v is AccrualChartKind {
  return v === "bar" || v === "line" || v === "area";
}

export function useAccrualChartKinds(): [
  (id: string) => AccrualChartKind,
  (id: string, kind: AccrualChartKind) => void,
] {
  const [kinds, setKinds] = useState<Record<string, AccrualChartKind>>({});
  useEffect(() => {
    try {
      const map: Record<string, AccrualChartKind> = {};
      const old = localStorage.getItem(OLD_KEY);
      if (isKind(old)) map.page = old;
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}");
      for (const [k, v] of Object.entries(saved)) if (isKind(v)) map[k] = v;
      setKinds(map);
    } catch {
      /* private mode or garbage: bars everywhere is a fine place to start */
    }
  }, []);
  return [
    (id) => kinds[id] ?? "bar",
    (id, kind) => {
      const next = { ...kinds, [id]: kind };
      setKinds(next);
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(next));
      } catch {
        /* nothing to remember it with; the choice still holds for this visit */
      }
    },
  ];
}

export function AccrualChartPicker({
  value,
  onChange,
}: {
  value: AccrualChartKind;
  onChange: (k: AccrualChartKind) => void;
}) {
  return (
    <ColorSelect
      value={value}
      ariaLabel="Chart type"
      collapsible={false}
      dense
      minWidth={112}
      onChange={(v) => onChange(v as AccrualChartKind)}
      options={[
        { value: "bar", label: "Bars", color: VIZ.blue, icon: BarChart3 },
        { value: "line", label: "Line", color: VIZ.blue, icon: LineIcon },
        { value: "area", label: "Area", color: VIZ.blue, icon: AreaIcon },
      ]}
    />
  );
}

export function AccrualChart({
  kind,
  data,
  height = 190,
  color = VIZ.blue,
  series,
}: {
  kind: AccrualChartKind;
  /** The full month rows — per-bar colour (past months wear amber) and the
      hover tips ride through untouched in bar mode. */
  data: { label: string; value: number; color?: string; pending?: number; tip?: TipItem[] }[];
  height?: number;
  /** The card's accent — line and area draw in it, bars default to it. */
  color?: string;
  /** Line mode only: one line per company on the page summary. When absent,
      the single planned-money line is drawn in `color`. */
  series?: { label: string; color: string; points: number[] }[];
}) {
  const labels = data.map((d) => d.label);
  if (kind === "line") {
    return (
      <LineChart
        height={height}
        format="money"
        xLabels={labels}
        pointLabels={labels}
        series={
          series ?? [{ label: "Planned", color, points: data.map((d) => d.value) }]
        }
      />
    );
  }
  if (kind === "area") {
    return (
      <AreaChart
        height={height}
        format="money"
        data={data.map((d) => d.value)}
        xLabels={labels}
        color={color}
      />
    );
  }
  return (
    <BarChart
      hideLabelDots
      height={height}
      format="money"
      /* 56, not the 88 default: a four-month plan across a full-width card hit
         the cap on every column and drew billboards. */
      maxBarWidth={56}
      data={data.map((d) => ({ ...d, color: d.color ?? color }))}
    />
  );
}
