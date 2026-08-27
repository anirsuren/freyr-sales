"use client";

import { useEffect, useState } from "react";
import { AreaChart, BarChart, LineChart, VIZ } from "@/components/charts/Charts";
import { ColorSelect } from "@/components/ui/ColorSelect";
import { AreaChart as AreaIcon, BarChart3, LineChart as LineIcon } from "lucide-react";

/**
 * ONE MONTH-BY-MONTH CHART, DRAWN THE WAY YOU WANT TO SEE IT.
 *
 * Anir, Aug 27: "there should be multiple ways to view this. I want a line
 * chart, and there should be options, like a dropdown, and you can choose
 * what type of graph you want to see."
 *
 * Money arriving over months is a TIME SERIES, and bars were the only way to
 * read it. Four months of an even spread drew four identical slabs — the
 * shape of the money was invisible because there was no shape to a bar chart
 * of equal values. A line says "flat" at a glance; an area says "how much,
 * accumulating"; bars stay for reading one month off the axis.
 *
 * The choice is remembered, because somebody who prefers lines prefers them
 * on every card, not once.
 */
export type AccrualChartKind = "bar" | "line" | "area";

const STORE_KEY = "freyr.accruals.chart";

export function useAccrualChartKind(): [AccrualChartKind, (k: AccrualChartKind) => void] {
  const [kind, setKind] = useState<AccrualChartKind>("bar");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORE_KEY);
      if (saved === "bar" || saved === "line" || saved === "area") setKind(saved);
    } catch {
      /* private mode: the default is fine */
    }
  }, []);
  return [
    kind,
    (k) => {
      setKind(k);
      try {
        localStorage.setItem(STORE_KEY, k);
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
      minWidth={124}
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
  months,
  amounts,
  height = 190,
}: {
  kind: AccrualChartKind;
  months: string[];
  amounts: number[];
  height?: number;
}) {
  if (kind === "line") {
    return (
      <LineChart
        height={height}
        format="money"
        xLabels={months}
        pointLabels={months}
        series={[{ label: "Planned", color: VIZ.blue, points: amounts }]}
      />
    );
  }
  if (kind === "area") {
    return (
      <AreaChart
        height={height}
        format="money"
        data={amounts}
        xLabels={months}
        color={VIZ.blue}
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
      data={months.map((label, i) => ({ label, value: amounts[i] ?? 0 }))}
    />
  );
}
