"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useStoredSet } from "@/lib/useStoredView";
import { Briefcase, ChevronDown, ChevronRight, GripVertical, Layers, Package, TrendingUp, UserRound } from "lucide-react";
import { BarChart } from "@/components/charts/Charts";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { Avatar } from "@/components/ui/Avatar";
import { AgentAvatar, agentIn } from "@/components/ui/AgentAvatar";
import { InfoHint } from "@/components/ui/InfoHint";
import { cn } from "@/lib/utils";
import { DimensionStack } from "./DimensionStack";
import {
  estimateOf,
  opportunityConfidence,
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

export type SummaryDimension = "group" | "customer" | "offering" | "revenue" | "owner";

export const DIMENSION_LABEL: Record<SummaryDimension, string> = {
  group: "Customer group",
  customer: "Customer",
  offering: "Offering",
  /* Suren, Sep 1: "one of the groupings you want to add is maybe owners —
     all the deals related to owner that we can do". */
  owner: "Owner",
  /* HIS WORD FOR IT (Suren, Sep 1: "this revenue status, we call this
     something — what do we call it? They call it an opportunity category").
     Same rename as the Level field on the deal: one vocabulary for the thing
     that says whether a deal is Go get, Pipeline or High confidence. */
  revenue: "Opportunity category",
};

export const DIMENSION_COLOR: Record<SummaryDimension, string> = {
  group: "var(--ink-bright-blue)",
  customer: "var(--ink-teal-deep)",
  offering: "var(--ink-magenta)",
  owner: "var(--ink-orange)",
  revenue: "var(--ink-violet-soft)",
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

/** The fiscal year a date falls in, named for the year it ends in.
 *  Exported so the Financial year FILTER on this same screen names a year the
 *  way the columns beside it do — Manoj, Sep 3, seeing "FY 2026, 27" under a
 *  column headed "Q1 FY27": "it clubbed both the years." */
export function fiscalYearEnding(d: Date): number {
  return fiscalYear(d);
}

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
/** The period one ISO date falls in — exported so anything that buckets money
 *  by time uses the same fiscal calendar the summary draws. */
export function periodKeyOf(iso: string | undefined, timeline: Timeline): string | null {
  return fromDate(iso, timeline);
}

function periodOf(deal: Opportunity, timeline: Timeline): string | null {
  return fromDate(signDateOf(deal), timeline);
}

function fromDate(iso: string | undefined, timeline: Timeline): string | null {
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

/** "quarters", "months" — the unit the columns are actually in, so the line
 *  can say what it is counting instead of the generic "periods". */
function periodWord(timeline: Timeline, count: number): string {
  const one =
    timeline === "weekly"
      ? "week"
      : timeline === "monthly"
        ? "month"
        : timeline === "quarterly"
          ? "quarter"
          : timeline === "semiannual"
            ? "half-year"
            : "year";
  return count === 1 ? one : `${one}s`;
}

export function periodLabel(key: string, timeline: Timeline): string {
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

/** What an owner row says when the deal has nobody on it. Kept next to the
 *  only two places that care: the label builder and the mark below. */
export const NO_OWNER_LABEL = "Nobody yet";

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
  /* "NOBODY YET" IS NOT A NAME, SO IT DOES NOT SORT LIKE ONE.
     Anir, Sep 1: "why on earth is nobody in front of Suren? Shouldn't that
     nobody be at the end." Alphabetically N falls between Anir and Suren, so
     the unassigned bucket, which is 97 of the 102 deals and by far the biggest
     row, was sitting in the middle of the real people as though it were one of
     them.

     Placeholders go last in every dimension, not just Owner: an unassigned
     bucket is the leftovers, and the leftovers belong at the bottom of the
     list whatever the column is called. Everything else keeps sorting by name,
     which is what makes a row findable. */
  const isLeftovers = (label: string) =>
    label === NO_OWNER_LABEL || /^(no |unassigned|nobody|none$)/i.test(label);
  return [...buckets.entries()]
    .sort((a, b) => {
      const la = isLeftovers(a[0]);
      const lb = isLeftovers(b[0]);
      if (la !== lb) return la ? 1 : -1;
      return a[0].localeCompare(b[0]);
    })
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

  /* A PERSON GETS THEIR FACE, the way an account gets its logo two lines up.
     Anir, Sep 1: "for the owner, I need the profile pictures to show up for
     the people instead of that icon of the arrow." Every owner row was wearing
     the same orange trending-up arrow, which says nothing about who owns it
     and, worse, is the identical glyph the revenue dimension uses.

     "Nobody yet" is deliberately NOT given an avatar: it is not a person, and
     Avatar resolves photos by NAME, so handing it a placeholder string is
     exactly how somebody else's face ends up on a row that has no owner. It
     keeps a neutral outline instead. */
  if (dim === "owner") {
    if (label === NO_OWNER_LABEL)
      return (
        <UserRound
          size={14}
          strokeWidth={2.2}
          className="shrink-0"
          style={{ color: DIMENSION_COLOR.owner }}
          aria-hidden="true"
        />
      );
    return <Avatar name={label} className="h-6 w-6 shrink-0" />;
  }

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

/**
 * WHERE THE DEAL SITS, ON THE ROW ITSELF (Suren, Sep 1: "Here, for every
 * opportunity, we also should see where that opportunity is at 60% or 80% in
 * pipeline").
 *
 * The summary reaches a deal after three or four folds and then says only what
 * it is worth. The one number that says whether that money is likely to arrive
 * was the one thing you had to leave the page to find.
 *
 * IT WEARS THE SLIDER'S COLOUR, NOT A NEW ONE. The confidence bar sweeps red
 * through amber to green degree by degree (Anir, Aug 18: "a gradual red-to-green
 * thing, not just red, yellow, or green"), and the middle of the sweep holds its
 * lightness so it reads as yellow rather than olive (Anir, Aug 19: "there's not
 * enough yellow"). Same hue on the same number, so a deal cannot look one colour
 * on the edit screen and another here.
 *
 * The sweep lives inline inside ConfidenceSlider rather than as an export, so it
 * is restated here. The alpha goes INSIDE the hsl() rather than appended as hex:
 * "hsl(12, 76%, 43%)" + "14" is not a colour and the browser drops the whole
 * declaration.
 */
/**
 * BLUE, NOT A VERDICT WALL — the decision Anir already made for this exact
 * figure on this exact page (Aug 17, recorded in OpportunitiesBrowser): "the
 * first cut coloured confidence red/amber/green and a young pipeline became a
 * page of red. Red means horrible, and 25% confidence is not horrible, it is
 * early."
 *
 * It matters here more than anywhere: of the 69 deals carrying a confidence,
 * 52 sit at 10-25%. A red-to-green sweep would turn every expanded group into
 * the page he rejected. The SLIDER on the deal form keeps its sweep, because
 * there you are setting one number and the gradient is the instrument; a table
 * of a hundred rows is a different job.
 */
const CONFIDENCE_BLUE = "var(--ink-bright-blue)";
function confidenceTint(_pct: number): { fg: string; bg: string; border: string } {
  return {
    fg: CONFIDENCE_BLUE,
    bg: "rgba(0, 113, 227, 0.08)",
    border: "rgba(0, 113, 227, 0.22)",
  };
}

/**
 * QUIET, AND BESIDE THE NAME — never a column of its own. The period grid is
 * the thing this table is for; a sixth header would push it sideways for a
 * figure that is two characters wide. It rides in the pinned name cell, which
 * is width-locked, so the money columns do not move a pixel (Anir, Aug 30:
 * "it looks like everything's shifting to the right — I don't like that").
 */
function ConfidencePill({ pct }: { pct: number }) {
  const c = confidenceTint(pct);
  return (
    <span
      className="shrink-0 rounded-full border px-1.5 py-[1px] text-[11px] font-bold tnum"
      style={{ color: c.fg, background: c.bg, borderColor: c.border }}
      title={`${pct}% confidence`}
    >
      {pct}%
    </span>
  );
}

export function OpportunitySummary({
  deals,
  accrualPlans = {},
  confidenceSort = "none",
  order,
  onReorder,
  measure,
  timeline,
  groupNameFor,
  offeringNameFor,
  onOpenDeal,
  spread,
  toolbar,
  filtering = false,
  dimensions,
  hideDealRows = false,
  rowHref,
  storageKey,
  revealDealId,
}: {
  deals: Opportunity[];
  /**
   * WHERE THE OPEN ROWS ARE REMEMBERED (Anir, Sep 3: "when I go back on these
   * pages it's too annoying that you reset it. I want to go back to exactly
   * where I was").
   *
   * This tree lived in plain `useState`, so every navigation collapsed it —
   * open a group, open a customer, open an offering, click a deal, press back,
   * and you are staring at the top of the book again with four folds to redo.
   * Scoped per surface because the same component draws the pipeline, the
   * customer book and the accrual dashboard, and their trees are different
   * questions.
   */
  storageKey?: string;
  /**
   * A DEAL TO OPEN THE BOOK AT ("when I just added a new opportunity I would
   * like you to open the shit up so I can see exactly where it is"). Every
   * ancestor row on the way down to it is unfolded and the row is scrolled to
   * and briefly lit, so a deal you just created is not a thing you go hunting
   * for through four collapsed levels.
   */
  revealDealId?: string | null;
  /**
   * ITEM 13 — "Revenue Accrual should go against the opportunity rows as
   * well." Keyed by opportunity id, the same map the browser already holds for
   * the planned/invalid marks; this reads the total off it.
   */
  accrualPlans?: Record<string, { planned: boolean; total?: number }>;
  /**
   * ORDER THE DEALS UNDER A GROUP BY HOW LIKELY THEY ARE.
   *
   * Manoj, Sep 3: "there should be a way for me to sort it based on — let's
   * say I want to see all the pipeline opportunities in the ascending order,
   * or descending order, of confidence level."
   *
   * It sorts the DEALS, never the groups above them. A customer group has no
   * confidence of its own — it would have to be an average of the deals under
   * it, which is a number nobody typed.
   */
  confidenceSort?: "none" | "asc" | "desc";
  order: SummaryDimension[];
  onReorder: (next: SummaryDimension[]) => void;
  measure: EstimateMeasure;
  timeline: Timeline;
  groupNameFor: (deal: Opportunity) => string;
  offeringNameFor: (deal: Opportunity) => string;
  /** The deal's own page. The summary itself never unfolds one — see below. */
  onOpenDeal: (id: string) => void;
  /**
   * A CONTROL THAT BELONGS ON THE VIEW ROW.
   *
   * Anir, Sep 1: "You don't need to say how the revenue accrues. Just
   * literally put the view stuff at the top in line with the quarterly
   * dropdown, and then it's just that simple."
   *
   * The accruals page had a heading, and under it a row of grouping chips,
   * and off to the right of the heading a timeline picker — three tiers of
   * chrome above one table, when the chips and the picker are the same kind
   * of thing: how you want this table cut. They share a line now.
   */
  toolbar?: React.ReactNode;
  /**
   * TRUE WHILE A SEARCH OR FILTER IS NARROWING THE DEALS.
   *
   * The tree is collapsed on arrival on purpose — four dimensions over a
   * hundred deals is a wall of rows. But once you have typed something the
   * answer is one or two rows, and leaving them shut means the search tells
   * you a match exists and then hides it behind a chevron (Anir, Sep 4,
   * having searched "test" and been shown a folded "Anir Suren · 1": "again,
   * here you have to open it, bro, when I search it up").
   *
   * The filtering itself is the caller's job; this only needs to know that it
   * happened.
   */
  filtering?: boolean;
  /**
   * WHICH DIMENSIONS THIS SCREEN MAY CUT BY. Omitted means all of them.
   *
   * Manoj, Sep 4, on the customer page: "Even the filters, it should be only
   * customer group, customer, and owner." Restricting the ACTIVE order is not
   * enough — the stack offers every dimension it knows as a chip you can add
   * back, so Offering and Opportunity category were one click from returning.
   */
  dimensions?: SummaryDimension[];
  /**
   * STOP AT THE LAST GROUP INSTEAD OF LISTING THE DEALS UNDERNEATH IT.
   *
   * Manoj, Sep 4: "We don't want opportunities in this screen at all." On the
   * customer page the tree exists to total the book by account, and unfolding
   * an account into its deals turned it back into the opportunities list.
   */
  hideDealRows?: boolean;
  /** Where a row at this dimension should link instead of opening a deal. */
  rowHref?: (dimension: SummaryDimension, label: string) => string | null;
  /**
   * HOW ONE DEAL'S MONEY LANDS ACROSS PERIODS, when it does not all land at
   * once. The pipeline puts a deal's whole figure in the period its closure
   * date falls in; Revenue Accruals spreads it over the months of its plan
   * (Suren, Aug 30: "whatever is the total contract value, they are accruing
   * across monthly"). Same table, two different answers to where money is.
   *
   * Omitted keeps the closure-date behaviour.
   */
  spread?: {
    /** Which period keys this deal touches at this timeline. */
    periodsOf: (deal: Opportunity, timeline: Timeline) => string[];
    /** How much of the measure lands in one of them. */
    amountIn: (deal: Opportunity, period: string, measure: EstimateMeasure) => number;
  };
}) {
  /** Only rows that have been OPENED live here: four dimensions over 88 deals
   *  is 290 rows if everything starts unfolded, which is the wall this replaced. */
  /* Remembered across navigations when the caller names a place to keep it;
     an unnamed tree still works, it just forgets. */
  const [storedOpen, setStoredOpen, openReady] = useStoredSet(
    storageKey || "freyr.summary.open.anon"
  );
  const [open, setOpenState] = useState<Set<string>>(new Set());
  /** Rows deliberately SHUT while filtering. Filtering opens everything, so
   *  the toggle has to record the opposite or it would spring back open on
   *  the next render. Separate from `open` so leaving the filter restores the
   *  browsing state exactly as it was left. */
  const [shutWhileFiltering, setShutWhileFiltering] = useState<Set<string>>(new Set());
  const router = useRouter();
  /* Clearing the search, or starting a different one, forgets what was shut
     during the last one — otherwise a row you folded away while looking for
     one thing stays folded while you look for the next, and the new search
     silently hides its own answer. */
  useEffect(() => {
    if (!filtering) setShutWhileFiltering(new Set());
  }, [filtering]);
  const setOpen = (next: Set<string> | ((p: Set<string>) => Set<string>)) => {
    setOpenState((prev) => {
      const value = typeof next === "function" ? next(prev) : next;
      if (storageKey) setStoredOpen([...value]);
      return value;
    });
  };
  /* The remembered folds arrive after hydration, so they are applied once and
     only when the user has not already started opening things. */
  const restored = useRef(false);
  useEffect(() => {
    if (!openReady || restored.current || !storageKey) return;
    restored.current = true;
    if (storedOpen.length) setOpenState(new Set(storedOpen));
  }, [openReady, storedOpen, storageKey]);
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
      if (dim === "owner") return d.owner || NO_OWNER_LABEL;
      return d.level;
    },
    [groupNameFor, offeringNameFor]
  );

  /* Only the periods the deals on screen actually reach, so a quarterly view
     of one quarter is one column rather than twelve empty ones. */
  const periods = useMemo(() => {
    const seen = new Set<string>();
    for (const d of deals) {
      if (spread) for (const k of spread.periodsOf(d, timeline)) seen.add(k);
      else {
        const p = periodOf(d, timeline);
        if (p) seen.add(p);
      }
    }
    return [...seen].sort();
  }, [deals, timeline, spread]);

  /** Every deal's period, worked out once — the cell maths asks for this a lot. */
  const periodByDeal = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const d of deals) m.set(d.id, periodOf(d, timeline));
    return m;
  }, [deals, timeline]);

  const tree = useMemo(() => buildTree(deals, order, valueFor), [deals, order, valueFor]);

  /**
   * OPEN THE BOOK AT A PARTICULAR DEAL.
   *
   * Row keys are cumulative — `${path}/${dim}:${label}` — so the ancestors of
   * any deal are just the running prefixes of its own values down the
   * dimension order. No searching the tree: the path is computed straight off
   * the record.
   */
  useEffect(() => {
    if (!revealDealId) return;
    const deal = deals.find((d) => d.id === revealDealId);
    if (!deal) return;
    const keys: string[] = [];
    let path = "";
    for (const dim of order) {
      path = `${path}/${dim}:${valueFor(deal, dim)}`;
      keys.push(path);
    }
    setOpen((prev) => {
      const next = new Set(prev);
      for (const k of keys) next.add(k);
      return next;
    });
    /* After the rows those folds create have actually rendered. */
    const t = setTimeout(() => {
      document
        .querySelector(`[data-deal-id="${CSS.escape(revealDealId)}"]`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 260);
    return () => clearTimeout(t);
  }, [revealDealId, deals, order, valueFor]);

  const grand = useMemo(() => {
    if (!spread) return sumEstimates(deals, measure);
    let total = 0;
    let entered = 0;
    for (const d of deals) {
      const keys = spread.periodsOf(d, timeline);
      if (!keys.length) continue;
      entered += 1;
      for (const k of keys) total += spread.amountIn(d, k, measure);
    }
    return { total, entered, of: deals.length };
  }, [deals, measure, spread, timeline]);

  const chart = useMemo(
    () =>
      periods.map((p) => ({
        label: periodLabel(p, timeline),
        value: spread
          ? deals.reduce((sum, d) => sum + spread.amountIn(d, p, measure), 0)
          : sumEstimates(
              deals.filter((d) => periodByDeal.get(d.id) === p),
              measure
            ).total,
      })),
    [periods, deals, timeline, measure, periodByDeal]
  );

  /** A row's money: the total, and one figure per period column. */
  function cellsOf(rows: Opportunity[]) {
    const byPeriod = periods.map((p) =>
      spread
        ? rows.reduce((sum, d) => sum + spread.amountIn(d, p, measure), 0)
        : sumEstimates(
            rows.filter((d) => periodByDeal.get(d.id) === p),
            measure
          ).total
    );
    /* WITH A SPREAD, TOTAL IS THE SUM OF THE COLUMNS. On the pipeline a deal is
       worth its whole figure on the day it closes and Total is that figure; on
       an accrual page the row IS its months, and a Total that disagreed with
       them ($12M of TCV over $1.0M of planned months, seen on screen) is a
       table that does not reconcile — worse than no table on a money page. */
    const total = spread
      ? {
          total: byPeriod.reduce((a, b) => a + b, 0),
          entered: rows.filter((d) => spread.periodsOf(d, timeline).length > 0).length,
          of: rows.length,
        }
      : sumEstimates(rows, measure);
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
    "whitespace-nowrap px-3 py-2 text-right text-[14px] tabular-nums";

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
  /**
   * WIDE ENOUGH FOR A DEAL'S ACTUAL NAME (Anir, Sep 3: "I really don't want
   * this to show up as '...'. Maybe if you could only do that if it's ... and
   * it's only fucking huge, but I'm okay with scrolling on the screen left and
   * right").
   *
   * 360px was cutting "Agent - VIA — AbbVie" down to "Agent - VIA — Abb…" —
   * and truncation at that width hides the END of a name, which on these deals
   * is the customer. The column is 520 now and the table already scrolls
   * sideways, which he would rather do than read an ellipsis. A ceiling stays
   * so one absurd name cannot push every figure off the screen; only genuinely
   * huge names clip.
   */
  /**
   * WHAT IS BEING SOLD, AS A MARK. The six Freya Fusion agents wear Saras's
   * artwork — the same faces the pickers and the deal screen draw — and
   * everything else gets the catalogue's package glyph, so an offering never
   * reads as a bare word where its neighbours have icons.
   */
  function offeringMark(d: Opportunity) {
    const label = offeringNameFor(d);
    /* "No offering" and friends are placeholders, not products — the same
       leftovers test the tree sorts by. */
    if (!label || /^(no |unassigned|none$)/i.test(label)) return null;
    return agentIn(label) ? (
      <AgentAvatar name={label} size={18} className="shrink-0" />
    ) : (
      <Package
        size={13}
        strokeWidth={2.2}
        aria-hidden="true"
        className="shrink-0 text-[color:var(--ink-violet-soft)]"
      />
    );
  }

  const nameCol = { width: 520, minWidth: 520, maxWidth: 520 } as const;

  function Money({ n, dim }: { n: number; dim?: boolean }) {
    if (n <= 0) return <span className="text-text-tertiary/50">·</span>;
    return <span className={dim ? "text-text-secondary" : undefined}>{money(n)}</span>;
  }

  function renderNode(
    node: Node,
    depth: number,
    /* Where this node sits among its siblings, purely so the reveal can
       stagger. Defaults to 0 for the roots, which do not animate anyway. */
    rowIndex = 0
  ): React.ReactNode[] {
    const { total, byPeriod } = cellsOf(node.deals);
    /* While filtering, EVERY surviving row is a match, so open is the default
       and the set records what the reader shut again. */
    const shown = filtering ? !shutWhileFiltering.has(node.key) : open.has(node.key);
    const faded = !onOpenPath(node.key);
    /**
     * IS THERE ANYTHING UNDER THIS ROW TO OPEN?
     *
     * Anir, Sep 4, on the customer page: "it says that there's one thing, but
     * it's not letting me see it in customers." Galderma showed 1, unfolded to
     * "Anir Suren 1", and that unfolded to nothing at all — because this screen
     * deliberately stops at the account and never lists the deals (Manoj: "we
     * don't want opportunities in this screen at all").
     *
     * The count is honest; the chevron was not. A row with nothing beneath it
     * must not offer to open, so the deepest level loses its arrow and its
     * click instead of opening onto a blank.
     */
    const canOpen = node.children.length > 0 || !hideDealRows;
    const out: React.ReactNode[] = [];

    out.push(
      <tr
        key={node.key}
        /* Its position among its siblings, so a branch opening staggers down
           the list instead of every child appearing on the same frame. */
        style={{ ["--row" as string]: rowIndex }}
        className={cn(
          "border-b border-border-light hover:bg-surface/50",
          depth > 0 && "tree-row-in",
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
            onClick={() => {
              if (filtering) {
                setShutWhileFiltering((prev) => {
                  const next = new Set(prev);
                  if (next.has(node.key)) next.delete(node.key);
                  else next.add(node.key);
                  return next;
                });
                return;
              }
              setOpen((prev) => {
                const next = new Set(prev);
                if (next.has(node.key)) next.delete(node.key);
                else next.add(node.key);
                return next;
              });
            }}
            aria-expanded={canOpen ? shown : undefined}
            disabled={!canOpen}
            className={cn(
              "flex w-full items-center gap-2 text-left",
              canOpen ? "cursor-pointer" : "cursor-default"
            )}
          >
            {canOpen ? (
              <ChevronRight
                size={12}
                strokeWidth={2.6}
                aria-hidden="true"
                className={cn(
                  "shrink-0 text-text-tertiary transition-transform",
                  shown && "rotate-90"
                )}
              />
            ) : (
              /* The arrow's width is still spent, so the labels of a leaf row
                 and an openable one stay on the same left edge. */
              <span className="w-3 shrink-0" aria-hidden />
            )}
            <DimensionMark dim={node.dimension} label={node.label} />
            {/* THE NAME CAN BE A DOOR (Manoj, Sep 4, clicking an account here
                and landing on a deal: "It should not take us to opportunities
                in customer. It should take us to the information about
                Galderma"). `rowHref` decides, per dimension, so the tree keeps
                folding on the chevron and the name goes where the screen says
                it should. Rendered as a span with a click rather than a nested
                <a>, because this row is already a <button>. */}
            {(() => {
              const href = rowHref?.(node.dimension, node.label) ?? null;
              const text = (
                <span
                  className={cn(
                    "min-w-0 truncate",
                    depth === 0
                      ? "text-[14px] font-bold text-text-primary"
                      : "text-[14px] font-semibold text-text-secondary",
                    href && "underline-offset-2 hover:text-blue-primary hover:underline"
                  )}
                  title={node.label}
                >
                  {node.label}
                </span>
              );
              if (!href) return text;
              return (
                <span
                  role="link"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    router.push(href);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      router.push(href);
                    }
                  }}
                  className="min-w-0 cursor-pointer truncate"
                >
                  {text}
                </span>
              );
            })()}
            {/* SAY WHAT THE NUMBER IS (Anir, Sep 4: "what does this '4' mean?
                Next to the people the numbers. This is in revenue accrual.
                What does that mean?").

                It is how many deals sit under that branch, and it was a bare
                numeral with no noun anywhere near it — beside a person's name
                it could as easily have been a rank, a version or a count of
                anything else on the row. The root of this same tree already
                reads "All 104 deals"; the branches now match it. */}
            <span className="shrink-0 whitespace-nowrap text-[12px] text-text-tertiary">
              <span className="tnum">{node.deals.length}</span>{" "}
              {node.deals.length === 1 ? "deal" : "deals"}
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
        node.children.forEach((c, childIndex) =>
          out.push(...renderNode(c, depth + 1, childIndex))
        );
      } else if (hideDealRows) {
        /* Nothing under the last group. The customer page totals the book by
           account and stops there — see `hideDealRows`. */
      } else {
        /* THE LOWEST LEVEL IS THE VALUE, AND NOTHING ELSE (Suren, Aug 30:
           "when I click on that, I don't want to see all of this. Just this
           row is enough. At the lowest level, the value is enough... I don't
           want anything further here"). The deal panel used to unfold in
           place here; a deal's own figures across the periods are the whole
           point of the row, and the panel buried them. The name still opens
           the deal for anyone who wants it. */
        /* Deals with no confidence sink to the bottom whichever way it is
           sorted: "not set" is not a low number, it is the absence of one, and
           putting it first on ascending would bury the deals somebody actually
           has doubts about. */
        const leafDeals =
          confidenceSort === "none"
            ? node.deals
            : [...node.deals].sort((a, b) => {
                const ca = opportunityConfidence(a);
                const cb = opportunityConfidence(b);
                if (ca === undefined && cb === undefined) return 0;
                if (ca === undefined) return 1;
                if (cb === undefined) return -1;
                return confidenceSort === "asc" ? ca - cb : cb - ca;
              });
        leafDeals.forEach((d, i) => {
          const own = estimateOf(d, measure);
          const p = periodByDeal.get(d.id);
          /* The same read the Opportunities list draws its own per-deal
             confidence from, so one deal cannot say 25% on one screen and
             something else on the other. Undefined means nobody has set one. */
          const confidence = opportunityConfidence(d);
          return_deal_row: {
            out.push(
              <tr
                key={`${node.key}/${d.id}`}
                data-deal-id={d.id}
                style={{ ["--row" as string]: i }}
                className={cn(
                  "tree-row-in border-b border-border-light last:border-b-0",
                  /* THE ONE YOU JUST MADE, LIT FOR A MOMENT. Opening the folds
                     down to a deal still leaves you scanning a screen of rows
                     for it; the tint says which one without moving anything. */
                  revealDealId === d.id && "bg-blue-light/50"
                )}
              >
                <th
                  scope="row"
                  className="sticky left-0 z-[1] bg-white px-3 py-1.5 text-left font-normal"
                  style={{ ...nameCol, paddingLeft: `${12 + (depth + 1) * 18}px` }}
                >
                  <button
                    type="button"
                    onClick={() => onOpenDeal(d.id)}
                    className="flex w-full cursor-pointer items-center gap-2 text-left text-[13px] text-text-secondary transition-colors hover:text-blue-primary"
                  >
                    {/* THE DEAL GETS A MARK LIKE EVERY ROW ABOVE IT.
                        Anir, Sep 1: "there should be an icon for the
                        individual opportunity, and this goes for everything.
                        It just looks odd."

                        Group, customer, offering and level each carried one
                        and the leaf — the actual deal, the thing the whole
                        tree exists to reach — was an invisible 12px spacer, so
                        the last row read as a stray caption under the rows
                        that had marks. A briefcase, the app's own opportunity
                        glyph from the sidebar, in indigo: the customer's logo
                        is already on the row above, so repeating it would say
                        nothing this row does not already sit under. */}
                    {/* ONE MARK, NOT TWO (Anir, Sep 3: "if you're using that,
                        I only need one icon. You don't have to put that
                        fucking briefcase if you're putting the other icon").

                        The briefcase says "this row is a deal" — which is
                        worth saying when the row would otherwise start with
                        bare text, and worth nothing beside an offering mark
                        that says the same and more. So the specific mark wins
                        and the generic one steps aside. */}
                    {(!order.includes("offering") && offeringMark(d)) || (
                      <Briefcase
                        size={13}
                        strokeWidth={2.2}
                        className="shrink-0 text-[color:#4338CA]"
                        aria-hidden="true"
                      />
                    )}
                    {/* THE MARKS THIS ROW STILL HAS TO CARRY (Anir, Sep 3:
                        "if I'm in a customer, I want to see the company logo…
                        you have to see if I don't already select the customer.
                        If I want to see the customer and if I didn't already
                        select the owner or the team member, I want to see that
                        as a profile picture").

                        One rule, three marks: a dimension the tree is GROUPED
                        BY is already answered by an ancestor row, so repeating
                        it down the column says nothing. A dimension that is
                        NOT in the view has nowhere else to appear, and that is
                        exactly when the deal row should say it. The company
                        logo and the offering follow the owner's face, which
                        got this treatment first. */}
                    {!order.includes("customer") &&
                      !order.includes("group") &&
                      d.customer && (
                        <CompanyLogo
                          name={d.customer}
                          className="h-[18px] w-[18px] shrink-0 text-[7px]"
                        />
                      )}
                    <span className="min-w-0 truncate" title={d.name}>
                      {d.name}
                    </span>
                    {/* WHOSE DEAL IT IS, AS A FACE (Anir, Sep 3: "put the
                        profile picture — not the name, just pfp is enough —
                        somewhere on the row, in line, if I created it for
                        example, or anyone else").

                        The face and not the name: the name would cost a
                        column's width on every row to repeat what one glance
                        at a photo already says, and the owner is on the deal
                        page in full for anybody who needs to read it. Nothing
                        is drawn for the unowned deals — 97 of the book has no
                        owner, and a placeholder head on all of them would say
                        "somebody" where the truth is "nobody yet". */}
                    {/* NOT WHEN THE TREE IS ALREADY GROUPED BY OWNER (Anir,
                        Sep 3: "you don't have to put the profile picture if
                        the person's there, because I'm already clicked into
                        the person"). Under an Owner row, every deal repeats
                        the same face down the column — it answers a question
                        the row above already answered, and the whole reason
                        the face is here is to answer it where nothing else
                        does. */}
                    {d.owner && !order.includes("owner") && (
                      <Avatar
                        name={d.owner}
                        /* The component owns its own hover label. */
                        tooltip
                        className="h-[18px] w-[18px] shrink-0 text-[7px]"
                      />
                    )}
                    {/* ONLY ON THE DEAL, never on the rows above it. A group's
                        confidence would have to be an average of the deals
                        under it, which is a number nobody typed and nobody can
                        act on.

                        AGAINST EVERY DEAL, INCLUDING THE ONES WITHOUT ONE
                        (Manoj's change sheet, item 1: "Show Confidence
                        Percentage in the opportunities screen against all
                        opportunities"). It used to render nothing at all when
                        the deal had no confidence, and 28 of the 102 deals in
                        the book have never had one set — so the column he was
                        looking down had holes in it, and a hole reads as "this
                        row is different" rather than "nobody has said yet".

                        Still never 0%. A zero is a claim that the deal will
                        not close; "not set" is the truth, which is that the
                        question has not been answered. */}
                    {/* ITEM 13 — THE ACCRUAL, ON THE OPPORTUNITY ROW.
                        Manoj's sheet: "Revenue Accrual should go against the
                        opportunity rows as well."

                        Only on the deal, like the confidence beside it: an
                        accrual belongs to one opportunity and a group's would
                        be a sum of plans nobody made together. A planned deal
                        says what its schedule adds up to; an unplanned one
                        says nothing at all, because "no plan yet" is already
                        what the empty space means and a $0 would read as a
                        plan that accrues nothing.

                        A plan the sweep emptied (item 19) reports $0 here,
                        which is correct and is the point: the money has left
                        the forward totals and this row should not still be
                        claiming it. */}
                    {(() => {
                      const acc = accrualPlans[d.id];
                      if (!acc?.planned) return null;
                      return (
                        <span
                          title={`Revenue accrual planned: ${money(acc.total ?? 0)}`}
                          className="shrink-0 whitespace-nowrap rounded-full bg-[rgba(3,105,161,0.10)] px-1.5 py-px text-[11px] font-semibold text-[color:#0369A1]"
                        >
                          accrual {money(acc.total ?? 0)}
                        </span>
                      );
                    })()}
                    {confidence === undefined ? (
                      <span className="shrink-0 whitespace-nowrap rounded-full border border-border-light px-1.5 py-px text-[11px] font-semibold text-text-tertiary">
                        not set
                      </span>
                    ) : (
                      <ConfidencePill pct={confidence} />
                    )}
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
        });
      }
    }
    return out;
  }

  if (deals.length === 0) {
    return (
      <p className="rounded-xl bg-surface px-4 py-8 text-center text-[14px] text-text-secondary">
        No opportunities match these filters.
      </p>
    );
  }

  const grandCells = cellsOf(deals);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <DimensionStack
            order={order}
            onReorder={onReorder}
            /* The stack offers whatever this map holds, so narrowing the map
               narrows the chips too. */
            label={
              dimensions
                ? (Object.fromEntries(
                    dimensions.map((d) => [d, DIMENSION_LABEL[d]])
                  ) as Record<SummaryDimension, string>)
                : DIMENSION_LABEL
            }
            color={DIMENSION_COLOR}
          />
        </div>
        {toolbar && <div className="shrink-0">{toolbar}</div>}
      </div>

      {grand.entered === 0 ? (
        <section className="rounded-xl border border-border-light bg-white px-5 py-8 text-center shadow-card">
          <p className="text-[15.5px] font-semibold text-text-primary">
            No {measureLabel} has been entered yet
          </p>
          <p className="mx-auto mt-1 max-w-[520px] text-[14px] text-text-secondary">
            {deals.length} {deals.length === 1 ? "deal is" : "deals are"} on screen and
            none of them carries {measure === "acv" ? "an annual" : "a total"} contract
            value. Open a deal and fill in {measureLabel} — this fills in as they land.
          </p>
        </section>
      ) : (
        <>
          {/* THIN, AND STILL WHEN IT OPENS.

              Anir, Sep 1: "can you make sure it's a lot thinner? It does not
              need to be that thick" — and then, on the first attempt at that:
              "I don't like how the text moves. It's kind of annoying."

              Both were right. It was a 90px band whose whole job was to say
              the chart is below. But making it thin by shrinking the padding
              AND the type AND the line arrangement on toggle meant the title
              jumped left and changed size every time you pressed it.

              One line, one size, one padding, open or closed. Opening adds the
              chart underneath and moves nothing above it — the one-line header
              is what made it thin, and the shrinking never was. */}

          {/* THE TABLE IS THE ANSWER (Suren, Aug 30: "in the first column you
              show the total, and then the rest of the things you show the
              weekly numbers... let's try individual row lines, and then
              there'll be a total on the top. Then that one becomes easier to
              see"). Every row carries its own split across the periods, so a
              70k deal reads as 30k here and 40k there rather than as one
              number you have to go and find.

              It scrolls sideways when there are more periods than fit; the
              first column is pinned so the row never loses its name. */}
          <div className="mt-3 overflow-x-auto rounded-xl border border-border-light">
            <table className="w-full border-collapse bg-white text-left">
              <thead>
                <tr className="border-b border-border-light bg-surface">
                  <th
                    style={nameCol}
                    className="sticky left-0 z-[2] whitespace-nowrap bg-surface px-3 py-2 text-left text-[12px] font-bold uppercase tracking-[0.04em] text-text-tertiary"
                  >
                    {order.length ? DIMENSION_LABEL[order[0]] : "Opportunity"}
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-right text-[12px] font-bold uppercase tracking-[0.04em] text-text-tertiary">
                    Total
                  </th>
                  {periods.map((p) => (
                    <th
                      key={p}
                      className="whitespace-nowrap px-3 py-2 text-right text-[12px] font-bold uppercase tracking-[0.04em] text-text-tertiary"
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
                    className="sticky left-0 z-[1] whitespace-nowrap bg-[color:rgba(0,113,227,0.06)] px-3 py-2 text-left text-[14px] font-bold text-text-primary"
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
                      /* Every grouping removed still leaves DEAL rows, so the
                         confidence belongs here for the same reason. */
                      const confidence = opportunityConfidence(d);
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
                                className="min-w-0 truncate text-[13px] text-text-secondary"
                                title={d.name}
                              >
                                {d.name}
                              </span>
                              {confidence !== undefined && (
                                <ConfidencePill pct={confidence} />
                              )}
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

          {/* THE GRAPH SITS UNDER THE NUMBERS (Manoj, Sep 3: "bring the bar
              graph below everything"). It was above the table, so opening it
              pushed the rows people actually read down the page. Still closed
              by default, per Suren's Aug 30 note above. */}
          {chart.length > 0 && (
            /* AIR BETWEEN THE TABLE AND THE GRAPH (Anir, Sep 4: "why are the
               two things literally touching each other: where the money comes
               in and then the customer group thing?"). Moving the chart below
               the table on Sep 3 left the two cards flush, so they read as one
               object with a stray line through it. */
            <section className="mt-3 rounded-xl border border-border-light bg-white px-4 py-3 shadow-card">
              {/* THE WHOLE HEADER IS THE FOLD (Anir, Aug 30: "I don't want to
                  show the graph thing, just make it a drop-down like you do
                  this somewhere else"). A labelled button beside the heading
                  was a second control saying what a chevron already says, and
                  it is not how anything else in this app folds — the goal
                  categories, the deal form and the summary rows are all a
                  heading you press with a chevron that turns. */}
              {/* THE HINT SITS BESIDE THE FOLD, NOT INSIDE IT. InfoHint renders
                  its own <button>, and a button nested in a button is invalid
                  HTML — React threw "Hydration failed" on every load of this
                  page while it was in there. The standing rule in this repo is
                  to place hints BESIDE a heading rather than within it, and
                  this is exactly why. My own doing, Sep 1. */}
              {/* The chevron and the hint are ONE cluster, not two loose marks.
                  Before this they were a 16px chevron flung to the far right by
                  the button's justify-between, and a 20px circled question mark
                  after it on a different vertical offset (mt-0.5 against
                  mt-[3px]). Anir, Sep 1: "look at all the elements inside it,
                  the dropdown arrow especially, and then the spacing."

                  Now both sit in matched 24px round targets on a shared centre
                  line, so they line up with each other and the chevron has a
                  hover state the same shape as the hint's. The button still
                  spans the row, so clicking anywhere on the line still folds
                  it. */}
              <div className="flex w-full items-start gap-0.5">
              <button
                type="button"
                onClick={() => setChartOpen((v) => !v)}
                aria-expanded={chartOpen}
                className="group flex min-w-0 flex-1 cursor-pointer items-start gap-3 text-left"
              >
                {/* THE ICON SITS OUTSIDE THE BASELINE GROUP (Anir, Sep 3:
                    "the text isn't aligned with each other"). It used to live
                    INSIDE the title span, and that span was a flex with
                    items-center — so the title's baseline became the flex
                    box's, not its text's, and the 14px title and the 12.5px
                    subtitle beside it sat on two different lines that were
                    supposed to be one. Out here it is centred against the row
                    and the two pieces of text share a real baseline. */}
                <TrendingUp
                  size={14}
                  strokeWidth={2}
                  className="mt-[3px] shrink-0 text-blue-primary"
                />
                {/* PLAIN WORDS (Anir: "I don't like the copy. What does 'where
                    this money lands' mean"). It meant the money split across
                    time — so it says that. The unit is the one actually on
                    screen: four QUARTERS reads as four quarters, not as "4
                    periods", which is a word for the code's benefit. */}
                <span className="flex min-w-0 flex-wrap items-baseline gap-x-2.5">
                  <span className="text-[15.5px] font-semibold text-text-primary">
                    {spread ? "When the money is expected" : "When the money comes in"}
                  </span>
                  <span className="text-[14px] text-text-secondary">
                    {money(grand.total)} {spread ? "planned" : `of ${measureLabel}`},
                    split across {chart.length}{" "}
                    {periodWord(timeline, chart.length)}
                    {grand.entered < grand.of && (
                      <>
                        {" · "}
                        <b className="font-semibold">
                          {grand.entered} of {grand.of} deals{" "}
                          {spread ? "have a plan" : "have a figure"}
                        </b>
                      </>
                    )}
                  </span>
                </span>
                <span className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors group-hover:bg-blue-light">
                  <ChevronDown
                    size={15}
                    strokeWidth={2.2}
                    aria-hidden="true"
                    className={cn(
                      "text-text-tertiary transition-transform duration-200 group-hover:text-blue-primary",
                      chartOpen && "rotate-180"
                    )}
                  />
                </span>
              </button>
              <div className="flex h-6 shrink-0 items-center">
                <InfoHint text="Each column is the period a deal is expected to SIGN in, taken from its Expected to sign date. The year runs April to March, so Q1 is April to June. A deal with no expected sign date is in the total but in none of the columns, which is why the count of deals carrying a figure can be lower than the deal count." />
              </div>
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
        </>
      )}

    </div>
  );
}
