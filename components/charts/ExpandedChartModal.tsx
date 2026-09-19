"use client";

import {
  createContext,
  useContext,
  useId,
  useState,
  type ReactNode,
} from "react";
import { Maximize2 } from "lucide-react";
import {
  AreaChart,
  BarChart,
  DonutChart,
  DonutLegend,
  LineChart,
  InteractiveChartTipProvider,
  type TipItem,
} from "@/components/charts/Charts";
import { VIZ, VIZ_SERIES } from "@/components/charts/palette";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";

/**
 * Existing chart wrappers can provide this around their chart content to
 * suppress a nested auto-expand control. The new modal applies it around its
 * enlarged chart automatically, preventing "expand inside expand" buttons.
 */
const ChartExpansionSuppressionContext = createContext(false);

export function ChartExpansionSuppressionProvider({
  children,
  suppress = true,
}: {
  children: ReactNode;
  suppress?: boolean;
}) {
  return (
    <ChartExpansionSuppressionContext.Provider value={suppress}>
      {children}
    </ChartExpansionSuppressionContext.Provider>
  );
}

export function useChartExpansionSuppressed() {
  return useContext(ChartExpansionSuppressionContext);
}

export type ExpandedChartItem = {
  /** Stable and unique within this chart. */
  key: string;
  label: string;
  color: string;
};

export type ExpandedChartControlProps = {
  title: string;
  subtitle?: string;
  items: ExpandedChartItem[];
  /** Render the full-size chart with every item key. */
  renderExpanded: (itemKeys: readonly string[]) => ReactNode;
  /** Optional context added to the icon button's accessible name and title. */
  triggerLabel?: string;
  className?: string;
};

/**
 * Generic client control for charts that already know how to render
 * themselves. Its item metadata is plain data, while the render callback stays
 * inside a client boundary.
 */
export function ExpandedChartControl({
  title,
  subtitle,
  items,
  renderExpanded,
  triggerLabel = "Open chart",
  className,
}: ExpandedChartControlProps) {
  const suppressed = useChartExpansionSuppressed();
  const [open, setOpen] = useState(false);
  const keys = items.map((item) => item.key);

  if (suppressed) return null;

  const openLabel =
    triggerLabel === "Open chart"
      ? `Open ${title} chart`
      : `${triggerLabel}, open ${title} chart`;

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={openLabel}
        title={openLabel}
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex h-8 !w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border bg-white !p-0 text-text-primary shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-[border-color,background-color,color,box-shadow,transform] hover:border-blue-subtle hover:bg-blue-light hover:text-blue-primary hover:shadow-[0_4px_12px_rgba(0,113,227,0.10)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-primary/30",
          className
        )}
      >
        <Maximize2 size={14} strokeWidth={2} />
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        size="chart"
      >
        <div className="px-2 pb-2">
          {subtitle && (
            <p className="border-b border-border-light px-1 pb-3 text-[13px] leading-relaxed text-text-secondary">
              {subtitle}
            </p>
          )}

          <div className="mt-4 min-h-[390px] rounded-2xl border border-border-light bg-surface p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.38)]">
            <InteractiveChartTipProvider>
              <ChartExpansionSuppressionProvider>
                {renderExpanded(keys)}
              </ChartExpansionSuppressionProvider>
            </InteractiveChartTipProvider>
          </div>
        </div>
      </Modal>
    </>
  );
}

/**
 * Keep this narrower than ChartsClient's `Fmt`: functions cannot cross a
 * server -> client boundary, while every value in this standard adapter is
 * serializable.
 */
export type ExpandedChartFormat =
  | "money"
  | "millions"
  | "duration"
  | "percent"
  | "compact"
  | "number";

type VisibilityDatum = {
  id?: string;
  label: string;
  color?: string;
};

export type ExpandedLineChart = {
  kind: "line";
  series: Array<
    VisibilityDatum & {
      color: string;
      points: number[];
    }
  >;
  xLabels?: string[];
  pointLabels?: string[];
  pointTips?: TipItem[][];
  unit?: string;
  format?: ExpandedChartFormat;
};

export type ExpandedBarChart = {
  kind: "bar";
  data: Array<
    VisibilityDatum & {
      value: number;
      valueLabel?: string;
      pending?: number;
      pendingBands?: { value: number; color: string }[];
      pendingColor?: string;
      dotColor?: string;
      icon?: string;
      caption?: string;
      tipNote?: string;
      tip?: TipItem[];
      tipBar?: {
        bands?: { color: string; label: string; value: string; faded?: boolean }[];
        done: number;
        pending?: number;
        color?: string;
        pendingColor?: string;
        caption?: string;
      };
      logo?: string;
    }
  >;
  unit?: string;
  format?: ExpandedChartFormat;
  hideTipStats?: boolean;
  tipRecordsLabel?: string;
};

export type ExpandedDonutChart = {
  kind: "donut";
  segments: Array<
    VisibilityDatum & {
      color: string;
      value: number;
      icon?: string;
      tip?: TipItem[];
    }
  >;
  centerLabel?: string;
  centerSub?: string;
  format?: ExpandedChartFormat;
  legendBars?: boolean;
  legendPills?: boolean;
  legendValues?: boolean;
};

export type ExpandedAreaChart = VisibilityDatum & {
  kind: "area";
  data: number[];
  xLabels?: string[];
  pointTips?: TipItem[][];
  unit?: string;
  format?: ExpandedChartFormat;
  goal?: number;
  goalLabel?: string;
  yMax?: number;
};

export type ExpandedChartSpec =
  | ExpandedLineChart
  | ExpandedBarChart
  | ExpandedDonutChart
  | ExpandedAreaChart;

export type ExpandedChartModalProps = Omit<
  ExpandedChartControlProps,
  "items" | "renderExpanded"
> & {
  chart: ExpandedChartSpec;
};

function itemKey(item: VisibilityDatum, index: number) {
  return item.id || `${index}:${item.label}`;
}

function itemColor(item: VisibilityDatum, index: number) {
  return item.color || VIZ_SERIES[index % VIZ_SERIES.length] || VIZ.blue;
}

function formatValue(format: ExpandedChartFormat | undefined, value: number) {
  switch (format) {
    case "money":
      return value >= 1e6
        ? `$${(value / 1e6).toFixed(1)}M`
        : value >= 1e3
          ? `$${Math.round(value / 1e3)}K`
          : `$${Math.round(value)}`;
    case "millions":
      return value >= 1
        ? `$${value.toFixed(1)}M`
        : `$${Math.round(value * 1000)}K`;
    case "duration":
      return `${Math.floor(value / 60)}:${String(Math.round(value) % 60).padStart(2, "0")}`;
    case "percent":
      return `${Math.round(value)}%`;
    case "compact":
      return value >= 1e3
        ? `${Number((value / 1e3).toFixed(1))}k`
        : String(Number(value.toFixed(1)));
    default:
      return new Intl.NumberFormat("en-US", {
        maximumFractionDigits: 1,
      }).format(value);
  }
}

/**
 * Serializable standard adapter for the repo's common line, bar and donut
 * data shapes. Server components can pass this plain union directly.
 */
export function ExpandedChartModal({
  chart,
  ...controlProps
}: ExpandedChartModalProps) {
  const data =
    chart.kind === "line"
      ? chart.series
      : chart.kind === "bar"
        ? chart.data
        : chart.kind === "donut"
          ? chart.segments
          : [chart];
  const keys = data.map(itemKey);
  const items = data.map((item, index) => ({
    key: keys[index],
    label: item.label,
    color: itemColor(item, index),
  }));
  const donutSyncId = useId();

  function renderExpanded(visible: readonly string[]) {
    const visibleSet = new Set(visible);

    if (chart.kind === "line") {
      const series = chart.series.filter((_, index) =>
        visibleSet.has(keys[index])
      );
      return (
        <div className="w-full">
          <LineChart
            series={series}
            xLabels={chart.xLabels}
            pointLabels={chart.pointLabels}
            pointTips={chart.pointTips}
            unit={chart.unit}
            format={chart.format}
            height={330}
            className="w-full"
          />
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {series.map((entry, index) => (
              <span
                key={entry.id || `${index}:${entry.label}`}
                className="inline-flex items-center gap-2 rounded-full border border-border-light bg-white px-3 py-1.5 text-[11.5px] font-medium text-text-secondary"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: entry.color }}
                />
                {entry.label}
              </span>
            ))}
          </div>
        </div>
      );
    }

    if (chart.kind === "bar") {
      const data = chart.data
        .filter((_, index) => visibleSet.has(keys[index]))
        .map((entry) => {
          const originalIndex = chart.data.indexOf(entry);
          return {
            ...entry,
            color: itemColor(entry, originalIndex),
          };
        });
      return (
        <BarChart
          data={data}
          height={350}
          unit={chart.unit}
          format={chart.format}
          hideTipStats={chart.hideTipStats}
          tipRecordsLabel={chart.tipRecordsLabel}
        />
      );
    }

    if (chart.kind === "area") {
      if (!visibleSet.has(keys[0])) return null;
      return (
        <div className="flex min-h-[350px] w-full items-center">
          <AreaChart
            data={chart.data}
            color={itemColor(chart, 0)}
            height={330}
            id={`expanded-area-${donutSyncId.replace(/[^a-zA-Z0-9_-]/g, "")}`}
            className="w-full"
            goal={chart.goal}
            goalLabel={chart.goalLabel}
            xLabels={chart.xLabels}
            format={chart.format}
            unit={chart.unit}
            pointTips={chart.pointTips}
            yMax={chart.yMax}
          />
        </div>
      );
    }

    const segments = chart.segments.filter((_, index) =>
      visibleSet.has(keys[index])
    );
    const shownTotal = segments.reduce(
      (total, segment) => total + segment.value,
      0
    );
    const allShown = segments.length === chart.segments.length;
    const syncId = `${donutSyncId}-${visible.join("-")}`;
    return (
      <div className="grid min-h-[350px] w-full grid-cols-1 items-stretch md:grid-cols-[minmax(300px,.9fr)_minmax(380px,1.1fr)]">
        <div className="flex items-center justify-center p-6">
          <DonutChart
            segments={segments}
            size={280}
            thickness={25}
            centerLabel={
              allShown && chart.centerLabel
                ? chart.centerLabel
                : formatValue(chart.format, shownTotal)
            }
            centerSub={
              allShown && chart.centerSub ? chart.centerSub : "shown"
            }
            format={chart.format}
            syncId={syncId}
          />
        </div>
        <div className="flex min-w-0 flex-col justify-center border-t border-border-light p-7 md:border-l md:border-t-0">
          <p className="mb-4 text-[10.5px] font-semibold uppercase tracking-[0.055em] text-text-tertiary">
            Breakdown
          </p>
          <DonutLegend
            items={segments}
            total={shownTotal}
            format={chart.format}
            syncId={syncId}
            bars={chart.legendBars}
            pill={chart.legendPills}
            showValues={chart.legendValues}
            className={chart.legendBars === false ? "w-fit max-w-full" : "w-full"}
          />
        </div>
      </div>
    );
  }

  return (
    <ExpandedChartControl
      {...controlProps}
      items={items}
      renderExpanded={renderExpanded}
    />
  );
}
