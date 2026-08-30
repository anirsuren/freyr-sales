"use client";

import { useMemo, useState } from "react";
import { ChevronRight, GripVertical, Layers, Package, TrendingUp } from "lucide-react";
import { BarChart } from "@/components/charts/Charts";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { InfoHint } from "@/components/ui/InfoHint";
import { cn } from "@/lib/utils";
import { DimensionStack } from "./DimensionStack";
import {
  estimateOf,
  signDateOf,
  sumEstimates,
  type EstimateMeasure,
  type Opportunity,
} from "@/lib/opportunitiesShared";

/**
 * THE OPPORTUNITY SUMMARY — Suren's own sheet, in this app's language.
 *
 * He drew it on Aug 30 (Sheet3) and said what it was for: "showing all of
 * this really doesn't make sense for me, I want it to be seen in a certain
 * way." The way is a pivot: three values up top, a handful of filters, four
 * dimensions he can stack in any order, and one money column per period.
 *
 * IT IS BUILT THE WAY REVENUE ACCRUALS IS BUILT, deliberately. The first
 * attempt was a bare bordered table of nested rows and Anir's verdict was
 * "this is the worst UI I've ever seen" — correct, because the app already
 * solves exactly this problem one page over: money across periods is a
 * CHART first, then rows underneath in the house style (logo, bold name,
 * grey sub-line, money right-aligned, a hairline running to the edge). Every
 * borrowed detail here is from that page.
 *
 * THE FOUR DIMENSIONS ARE INTERCHANGEABLE, which is the point of it — "I can
 * bring the revenue status first, then the customer group here, then the
 * customer here. I can do whatever arrangement of these four."
 *
 * ONE MEASURE, NEVER BOTH: "he can only select one, either ACV or TC."
 *
 * WHAT IS NOT ENTERED IS NOT ZERO. Neither number exists on a deal until
 * somebody types it (Anir, Aug 30: "he'll add them... we don't have it now"),
 * so a total says how many deals it stands on, and a summary with nothing
 * entered says so in a sentence instead of drawing a grid of dots.
 */

export type SummaryDimension = "group" | "customer" | "offering" | "revenue";

export const DIMENSION_LABEL: Record<SummaryDimension, string> = {
  group: "Customer group",
  customer: "Customer",
  offering: "Offering",
  revenue: "Revenue status",
};

export const DIMENSION_COLOR: Record<SummaryDimension, string> = {
  group: "#0071E3",
  customer: "#0F766E",
  offering: "#B4318F",
  revenue: "#7C3AED",
};

/** Suren's list, in his words: "weekly, monthly, quarterly, sem annual, yearly". */
export const TIMELINES = [
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "quarterly", label: "Quarterly" },
  { key: "semiannual", label: "Semi-annual" },
  { key: "yearly", label: "Yearly" },
] as const;
export type Timeline = (typeof TIMELINES)[number]["key"];

function money(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

/**
 * WHICH COLUMN A DEAL LANDS IN.
 *
 * The closure date, because it is the only date on a deal that says when the
 * money arrives. A deal without one cannot be placed on a timeline at all, so
 * it is counted in the total and named underneath rather than quietly dropped
 * into the first period.
 */
/**
 * FREYR'S YEAR RUNS APRIL TO MARCH (Suren, Aug 30: "for this year, from April
 * to March, you will need to keep it like that instead of a calendar year").
 *
 * So Q1 is Apr-Jun and Q4 is Jan-Mar, and the year a period belongs to is the
 * one the FY ends in — April 2026 through March 2027 is FY27. A calendar
 * quarter here would put the first quarter of the plan in the middle of the
 * previous year's chart, which is exactly the sort of number nobody catches
 * until it is in a board pack.
 */
const FY_START_MONTH = 3; // April, zero-based.

/** The fiscal year a date falls in, named for the year it ends in. */
function fiscalYear(d: Date): number {
  return d.getUTCMonth() >= FY_START_MONTH
    ? d.getUTCFullYear() + 1
    : d.getUTCFullYear();
}

/** 0-3, where 0 is April-June. */
function fiscalQuarterIndex(d: Date): number {
  return Math.floor(((d.getUTCMonth() - FY_START_MONTH + 12) % 12) / 3);
}

/**
 * WHICH COLUMN A DEAL LANDS IN.
 *
 * The closure date, because it is the only date on a deal that says when the
 * money arrives. A deal without one cannot be placed on a timeline at all, so
 * it is counted in the total and named underneath rather than quietly dropped
 * into the first period.
 *
 * The key sorts lexically into chronological order, which is why the fiscal
 * ones carry the FY and the index rather than a printable label.
 */
function periodOf(deal: Opportunity, timeline: Timeline): string | null {
  const iso = signDateOf(deal);
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const fy = fiscalYear(d);
  if (timeline === "yearly") return `FY${fy}`;
  if (timeline === "quarterly") return `FY${fy}-Q${fiscalQuarterIndex(d) + 1}`;
  if (timeline === "semiannual")
    return `FY${fy}-H${fiscalQuarterIndex(d) < 2 ? 1 : 2}`;
  if (timeline === "monthly")
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  /* Weekly: the ISO week its Monday falls in. */
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function periodLabel(key: string, timeline: Timeline): string {
  if (timeline === "monthly") {
    const [y, m] = key.split("-");
    return `${MONTH_NAMES[Number(m) - 1]} '${y.slice(2)}`;
  }
  if (timeline === "weekly") {
    const [y, w] = key.split("-");
    return `${w} '${y.slice(2)}`;
  }
  /* FY2027-Q1 -> "Q1 FY27", which is the way it is said out loud. */
  if (timeline === "yearly") return `FY${key.slice(-2)}`;
  const [fy, part] = key.split("-");
  return `${part} FY${fy.slice(-2)}`;
}

type Node = {
  /** The FULL PATH, not the label. Every row lands in one flat list, so a
   *  label-only key made "Pipeline" under Apotex collide with "Pipeline" under
   *  Artivion and React rendered one subtree twice and dropped the other — the
   *  doubled nesting in Anir's Aug 30 screenshot. */
  key: string;
  label: string;
  dimension: SummaryDimension;
  deals: Opportunity[];
  children: Node[];
};

function buildTree(
  deals: Opportunity[],
  order: SummaryDimension[],
  valueFor: (d: Opportunity, dim: SummaryDimension) => string,
  depth = 0,
  path = ""
): Node[] {
  if (depth >= order.length) return [];
  const dim = order[depth];
  const buckets = new Map<string, Opportunity[]>();
  for (const d of deals) {
    const k = valueFor(d, dim);
    const list = buckets.get(k);
    if (list) list.push(d);
    else buckets.set(k, [d]);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, rows]) => {
      const key = `${path}/${dim}:${label}`;
      return {
        key,
        label,
        dimension: dim,
        deals: rows,
        children: buildTree(rows, order, valueFor, depth + 1, key),
      };
    });
}

function DimensionMark({ dim, label }: { dim: SummaryDimension; label: string }) {
  if (dim === "customer") return <CompanyLogo name={label} className="h-6 w-6 shrink-0" />;
  const Icon = dim === "offering" ? Package : dim === "group" ? Layers : TrendingUp;
  return (
    <Icon
      size={14}
      strokeWidth={2.2}
      className="shrink-0"
      style={{ color: DIMENSION_COLOR[dim] }}
      aria-hidden="true"
    />
  );
}

export function OpportunitySummary({
  deals,
  order,
  onReorder,
  measure,
  timeline,
  groupNameFor,
  offeringNameFor,
  onOpenDeal,
}: {
  deals: Opportunity[];
  order: SummaryDimension[];
  onReorder: (next: SummaryDimension[]) => void;
  measure: EstimateMeasure;
  timeline: Timeline;
  groupNameFor: (deal: Opportunity) => string;
  offeringNameFor: (deal: Opportunity) => string;
  /** The deal's own page. The summary itself never unfolds one — see below. */
  onOpenDeal: (id: string) => void;
}) {
  /** Only rows that have been OPENED live here: four dimensions over 88 deals
   *  is 290 rows if everything starts unfolded, which is the wall this replaced. */
  const [open, setOpen] = useState<Set<string>>(new Set());
  /**
   * THE GRAPH STARTS CLOSED (Suren, Aug 30: "can you make this a closeable
   * thing? I don't want this to be seen"... "I don't want to see this there by
   * default").
   *
   * The table is what he reads; the graph is what he opens when he wants the
   * shape of it. Landing on the numbers rather than on a picture also puts the
   * first rows above the fold instead of below a 180px chart.
   */
  const [chartOpen, setChartOpen] = useState(false);

  const measureLabel = measure === "acv" ? "Estimated ACV" : "Estimated TCV";

  const valueFor = useMemo(
    () => (d: Opportunity, dim: SummaryDimension) => {
      if (dim === "group") return groupNameFor(d);
      if (dim === "customer") return d.customer || "No customer";
      if (dim === "offering") return offeringNameFor(d);
      return d.level;
    },
    [groupNameFor, offeringNameFor]
  );

  /* Only the periods the deals on screen actually reach, so a quarterly view
     of one quarter is one column rather than twelve empty ones. */
  const periods = useMemo(() => {
    const seen = new Set<string>();
    for (const d of deals) {
      const p = periodOf(d, timeline);
      if (p) seen.add(p);
    }
    return [...seen].sort();
  }, [deals, timeline]);

  /** Every deal's period, worked out once — the cell maths asks for this a lot. */
  const periodByDeal = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const d of deals) m.set(d.id, periodOf(d, timeline));
    return m;
  }, [deals, timeline]);

  const tree = useMemo(() => buildTree(deals, order, valueFor), [deals, order, valueFor]);
  const grand = useMemo(() => sumEstimates(deals, measure), [deals, measure]);

  const chart = useMemo(
    () =>
      periods.map((p) => ({
        label: periodLabel(p, timeline),
        value: sumEstimates(
          deals.filter((d) => periodByDeal.get(d.id) === p),
          measure
        ).total,
      })),
    [periods, deals, timeline, measure, periodByDeal]
  );

  /** A row's money: the total, and one figure per period column. */
  function cellsOf(rows: Opportunity[]) {
    const total = sumEstimates(rows, measure);
    const byPeriod = periods.map(
      (p) => sumEstimates(rows.filter((d) => periodByDeal.get(d.id) === p), measure).total
    );
    return { total, byPeriod };
  }

  /**
   * WHAT YOU OPENED, AND EVERYTHING ELSE (Suren, Aug 30: "it's too complicated
   * when I click on something. I think you should dim the other things").
   *
   * Opening a branch used to change nothing about the eighty rows around it —
   * every line was the same weight, so the two or three rows you had just
   * asked for were lost in the wall. The branch you are reading stays at full
   * strength and the rest steps back.
   *
   * A row is part of what you opened if it IS an open row, sits under one, or
   * is on the way down to one — the last of those matters, or the parents you
   * clicked through would fade out from under you. With nothing open at all
   * there is no focus, so nothing dims.
   */
  const focusKeys = useMemo(() => {
    /* Only the DEEPEST open branches count as focus. Opening a parent puts
       every one of its children on an "open path", so testing against all
       open keys lit the entire table and dimmed nothing — measured, first
       attempt. A branch you opened and then opened deeper is no longer the
       thing you are reading; its deepest descendant is. */
    const keys = [...open];
    return keys.filter((k) => !keys.some((o) => o !== k && o.startsWith(`${k}/`)));
  }, [open]);

  const onOpenPath = (key: string) => {
    if (focusKeys.length === 0) return true;
    return focusKeys.some(
      (k) => k === key || k.startsWith(`${key}/`) || key.startsWith(`${k}/`)
    );
  };

  const cellCls =
    "whitespace-nowrap px-3 py-2 text-right text-[12.5px] tabular-nums";

  /**
   * THE NAME COLUMN DOES NOT MOVE (Anir, Aug 30: "when I click on Go Get, it
   * looks like everything's shifting to the right — I don't like that, it's
   * confusing me").
   *
   * A browser sizes table columns from their content, so unfolding a row put
   * longer, more-indented labels into the first column, the column grew to fit
   * them, and every money column slid right. The figures you were reading
   * moved because you opened something underneath them.
   *
   * Pinned, so opening and closing changes what is listed and never where the
   * numbers sit. Long names truncate, which they already did.
   */
  const nameCol = { width: 360, minWidth: 360, maxWidth: 360 } as const;

  function Money({ n, dim }: { n: number; dim?: boolean }) {
    if (n <= 0) return <span className="text-text-tertiary/50">·</span>;
    return <span className={dim ? "text-text-secondary" : undefined}>{money(n)}</span>;
  }

  function renderNode(node: Node, depth: number): React.ReactNode[] {
    const { total, byPeriod } = cellsOf(node.deals);
    const shown = open.has(node.key);
    const faded = !onOpenPath(node.key);
    const out: React.ReactNode[] = [];

    out.push(
      <tr
        key={node.key}
        className={cn(
          "border-b border-border-light hover:bg-surface/50",
          /* Dimmed, not hidden: the totals still have to be readable, because
             a row you are not reading is still a row you might glance at.

             NO TRANSITION ON THIS. A `transition-opacity` here leaves a
             CSSTransition stuck in the running state on the row, and a running
             transition supplies the value — so opacity stayed at 1 no matter
             what the class said, and even an inline 0.4 computed to 1
             (measured, Aug 30). Table rows are inside an ancestor that is
             already running its own entrance animation; this is not a fight
             worth having for a 200ms fade. */
          faded && "opacity-40 hover:opacity-100"
        )}
      >
        <th
          scope="row"
          className="sticky left-0 z-[1] bg-white px-3 py-2 text-left font-normal"
          style={{ ...nameCol, paddingLeft: `${12 + depth * 18}px` }}
        >
          <button
            type="button"
            onClick={() =>
              setOpen((prev) => {
                const next = new Set(prev);
                if (next.has(node.key)) next.delete(node.key);
                else next.add(node.key);
                return next;
              })
            }
            aria-expanded={shown}
            className="flex w-full cursor-pointer items-center gap-2 text-left"
          >
            <ChevronRight
              size={12}
              strokeWidth={2.6}
              aria-hidden="true"
              className={cn(
                "shrink-0 text-text-tertiary transition-transform",
                shown && "rotate-90"
              )}
            />
            <DimensionMark dim={node.dimension} label={node.label} />
            <span
              className={cn(
                "min-w-0 truncate",
                depth === 0
                  ? "text-[12.5px] font-bold text-text-primary"
                  : "text-[12.5px] font-semibold text-text-secondary"
              )}
              title={node.label}
            >
              {node.label}
            </span>
            <span className="shrink-0 text-[11px] text-text-tertiary tnum">
              {node.deals.length}
            </span>
          </button>
        </th>
        <td className={cn(cellCls, "font-bold text-text-primary")}>
          <Money n={total.total} />
        </td>
        {byPeriod.map((v, i) => (
          <td key={periods[i]} className={cellCls}>
            <Money n={v} dim />
          </td>
        ))}
      </tr>
    );

    if (shown) {
      if (node.children.length) {
        for (const c of node.children) out.push(...renderNode(c, depth + 1));
      } else {
        /* THE LOWEST LEVEL IS THE VALUE, AND NOTHING ELSE (Suren, Aug 30:
           "when I click on that, I don't want to see all of this. Just this
           row is enough. At the lowest level, the value is enough... I don't
           want anything further here"). The deal panel used to unfold in
           place here; a deal's own figures across the periods are the whole
           point of the row, and the panel buried them. The name still opens
           the deal for anyone who wants it. */
        for (const d of node.deals) {
          const own = estimateOf(d, measure);
          const p = periodByDeal.get(d.id);
          return_deal_row: {
            out.push(
              <tr
                key={`${node.key}/${d.id}`}
                className="border-b border-border-light last:border-b-0"
              >
                <th
                  scope="row"
                  className="sticky left-0 z-[1] bg-white px-3 py-1.5 text-left font-normal"
                  style={{ ...nameCol, paddingLeft: `${12 + (depth + 1) * 18}px` }}
                >
                  <button
                    type="button"
                    onClick={() => onOpenDeal(d.id)}
                    className="flex w-full cursor-pointer items-center gap-2 text-left text-[12px] text-text-secondary transition-colors hover:text-blue-primary"
                  >
                    <span className="h-3 w-3 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 truncate" title={d.name}>
                      {d.name}
                    </span>
                  </button>
                </th>
                <td className={cn(cellCls, "font-semibold text-text-primary")}>
                  {own === undefined ? (
                    <span className="font-normal text-text-tertiary">·</span>
                  ) : (
                    money(own)
                  )}
                </td>
                {periods.map((per) => (
                  <td key={per} className={cn(cellCls, "text-text-tertiary")}>
                    {p === per && own !== undefined ? money(own) : ""}
                  </td>
                ))}
              </tr>
            );
          }
        }
      }
    }
    return out;
  }

  if (deals.length === 0) {
    return (
      <p className="rounded-xl bg-surface px-4 py-8 text-center text-[12.5px] text-text-secondary">
        No opportunities match these filters.
      </p>
    );
  }

  const grandCells = cellsOf(deals);

  return (
    <div>
      <DimensionStack
        order={order}
        onReorder={onReorder}
        label={DIMENSION_LABEL}
        color={DIMENSION_COLOR}
      />

      {grand.entered === 0 ? (
        <section className="rounded-xl border border-border-light bg-white px-5 py-8 text-center shadow-card">
          <p className="text-[14px] font-semibold text-text-primary">
            No {measureLabel} has been entered yet
          </p>
          <p className="mx-auto mt-1 max-w-[520px] text-[12.5px] text-text-secondary">
            {deals.length} {deals.length === 1 ? "deal is" : "deals are"} on screen and
            none of them carries {measure === "acv" ? "an annual" : "a total"} contract
            value. Open a deal and fill in {measureLabel} — this fills in as they land.
          </p>
        </section>
      ) : (
        <>
          {chart.length > 0 && (
            <section className="rounded-xl border border-border-light bg-white p-5 shadow-card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="flex items-center gap-2 text-[15px] font-semibold text-text-primary">
                    <TrendingUp size={15} strokeWidth={2} className="text-blue-primary" />
                    Where this money lands
                    <InfoHint text="Every deal on screen, summed into the period its closure date falls in. Freyr's year runs April to March, so Q1 is April to June." />
                  </h2>
                  <p className="mt-0.5 text-[12.5px] text-text-secondary">
                    {money(grand.total)} of {measureLabel} across {chart.length}{" "}
                    {chart.length === 1 ? "period" : "periods"}
                    {grand.entered < grand.of && (
                      <>
                        {" · "}
                        <b className="font-semibold">
                          {grand.entered} of {grand.of} deals carry a figure
                        </b>
                      </>
                    )}
                  </p>
                </div>
                {/* CLOSE IT WHEN IT IS IN THE WAY, open it when it is not
                    (Suren, Aug 30). The table below is the thing he reads; the
                    chart is the thing he glances at. */}
                <button
                  type="button"
                  onClick={() => setChartOpen((v) => !v)}
                  aria-expanded={chartOpen}
                  className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-border-light px-2.5 py-1.5 text-[12px] font-semibold text-text-secondary transition-colors hover:border-blue-subtle hover:text-blue-primary"
                >
                  <ChevronRight
                    size={13}
                    strokeWidth={2.4}
                    aria-hidden="true"
                    className={cn("transition-transform", chartOpen && "rotate-90")}
                  />
                  {chartOpen ? "Hide the graph" : "Show the graph"}
                </button>
              </div>
              {chartOpen && (
                <div className="mt-3">
                  <BarChart
                    data={chart}
                    height={180}
                    format="money"
                    maxBarWidth={72}
                    hideFullHeightGhost
                  />
                </div>
              )}
            </section>
          )}

          {/* THE TABLE IS THE ANSWER (Suren, Aug 30: "in the first column you
              show the total, and then the rest of the things you show the
              weekly numbers... let's try individual row lines, and then
              there'll be a total on the top. Then that one becomes easier to
              see"). Every row carries its own split across the periods, so a
              70k deal reads as 30k here and 40k there rather than as one
              number you have to go and find.

              It scrolls sideways when there are more periods than fit; the
              first column is pinned so the row never loses its name. */}
          <div className="mt-4 overflow-x-auto rounded-xl border border-border-light">
            <table className="w-full border-collapse bg-white text-left">
              <thead>
                <tr className="border-b border-border-light bg-surface">
                  <th
                    style={nameCol}
                    className="sticky left-0 z-[2] whitespace-nowrap bg-surface px-3 py-2 text-left text-[11px] font-bold uppercase tracking-[0.04em] text-text-tertiary"
                  >
                    {order.length ? DIMENSION_LABEL[order[0]] : "Opportunity"}
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-right text-[11px] font-bold uppercase tracking-[0.04em] text-text-tertiary">
                    Total
                  </th>
                  {periods.map((p) => (
                    <th
                      key={p}
                      className="whitespace-nowrap px-3 py-2 text-right text-[11px] font-bold uppercase tracking-[0.04em] text-text-tertiary"
                    >
                      {periodLabel(p, timeline)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* THE TOTAL ON TOP, his words exactly. */}
                <tr className="border-b-2 border-border-light bg-blue-light/25">
                  <th
                    scope="row"
                    style={nameCol}
                    className="sticky left-0 z-[1] whitespace-nowrap bg-[color:rgba(0,113,227,0.06)] px-3 py-2 text-left text-[12.5px] font-bold text-text-primary"
                  >
                    All {deals.length} {deals.length === 1 ? "deal" : "deals"}
                  </th>
                  <td className={cn(cellCls, "font-bold text-text-primary")}>
                    <Money n={grandCells.total.total} />
                  </td>
                  {grandCells.byPeriod.map((v, i) => (
                    <td
                      key={periods[i]}
                      className={cn(cellCls, "font-semibold text-text-primary")}
                    >
                      <Money n={v} />
                    </td>
                  ))}
                </tr>
                {order.length === 0
                  ? /* EVERY GROUPING REMOVED IS JUST A LIST (Suren, Aug 30:
                       "you can remove one of the four groupings, or all
                       groupings — then it will be just a list"). */
                    deals.map((d) => {
                      const own = estimateOf(d, measure);
                      const p = periodByDeal.get(d.id);
                      return (
                        <tr
                          key={d.id}
                          className="border-b border-border-light last:border-b-0 hover:bg-surface/50"
                        >
                          <th
                            scope="row"
                            style={nameCol}
                            className="sticky left-0 z-[1] bg-white px-3 py-1.5 text-left font-normal"
                          >
                            <button
                              type="button"
                              onClick={() => onOpenDeal(d.id)}
                              className="flex w-full cursor-pointer items-center gap-2 text-left"
                            >
                              <CompanyLogo
                                name={d.customer}
                                className="h-5 w-5 shrink-0"
                              />
                              <span
                                className="min-w-0 truncate text-[12px] text-text-secondary"
                                title={d.name}
                              >
                                {d.name}
                              </span>
                            </button>
                          </th>
                          <td className={cn(cellCls, "font-semibold text-text-primary")}>
                            {own === undefined ? (
                              <span className="font-normal text-text-tertiary">·</span>
                            ) : (
                              money(own)
                            )}
                          </td>
                          {periods.map((per) => (
                            <td key={per} className={cn(cellCls, "text-text-tertiary")}>
                              {p === per && own !== undefined ? money(own) : ""}
                            </td>
                          ))}
                        </tr>
                      );
                    })
                  : tree.flatMap((n) => renderNode(n, 0))}
              </tbody>
            </table>
          </div>
        </>
      )}

    </div>
  );
}
