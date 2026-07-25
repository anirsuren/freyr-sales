"use client";

import type { ComponentProps } from "react";
import { useId } from "react";
import {
  AreaChart,
  BarChart,
  DonutChart,
  DonutLegend,
} from "@/components/charts/Charts";
import { Card } from "@/components/ui/Card";
import {
  ExpandableChart,
  type ChartDetailRow,
} from "@/components/charts/ExpandableChart";

type BarProps = ComponentProps<typeof BarChart>;
type DonutProps = ComponentProps<typeof DonutChart>;
type AreaProps = ComponentProps<typeof AreaChart>;
type LegendProps = ComponentProps<typeof DonutLegend>;

/**
 * A chart card that opens into a full-size popup.
 *
 * The analytics pages are server components, and ExpandableChart takes a render
 * function — which cannot cross the server→client boundary (same rule as the
 * `format` prop being a string kind, never a function). So the server page
 * hands this client card plain serializable data, and the card decides how to
 * draw it at each size: the modal chart is genuinely re-rendered larger — an
 * SVG redrawn at size stays sharp and earns room for labels — not a scaled-up
 * copy of the small one.
 */
export function ExpandableChartCard({
  title,
  subtitle,
  kind,
  bar,
  donut,
  legend,
  area,
  rows,
  footnote,
  emptyText,
  className,
}: {
  title: string;
  subtitle?: string;
  kind: "bar" | "donut" | "area";
  bar?: Omit<BarProps, "height">;
  donut?: Omit<DonutProps, "size" | "thickness">;
  /** Legend beside the donut (card and modal both show it). */
  legend?: LegendProps;
  area?: Omit<AreaProps, "height" | "className">;
  rows?: ChartDetailRow[];
  footnote?: string;
  /** Rendered instead of the chart when there is nothing to draw. */
  emptyText?: string;
  className?: string;
}) {
  // Links this card's donut to its legend so hovers travel both ways.
  const donutSync = useId();
  const empty =
    (kind === "bar" && !(bar?.data?.length ?? 0)) ||
    (kind === "donut" && !(donut?.segments?.length ?? 0)) ||
    (kind === "area" && !(area?.data?.length ?? 0));

  if (empty) {
    return (
      <Card className={className}>
        <h2 className="text-[15px] font-semibold text-text-primary mb-1">{title}</h2>
        {subtitle && <p className="text-[12px] text-text-tertiary mb-4">{subtitle}</p>}
        <p className="text-[13px] text-text-secondary">{emptyText || "Nothing to chart yet."}</p>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <ExpandableChart title={title} subtitle={subtitle} rows={rows} footnote={footnote}>
        {(expanded) => (
          <div className={expanded ? "w-full" : undefined}>
            {!expanded && (
              <>
                <h2 className="text-[15px] font-semibold text-text-primary mb-1">
                  {title}
                </h2>
                {subtitle && (
                  <p className="text-[12px] text-text-tertiary mb-4">{subtitle}</p>
                )}
              </>
            )}
            {kind === "bar" && bar && (
              <BarChart {...bar} height={expanded ? 320 : 190} />
            )}
            {kind === "donut" && donut && (
              <div
                className={
                  expanded
                    ? "flex w-full items-center justify-center gap-8"
                    : "flex-1 flex items-center gap-5"
                }
              >
                <DonutChart
                  {...donut}
                  syncId={donutSync}
                  size={expanded ? 220 : 140}
                  thickness={expanded ? 22 : 15}
                />
                {legend && <DonutLegend {...legend} syncId={donutSync} />}
              </div>
            )}
            {kind === "area" && area && (
              <div className={expanded ? "w-full" : "flex-1 flex items-end"}>
                <AreaChart
                  {...area}
                  height={expanded ? 300 : 180}
                  className="w-full"
                />
              </div>
            )}
          </div>
        )}
      </ExpandableChart>
    </Card>
  );
}
