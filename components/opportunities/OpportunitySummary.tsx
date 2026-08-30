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
function periodOf(deal: Opportunity, timeline: Timeline): string | null {
  const iso = deal.estSignDate;
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  if (timeline === "yearly") return String(y);
  if (timeline === "quarterly") return `${y} Q${Math.floor(m / 3) + 1}`;
  if (timeline === "semiannual") return `${y} H${m < 6 ? 1 : 2}`;
  if (timeline === "monthly") return `${y}-${String(m + 1).padStart(2, "0")}`;
  const t = new Date(Date.UTC(y, m, d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()} W${String(week).padStart(2, "0")}`;
}

function periodLabel(key: string, timeline: Timeline): string {
  if (timeline === "monthly") {
    const [y, m] = key.split("-");
    const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${names[Number(m) - 1]} '${y.slice(2)}`;
  }
  return key.replace(/^(\d{2})(\d{2})\s/, "'$2 ");
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
  openDealId,
  onOpenDeal,
  renderDeal,
}: {
  deals: Opportunity[];
  order: SummaryDimension[];
  onReorder: (next: SummaryDimension[]) => void;
  measure: EstimateMeasure;
  timeline: Timeline;
  groupNameFor: (deal: Opportunity) => string;
  offeringNameFor: (deal: Opportunity) => string;
  /** Which deal is unfolded, if any. */
  openDealId: string | null;
  onOpenDeal: (id: string) => void;
  /**
   * THE DEAL, OPENED WHERE IT WAS CLICKED.
   *
   * It used to flip the page to Table view and unfold the row there, which
   * threw away the drill-down that got you to it — Anir, Aug 30, after
   * opening Offering > RI Report > Dentalmax > Pipeline: "why are you taking
   * me to table view when I go all the way in?" Four folds of work, gone on
   * the click that was supposed to be the payoff.
   *
   * There is no /opportunities/[id] page to send him to either: a deal IS a
   * panel that unfolds inside a list. So the summary renders that same panel
   * itself, in place, and the path he opened stays exactly as he left it.
   */
  renderDeal: (deal: Opportunity) => React.ReactNode;
}) {
  /** CLOSED IS THE STARTING POINT. Four dimensions over 79 deals opens 290
   *  rows at once, which is the wall Anir saw — the summary exists to be read
   *  before it is drilled. Only ids that have been OPENED live here. */
  const [open, setOpen] = useState<Set<string>>(new Set());
  /** Which chip is in the hand, and which slot it would land in. Without the
   *  second one the drag was invisible — Anir, Aug 30: "when I'm rearranging
   *  these make the UI better so it looks like I'm actually rearranging." */
  const [dragging, setDragging] = useState<SummaryDimension | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

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

  const periods = useMemo(() => {
    const seen = new Set<string>();
    for (const d of deals) {
      const p = periodOf(d, timeline);
      if (p) seen.add(p);
    }
    return [...seen].sort();
  }, [deals, timeline]);

  const tree = useMemo(() => buildTree(deals, order, valueFor), [deals, order, valueFor]);

  const grand = useMemo(() => sumEstimates(deals, measure), [deals, measure]);

  /** The chart across the top — one column per period, the same shape the
   *  accruals page draws its months in. */
  const chart = useMemo(
    () =>
      periods.map((p) => ({
        label: periodLabel(p, timeline),
        value: sumEstimates(
          deals.filter((d) => periodOf(d, timeline) === p),
          measure
        ).total,
      })),
    [periods, deals, timeline, measure]
  );

  const undated = useMemo(
    () => deals.filter((d) => periodOf(d, timeline) === null).length,
    [deals, timeline]
  );

  function renderNode(node: Node, depth: number): React.ReactNode[] {
    const totals = sumEstimates(node.deals, measure);
    const shown = open.has(node.key);
    const share = grand.total > 0 ? totals.total / grand.total : 0;
    const out: React.ReactNode[] = [];

    out.push(
      <div key={node.key} style={{ paddingLeft: `${depth * 20}px` }}>
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
          className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-1 py-2 text-left transition-colors hover:bg-surface"
        >
          <ChevronRight
            size={13}
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
              "min-w-0 shrink truncate",
              depth === 0
                ? "text-[13px] font-bold text-text-primary"
                : "text-[12.5px] font-semibold text-text-secondary"
            )}
            title={node.label}
          >
            {node.label}
          </span>
          <span className="shrink-0 text-[12px] text-text-tertiary tnum">
            {node.deals.length} {node.deals.length === 1 ? "deal" : "deals"}
          </span>
          {/* The hairline that runs to the money, exactly as the accrual group
              headers do — it is what stops a row of text floating in space. */}
          <span className="h-px flex-1 bg-border-light" aria-hidden="true" />
          {totals.entered === 0 ? (
            <span className="shrink-0 text-[12px] text-text-tertiary">
              none entered
            </span>
          ) : (
            <span className="flex shrink-0 items-center gap-2">
              {/* Share of the whole, so a big number reads as big at a glance
                  — the app's own progress-bar idiom rather than a bare figure. */}
              <span
                aria-hidden="true"
                className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-surface sm:block"
              >
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: `${Math.max(2, Math.round(share * 100))}%`,
                    background: DIMENSION_COLOR[node.dimension],
                  }}
                />
              </span>
              <span className="text-[13px] font-bold text-text-primary tnum">
                {money(totals.total)}
              </span>
              {totals.entered < totals.of && (
                <span
                  className="text-[11px] font-semibold text-text-tertiary tnum"
                  title={`${totals.entered} of ${totals.of} deals here carry a figure`}
                >
                  {totals.entered}/{totals.of}
                </span>
              )}
            </span>
          )}
        </button>

        {shown &&
          (node.children.length
            ? node.children.flatMap((c) => renderNode(c, depth + 1))
            : node.deals.map((d) => {
                const own = estimateOf(d, measure);
                const unfolded = openDealId === d.id;
                return (
                  <div key={`${node.key}/${d.id}`} style={{ marginLeft: "20px" }}>
                    <button
                      type="button"
                      onClick={() => onOpenDeal(d.id)}
                      aria-expanded={unfolded}
                      className={cn(
                        "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-1 py-1.5 text-left transition-colors",
                        unfolded ? "bg-blue-light/50" : "hover:bg-blue-light/40"
                      )}
                    >
                      <ChevronRight
                        size={12}
                        strokeWidth={2.6}
                        aria-hidden="true"
                        className={cn(
                          "shrink-0 text-text-tertiary transition-transform",
                          unfolded && "rotate-90"
                        )}
                      />
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate text-[12.5px]",
                          unfolded
                            ? "font-semibold text-blue-primary"
                            : "text-text-secondary"
                        )}
                      >
                        {d.name}
                      </span>
                      {d.estSignDate && (
                        <span className="shrink-0 text-[11px] text-text-tertiary tnum">
                          {d.estSignDate}
                        </span>
                      )}
                      <span className="shrink-0 text-[12.5px] font-semibold text-text-primary tnum">
                        {own === undefined ? (
                          <span
                            className="font-normal text-text-tertiary"
                            title={`No ${measureLabel} on this deal yet`}
                          >
                            not entered
                          </span>
                        ) : (
                          money(own)
                        )}
                      </span>
                    </button>
                    {unfolded && (
                      <div className="mb-2 mt-1 overflow-hidden rounded-xl border border-border-light bg-white shadow-card">
                        <div className="overflow-x-auto">{renderDeal(d)}</div>
                      </div>
                    )}
                  </div>
                );
              }))}
      </div>
    );
    return out;
  }

  if (deals.length === 0) {
    return (
      <p className="rounded-xl bg-surface px-4 py-8 text-center text-[12.5px] text-text-secondary">
        No opportunities match these filters.
      </p>
    );
  }

  return (
    <div>
      <DimensionStack
        order={order}
        onReorder={onReorder}
        label={DIMENSION_LABEL}
        color={DIMENSION_COLOR}
      />

      {grand.entered === 0 ? (
        /* NOTHING TO DRAW YET, SAID IN A SENTENCE. Rendering a chart of zeros
           and a grid of dots over 79 real deals reads as a broken page; this
           says exactly what is missing and where to put it. */
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
            <section className="rounded-xl border border-border-light bg-white p-5 pb-2.5 shadow-card">
              <h2 className="flex items-center gap-2 text-[15px] font-semibold text-text-primary">
                <TrendingUp size={15} strokeWidth={2} className="text-blue-primary" />
                Where this money lands
                <InfoHint text="Every deal on screen, summed into the period its closure date falls in. The filters above change the picture, not just the list underneath." />
              </h2>
              <p className="mt-0.5 text-[12.5px] text-text-secondary">
                {money(grand.total)} of {measureLabel} across{" "}
                {chart.length} {chart.length === 1 ? "period" : "periods"}
                {grand.entered < grand.of && (
                  <>
                    {" · "}
                    <b className="font-semibold">
                      {grand.entered} of {grand.of} deals carry a figure
                    </b>
                  </>
                )}
              </p>
              <div className="mt-3">
                {/* No 100% ghost: the tallest quarter is not a target the others are
                    failing to reach, it is just the tallest quarter. */}
                <BarChart
                  data={chart}
                  height={180}
                  format="money"
                  maxBarWidth={72}
                  hideFullHeightGhost
                />
              </div>
            </section>
          )}

          <div className="mt-4 space-y-0.5">
            {tree.flatMap((n) => renderNode(n, 0))}
          </div>
        </>
      )}

      {undated > 0 && (
        <p className="mt-3 text-[11.5px] text-text-tertiary">
          {undated} {undated === 1 ? "deal has" : "deals have"} no closure date, so
          {undated === 1 ? " it counts" : " they count"} in the totals but sit in no
          period.
        </p>
      )}
    </div>
  );
}
