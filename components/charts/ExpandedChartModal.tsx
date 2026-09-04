"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useState,
  type ReactNode,
} from "react";
import {
  Check,
  Crosshair,
  Layers3,
  Maximize2,
  Rows3,
} from "lucide-react";
import {
  AreaChart,
  BarChart,
  DonutChart,
  DonutLegend,
  LineChart,
  type TipItem,
} from "@/components/charts/Charts";
import { VIZ, VIZ_SERIES } from "@/components/charts/palette";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";
import { tint } from "@/lib/tint";

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
  /**
   * Render a full-size chart for exactly these item keys. In Split mode the
   * control invokes it once per visible item; in Combined mode it invokes it
   * once with the whole visible set.
   */
  renderExpanded: (visibleKeys: readonly string[]) => ReactNode;
  /** Optional context added to the icon button's accessible name and title. */
  triggerLabel?: string;
  itemNoun?: "series" | "slices";
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
  itemNoun = "series",
  className,
}: ExpandedChartControlProps) {
  const suppressed = useChartExpansionSuppressed();
  const [open, setOpen] = useState(false);
  const [layout, setLayout] = useState<"combined" | "split">("combined");
  const keys = items.map((item) => item.key);
  const keySignature = keys.join("\u0000");
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(
    () => new Set(keys)
  );

  // Fresh data starts fully visible. Filters are a temporary reading aid and
  // should never silently hide a series that arrived after a refresh.
  useEffect(() => {
    setVisibleKeys(new Set(keys));
    // keySignature is the stable, serializable identity of the current data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keySignature]);

  if (suppressed) return null;

  const shownKeys = keys.filter((key) => visibleKeys.has(key));
  const allShown = shownKeys.length === keys.length;
  const openLabel =
    triggerLabel === "Open chart"
      ? `Open ${title} chart`
      : `${triggerLabel}, open ${title} chart`;

  function toggle(key: string) {
    setVisibleKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function showOnly(key: string) {
    setVisibleKeys(new Set([key]));
  }

  function showAll() {
    setVisibleKeys(new Set(keys));
  }

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
          <div className="flex flex-col gap-3 border-b border-border-light px-1 pb-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              {subtitle && (
                <p className="max-w-3xl text-[13px] leading-relaxed text-text-secondary">
                  {subtitle}
                </p>
              )}
              <p
                className="mt-1 text-[11.5px] text-text-tertiary"
                aria-live="polite"
              >
                {shownKeys.length} of {keys.length} {itemNoun} shown
              </p>
            </div>

            <div
              role="group"
              aria-label="Chart layout"
              className="inline-flex shrink-0 rounded-xl border border-border-light bg-surface p-1"
            >
              {(
                [
                  ["combined", "Combined", Layers3],
                  ["split", "Split", Rows3],
                ] as const
              ).map(([value, label, Icon]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={layout === value}
                  onClick={() => setLayout(value)}
                  className={cn(
                    "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-[11.5px] font-semibold transition-[background-color,color,box-shadow]",
                    layout === value
                      ? "bg-white text-text-primary shadow-[0_1px_3px_rgba(16,24,40,0.10)]"
                      : "text-text-secondary hover:text-text-primary"
                  )}
                >
                  <Icon size={13} strokeWidth={2} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="border-b border-border-light px-1 py-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.055em] text-text-tertiary">
                Visible {itemNoun}
              </p>
              <p className="hidden text-[11px] text-text-tertiary sm:block">
                Toggle a {itemNoun === "slices" ? "slice" : "series"} or focus
                it to show it alone.
              </p>
            </div>

            <div
              role="group"
              aria-label={`Visible chart ${itemNoun}`}
              className="flex max-h-[132px] flex-wrap gap-2 overflow-y-auto pr-1"
            >
              <button
                type="button"
                aria-pressed={allShown}
                onClick={showAll}
                className={cn(
                  "inline-flex h-9 cursor-pointer items-center gap-2 rounded-xl border px-3 text-[12px] font-semibold transition-[border-color,background-color,box-shadow]",
                  allShown
                    ? "border-blue-primary/40 bg-blue-light text-blue-primary shadow-[0_0_0_2px_rgba(0,113,227,0.07)]"
                    : "border-border-light bg-white text-text-secondary hover:border-blue-subtle"
                )}
              >
                <Layers3 size={14} strokeWidth={2} />
                Show all
                {allShown && <Check size={13} strokeWidth={2.4} />}
              </button>

              {items.map((item) => {
                const visible = visibleKeys.has(item.key);
                return (
                  <span
                    key={item.key}
                    className="inline-flex h-9 overflow-hidden rounded-xl border"
                    style={{
                      borderColor: visible ? `${tint(item.color, 45)}` : undefined,
                      background: visible ? tint(item.color, 8) : undefined,
                    }}
                  >
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={visible}
                      onClick={() => toggle(item.key)}
                      className={cn(
                        "inline-flex min-w-0 cursor-pointer items-center gap-2 px-2.5 text-[12px] font-semibold text-text-primary",
                        !visible && "bg-surface text-text-tertiary"
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                          visible
                            ? "border-transparent text-white"
                            : "border-border bg-white"
                        )}
                        style={
                          visible ? { background: item.color } : undefined
                        }
                      >
                        {visible && <Check size={11} strokeWidth={2.8} />}
                      </span>
                      <span
                        aria-hidden="true"
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: item.color }}
                      />
                      <span className="max-w-[190px] truncate">
                        {item.label}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => showOnly(item.key)}
                      aria-label={`Show only ${item.label}`}
                      title={`Show only ${item.label}`}
                      className="flex w-8 shrink-0 cursor-pointer items-center justify-center border-l border-inherit text-text-tertiary transition-colors hover:bg-white hover:text-blue-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-primary/30"
                    >
                      <Crosshair size={13} strokeWidth={2} />
                    </button>
                  </span>
                );
              })}
            </div>
          </div>

          {shownKeys.length === 0 ? (
            <div className="mt-4 flex min-h-[390px] flex-col items-center justify-center rounded-2xl border border-border-light bg-surface p-5 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-light text-blue-primary">
                <Layers3 size={20} strokeWidth={1.9} />
              </span>
              <p className="mt-3 text-[14px] font-semibold text-text-primary">
                Nothing is visible
              </p>
              <p className="mt-1 max-w-sm text-[12.5px] text-text-secondary">
                Choose a series above, or show the complete chart again.
              </p>
              <button
                type="button"
                onClick={showAll}
                className="mt-4 cursor-pointer rounded-lg bg-blue-primary px-3 py-2 text-[12px] font-semibold text-white hover:bg-blue-hover"
              >
                Show all
              </button>
            </div>
          ) : layout === "combined" ? (
            <div className="mt-4 min-h-[390px] rounded-2xl border border-border-light bg-surface p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.38)]">
              <ChartExpansionSuppressionProvider>
                {renderExpanded(shownKeys)}
              </ChartExpansionSuppressionProvider>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {shownKeys.map((key) => {
                const item = items.find((candidate) => candidate.key === key);
                if (!item) return null;
                return (
                  <section
                    key={key}
                    aria-label={`${item.label} chart`}
                    className="rounded-2xl border border-border-light bg-surface p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.38)]"
                  >
                    <div className="mb-4 flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ background: item.color }}
                      />
                      <h3 className="text-[13px] font-semibold text-text-primary">
                        {item.label}
                      </h3>
                    </div>
                    <ChartExpansionSuppressionProvider>
                      {renderExpanded([key])}
                    </ChartExpansionSuppressionProvider>
                  </section>
                );
              })}
            </div>
          )}
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
      icon?: string;
      caption?: string;
      tipNote?: string;
      tip?: TipItem[];
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
  "items" | "renderExpanded" | "itemNoun"
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
      <div className="flex min-h-[350px] flex-col items-center justify-center gap-7 md:flex-row">
        <DonutChart
          segments={segments}
          size={250}
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
        <DonutLegend
          items={segments}
          total={shownTotal}
          format={chart.format}
          syncId={syncId}
          bars={chart.legendBars}
          pill={chart.legendPills}
          showValues={chart.legendValues}
          className="w-full max-w-[520px]"
        />
      </div>
    );
  }

  return (
    <ExpandedChartControl
      {...controlProps}
      items={items}
      renderExpanded={renderExpanded}
      itemNoun={chart.kind === "donut" ? "slices" : "series"}
    />
  );
}
