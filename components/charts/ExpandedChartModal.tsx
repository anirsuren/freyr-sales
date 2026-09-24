"use client";

import {
  createContext,
  useContext,
  useId,
  useState,
  type ReactNode,
} from "react";
import { ArrowRight, CalendarDays, Maximize2, Search } from "lucide-react";
import Link from "next/link";
import {
  AreaChart,
  BarChart,
  DonutChart,
  LineChart,
  InteractiveChartTipProvider,
  type TipItem,
} from "@/components/charts/Charts";
import { VIZ, VIZ_SERIES } from "@/components/charts/palette";
import { Modal } from "@/components/ui/Modal";
import { ColorSelect } from "@/components/ui/ColorSelect";
import { Avatar } from "@/components/ui/Avatar";
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
  value?: string;
  percentage?: number;
  isEmpty?: boolean;
  records?: ExpandedChartRecord[];
};

export type ExpandedChartRecord = {
  label: string;
  meta?: string;
  value?: string;
  href?: string;
  avatar?: string;
};

export type ExpandedChartPoint = {
  label: string;
  records: ExpandedChartRecord[];
};

export type ExpandedChartControlProps = {
  title: string;
  subtitle?: string;
  items: ExpandedChartItem[];
  /** Render the full-size chart with every item key. */
  renderExpanded: (itemKeys: readonly string[]) => ReactNode;
  /** Records attached to individual points in an area chart. */
  points?: ExpandedChartPoint[];
  renderPointExpanded?: (selectedPoint: number, onSelectPoint: (index: number) => void) => ReactNode;
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
  points,
  renderPointExpanded,
  triggerLabel = "Open chart",
  className,
}: ExpandedChartControlProps) {
  const suppressed = useChartExpansionSuppressed();
  const [open, setOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null);
  const [pointQuery, setPointQuery] = useState("");
  const keys = items.map((item) => item.key);
  const selectedItem = items.find((item) => item.key === selectedKey);
  const pointIndex = selectedPoint ?? Math.max(0, (points?.length || 1) - 1);
  const point = points?.[pointIndex];
  const matchingPointRecords = point?.records.filter((record) =>
    !pointQuery.trim() || [record.label, record.meta, record.value].some((value) => value?.toLowerCase().includes(pointQuery.trim().toLowerCase()))
  ) ?? [];

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
        onClick={() => { setSelectedKey(null); setSelectedPoint(null); setPointQuery(""); setOpen(true); }}
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
        bodyClassName="flex flex-col"
      >
        <div className="flex min-h-0 flex-1 flex-col px-2 pb-2">
          {subtitle && (
            <p className="border-b border-border-light px-1 pb-3 text-[13px] leading-relaxed text-text-secondary">
              {subtitle}
            </p>
          )}
          <div className="mt-4 grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
            <div className="flex min-h-[320px] items-center justify-center overflow-auto rounded-2xl border border-border-light bg-surface p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.38)]">
              {selectedItem?.isEmpty ? (
                <div className="max-w-sm text-center">
                  <span className="mx-auto mb-4 block h-3 w-3 rounded-full" style={{ backgroundColor: selectedItem.color }} />
                  <p className="text-[18px] font-semibold text-text-primary">No results for {selectedItem.label}</p>
                  <p className="mt-2 text-[13px] text-text-secondary">This category has no results in the current view.</p>
                </div>
              ) : (
                <InteractiveChartTipProvider>
                  <ChartExpansionSuppressionProvider>
                    {points && renderPointExpanded ? renderPointExpanded(pointIndex, setSelectedPoint) : renderExpanded(selectedItem ? [selectedItem.key] : keys)}
                  </ChartExpansionSuppressionProvider>
                </InteractiveChartTipProvider>
              )}
            </div>
            <div className="flex min-h-[320px] min-w-0 flex-col overflow-hidden rounded-2xl border border-border-light bg-white">
              <div className="border-b border-border-light px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-tertiary">{points ? "Leads behind the chart" : "Explore the chart"}</p>
                <p className="mt-1 text-[13px] text-text-secondary">{points ? "Select a point or week to see every record." : "Choose a category to see it on its own."}</p>
              </div>
              {points && !!point?.records.length && <div className="border-b border-border-light px-4 py-3">
                <label className="flex items-center gap-2 rounded-xl border border-border-light bg-surface px-3 py-2 focus-within:border-blue-primary focus-within:ring-2 focus-within:ring-blue-primary/10">
                  <Search size={15} className="shrink-0 text-text-tertiary" aria-hidden="true" />
                  <input value={pointQuery} onChange={(event) => setPointQuery(event.target.value)} placeholder="Search this week's leads…" aria-label="Search leads in selected week" className="min-w-0 flex-1 bg-transparent text-[12.5px] text-text-primary outline-none placeholder:text-text-tertiary" />
                </label>
              </div>}
              <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {points ? (
                  <div className="px-2 pb-3">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-text-tertiary">Week starting</p>
                    <ColorSelect
                      value={String(pointIndex)}
                      options={points.map((entry, index) => ({
                        value: String(index),
                        label: `${entry.label} · ${entry.records.length} ${entry.records.length === 1 ? "lead" : "leads"}`,
                        color: "#0071E3",
                        icon: CalendarDays,
                      }))}
                      onChange={(value) => { setSelectedPoint(Number(value)); setPointQuery(""); }}
                      ariaLabel="Week starting"
                      fill
                      dense
                      collapsible={false}
                    />
                    <div className="mt-4 flex items-center justify-between gap-3 border-b border-border-light pb-3">
                      <p className="text-[14px] font-semibold text-text-primary">{point?.label}</p>
                      <div className="flex shrink-0 items-center gap-2">
                        {!!point?.records.length && <div className="flex -space-x-2" aria-hidden="true">{point.records.slice(0, 5).map((record, index) => <Avatar key={record.href || `${record.label}-${index}`} name={record.avatar || record.label} className="h-6 w-6 border-2 border-white text-[8px]" />)}{point.records.length > 5 && <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-surface-secondary text-[9px] font-semibold text-text-secondary">+{point.records.length - 5}</span>}</div>}
                        <span className="text-[12px] font-semibold tabular-nums text-text-primary">{point?.records.length || 0} {point?.records.length === 1 ? "lead" : "leads"}</span>
                      </div>
                    </div>
                    {point?.records.length ? matchingPointRecords.length ? <div className="divide-y divide-border-light">{matchingPointRecords.map((record, index) => {
                      const content = <><Avatar name={record.avatar || record.label} className="h-8 w-8 shrink-0 text-[9px]" /><span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold text-text-primary">{record.label}</span>{record.meta && <span className="mt-0.5 block text-[11.5px] leading-snug text-text-secondary">{record.meta}</span>}</span>{record.value && <span className="shrink-0 rounded-full bg-blue-light px-2 py-0.5 text-[10.5px] font-semibold text-blue-primary">{record.value}</span>}</>;
                      return record.href ? <Link key={record.href} href={record.href} className="flex items-start gap-3 py-3 hover:bg-surface">{content}</Link> : <div key={`${record.label}-${index}`} className="flex items-start gap-3 py-3">{content}</div>;
                    })}</div> : <p className="py-8 text-center text-[13px] text-text-secondary">No leads match your search in this week.</p> : <p className="py-8 text-center text-[13px] text-text-secondary">No leads arrived in this week.</p>}
                  </div>
                ) : <>
                <button type="button" aria-pressed={selectedKey === null} onClick={() => setSelectedKey(null)} className={cn("mb-1 flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold transition-colors", selectedKey === null ? "bg-blue-light text-blue-primary" : "text-text-primary hover:bg-surface")}>
                  All categories <span className="text-[11px] font-medium text-text-tertiary">{items.length}</span>
                </button>
                {items.map((item) => (
                  <button key={item.key} type="button" aria-pressed={selectedKey === item.key} onClick={() => setSelectedKey(item.key)} className={cn("mb-1 flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors", selectedKey === item.key ? "border-blue-subtle bg-blue-light/70" : "border-transparent hover:bg-surface")}>
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-text-primary">{item.label}</span>
                    {item.value && <span className="shrink-0 text-[13px] font-semibold tabular-nums text-text-primary">{item.value}</span>}
                    {item.percentage !== undefined && <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-text-tertiary">{item.percentage}%</span>}
                    <ArrowRight size={14} className="shrink-0 text-text-tertiary" />
                  </button>
                ))}
                {selectedItem && (
                  <div className="mt-4 border-t border-border-light px-2 pt-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-tertiary">{selectedItem.label} details</p>
                    {selectedItem.records?.length ? (
                      <div className="mt-2 space-y-1">
                        {selectedItem.records.map((record, index) => {
                          const content = <><span className="min-w-0 flex-1"><span className="block text-[12.5px] font-semibold text-text-primary">{record.label}</span>{record.meta && <span className="block text-[11.5px] text-text-secondary">{record.meta}</span>}</span>{record.value && <span className="shrink-0 text-[12px] font-semibold tabular-nums text-text-primary">{record.value}</span>}</>;
                          return record.href ? <Link key={`${record.label}-${index}`} href={record.href} className="flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-surface">{content}</Link> : <div key={`${record.label}-${index}`} className="flex items-start gap-3 rounded-lg px-2 py-2">{content}</div>;
                        })}
                      </div>
                    ) : (
                      <p className="mt-2 text-[12.5px] leading-relaxed text-text-secondary">{selectedItem.isEmpty ? "There is nothing in this category right now." : "This chart shows the category total; individual records are not listed here."}</p>
                    )}
                  </div>
                )}
                </>}
              </div>
            </div>
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
  details?: ExpandedChartRecord[];
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
  pointDetails?: ExpandedChartPoint[];
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
    value: chart.kind === "bar" ? formatValue(chart.format, chart.data[index].value)
      : chart.kind === "donut" ? formatValue(chart.format, chart.segments[index].value)
      : undefined,
    percentage: chart.kind === "donut" ? Math.round(100 * chart.segments[index].value / Math.max(1, chart.segments.reduce((sum, segment) => sum + segment.value, 0))) : undefined,
    isEmpty: chart.kind === "bar" ? chart.data[index].value === 0
      : chart.kind === "donut" ? chart.segments[index].value === 0
      : chart.kind === "line" ? chart.series[index].points.every((value) => value === 0)
      : chart.data.every((value) => value === 0),
    records: "details" in item && Array.isArray(item.details) ? item.details
      : "tip" in item && Array.isArray(item.tip) ? item.tip.map((tip) => ({ label: tip.name, meta: tip.sub, value: tip.value }))
      : undefined,
  }));
  const donutSyncId = useId();

  if (chart.kind === "area" && chart.pointDetails) {
    return (
      <ExpandedChartControl
        {...controlProps}
        items={items}
        points={chart.pointDetails}
        renderExpanded={renderExpanded}
        renderPointExpanded={(index, onSelectPoint) => (
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
              selectedPointIndex={index}
              onPointSelect={onSelectPoint}
            />
          </div>
        )}
      />
    );
  }

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
      <div className="flex min-h-[350px] w-full items-center justify-center">
        <DonutChart
          segments={segments}
          size={280}
          thickness={27}
          centerLabel={allShown && chart.centerLabel ? chart.centerLabel : formatValue(chart.format, shownTotal)}
          centerSub={allShown && chart.centerSub ? chart.centerSub : segments[0]?.label || "shown"}
          format={chart.format}
          syncId={syncId}
        />
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
