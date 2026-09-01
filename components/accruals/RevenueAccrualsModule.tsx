"use client";

import { useStickyValue } from "@/lib/useStickyValue";
import {
  OpportunitySummary,
  periodKeyOf,
  TIMELINES,
  type SummaryDimension,
  type Timeline,
} from "@/components/opportunities/OpportunitySummary";
import {
  effectiveRevenueType,
  signDateOf,
  OPPORTUNITY_LEVELS,
  OPPORTUNITY_STATUSES,
  type Opportunity,
} from "@/lib/opportunitiesShared";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CalendarRange,
  ChevronDown,
  Coins,
  Download,
  Lock,
  Plus,
  Trash2,
  Unlock,
  Briefcase,
  ScanLine,} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatTile } from "@/components/ui/StatTile";
import { PageToolbar } from "@/components/ui/PageToolbar";
import { ColorSelect } from "@/components/ui/ColorSelect";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { Avatar } from "@/components/ui/Avatar";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { InfoHint } from "@/components/ui/InfoHint";
import {
  AccrualChart,
  AccrualChartPicker,
  useAccrualChartKinds,
} from "@/components/accruals/AccrualChart";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { Input } from "@/components/ui/Input";
import { formatMoney } from "@/lib/pipeline";
import { cn, formatDate } from "@/lib/utils";
import { downloadCSV, toCSV } from "@/lib/csv";
import { PriorityLabel, PriorityTooltip } from "@/components/ui/SearchPriority";
import {
  buildDeviation,
  judgePlan,
  monthKey,
  monthLabel,
  planTotal,
  type AccrualPlan,
  type RevenueAccrualsState,
} from "@/lib/revenueAccrualsShared";
/* THE PLANNER ITSELF, in a file of its own so a deal's page can mount exactly
   the same screen (Suren, Sep 1: "it's just that same screen shows up here").
   The deal type and the reserved amber come with it rather than being written
   out twice. */
import {
  ACCRUAL_AMBER,
  AccrualPlanDialog,
  type DealOption,
} from "@/components/accruals/AccrualPlanDialog";

/**
 * REVENUE ACCRUALS (Suren, Aug 25): the month-by-month plan for money that has
 * not landed, and the month-on-month gap when it slips.
 *
 * THE PAGE ANSWERS THREE QUESTIONS, in his order:
 *
 *   1. "There are so many projects where there is no accrual numbers, so then
 *      they have to go and fill that" — deals with no plan at all, named.
 *   2. "There has to be a flag which says it is not validating… and you go and
 *      fix it" — plans whose close month has passed, flagged, never moved.
 *   3. "What is the gap, where did the gap came from — you need to be able to
 *      see month on month gaps" — this month's plan against last month's
 *      frozen sheet, per month AND per deal.
 *
 * NOTHING ON THIS PAGE MOVES A MONTH BY ITSELF. That was the explicit decision
 * in the room, and it is the only reason the flag means anything.
 */

/* The reserved amber, from the file that also draws the plan form, so the
   flags on this page and the over/under line inside that form are one colour
   and not two literals drifting apart. */
const AMBER = ACCRUAL_AMBER;

/**
 * WHICH FINANCIAL YEAR A PLANNED MONTH LANDS IN.
 *
 * Suren, Sep 1: "in the filter, you say financial years. Give financial years,
 * and then whichever years he selects, if he selects all the years, then the
 * accrual is going across all years… you have to clearly give the year detail:
 * 27, 28, 29, 30. If he selects 27, 28, 29, 30, then I only look at that
 * accrual."
 *
 * Freyr's year starts in APRIL, and `periodKeyOf(iso, "yearly")` is the one
 * place in the app that knows it — the same function the summary table above
 * buckets its own columns with. Calling it here, rather than reaching for the
 * calendar year on the month string, is what stops this filter and that table
 * disagreeing about which year March belongs to.
 *
 * The key it hands back is `FY2027`; the chip says `FY27`, the way it is said
 * out loud and the way the summary's own yearly columns are already labelled.
 */
function fyKeyOf(month: string): string | null {
  return periodKeyOf(`${month}-01`, "yearly");
}
function fyLabelOf(key: string): string {
  return `FY${key.slice(-2)}`;
}

/**
 * THE SAME FILTERS AS OPPORTUNITIES, EVALUATED AGAINST A DEAL (Suren, Sep 1:
 * "all of this filter that we're doing on opportunity, same filters, give this
 * here also").
 *
 * These two colour maps are the pipeline's own, copied rather than imported:
 * OpportunitiesBrowser keeps them module-private, and a category that wears one
 * colour on Opportunities and another here would break the app's rule that a
 * category's colour is the same everywhere it appears. If they are ever
 * exported, delete these and import them.
 */
const LEVEL_COLOR: Record<string, string> = {
  Pipeline: "#0071E3",
  "Go get": "#B4318F",
  "High confidence": "#0F766E",
};
const STATUS_COLOR: Record<string, string> = {
  Qualify: "#0891B2",
  Pilot: "#5E5CE6",
  Propose: "#0071E3",
  "Submitted to client": "#7C3AED",
  "Create contract": "#4338CA",
  "Under review": "#B4318F",
  "On hold": "#8E98A8",
  Won: "#16A34A",
  Lost: "#DC2626",
};

/** The closure band a deal falls in, the same calendar quarters the
 *  Opportunities filter offers, read off the same `signDateOf`. */
function closureBandOf(deal: Opportunity | undefined): string {
  const iso = deal ? signDateOf(deal) : undefined;
  if (!iso) return "No date";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "No date";
  return `${d.getUTCFullYear()} Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
}

/**
 * EACH COMPANY WEARS ITS OWN COLOUR (Anir, Aug 27: "I meant for each
 * company"). Every card on this page was the same blue, so two flat $500K
 * plans were literally the same picture twice. A stable accent per customer
 * colours the card's rail, its sparkline, its chart and its line on the page
 * summary — identity hues only, never amber/red/green, which this page
 * reserves for months that have already gone by.
 */
const ACCENTS = [
  "#0071E3", // blue
  "#7C3AED", // violet
  "#0891B2", // cyan
  "#B4318F", // magenta
  "#4F46E5", // indigo
  "#0F766E", // deep teal
  "#C2410C", // burnt orange
];
function accentFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return ACCENTS[h % ACCENTS.length];
}

export function RevenueAccrualsModule({
  state: initial,
  deals,
  canWrite,
  live = true,
  opportunities = [],
  customerGroups = [],
  offeringNames = {},
}: {
  state: RevenueAccrualsState;
  deals: DealOption[];
  canWrite: boolean;
  /** Real workspace data, or the demo set. The pill above says which. */
  live?: boolean;
  /** The pipeline itself, for the summary. `deals` above is the flat picker
   *  the planner uses and stays as it is. */
  opportunities?: Opportunity[];
  customerGroups?: { id: string; name: string; color: string; customerIds: string[] }[];
  offeringNames?: Record<string, string>;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [state, setState] = useState(initial);
  const [query, setQuery] = useState("");
  const [only, setOnly] = useState<"all" | "flagged" | "missing">("all");
  const [tab, setTab] = useState<"plans" | "deviation">("plans");
  /* THE SUMMARY'S OWN CONTROLS. No measure picker: this page is TCV and only
     TCV (Suren, Aug 30: "it's only TCV on the revenue page"). */
  const [accrDims, setAccrDims] = useStickyValue<SummaryDimension[]>(
    "freyr.accruals.dims",
    ["group", "customer", "offering", "revenue"]
  );
  const [accrTimeline, setAccrTimeline] = useStickyValue<Timeline>(
    "freyr.accruals.timeline",
    "monthly"
  );
  const [kindFor, setKindFor] = useAccrualChartKinds();
  /**
   * WHICH DEAL THE PLANNER IS OPEN ON, and nothing else.
   *
   * The form itself — the months, the split, the even spread, the save — is
   * AccrualPlanDialog, because the deal page mounts the identical thing
   * (Suren, Sep 1: "both the screens have to be the same. It's just that same
   * screen shows up here"). `""` opens it with nothing chosen, which is what
   * "Plan a deal" does; a deal id fills it in, which is what the pencil and a
   * row in the table do. Null means it is closed, and closing UNMOUNTS it, so
   * it can never re-open showing the deal before last.
   */
  const [planning, setPlanning] = useState<{ dealId: string } | null>(null);
  const [busy, setBusy] = useState(false);
  /** The deal picker "Plan a deal" opens. A button that says it plans a
   *  deal has to ask which deal, not quietly change a filter behind you. */
  const [confirmFreeze, setConfirmFreeze] = useState(false);
  /* Suren, Sep 1: "there will be a button that you go and click on. Every time
     somebody comes and clicks on that button, the system will go and record
     all the revenue and all the opportunities. If the contract date is passed
     and the signatures have not happened, then it will automatically create a
     new version." The route has existed since tonight; this is the button. */
  const [confirmSweep, setConfirmSweep] = useState(false);
  const [confirmUnfreeze, setConfirmUnfreeze] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AccrualPlan | null>(null);
  /** The compact plan manager. See the button that opens it for why it has to
   *  exist at all now the deal rows are gone. */

  /**
   * TWO EXPANDERS, NOT TWO PAGES (Suren, Sep 1: "one tab, and then another tab
   * is the graph tab. That's all. The graph tab comes below, and the upper tab
   * is also a collapsible expander").
   *
   * The table opens, because it is the dashboard. The graph starts CLOSED
   * because it is the same numbers drawn — his own words on it: "it's just a
   * graph view of the same thing, yeah, correct, but make it collapsible."
   */
  const [tableOpen, setTableOpen] = useState(true);
  const [chartOpen, setChartOpen] = useState(false);

  /**
   * THE OPPORTUNITIES FILTER SET, HERE (Suren, Sep 1: "all of this filter that
   * we're doing on opportunity, same filters, give this here also") — plus the
   * one this page needs that Opportunities does not, the financial year.
   *
   * Empty means all, exactly as it does over there, so nothing has to be
   * cleared before the page reads normally.
   */
  const [fyFilter, setFyFilter] = useState<string[]>([]);
  const [groupFilter, setGroupFilter] = useState<string[]>([]);
  const [customerFilter, setCustomerFilter] = useState<string[]>([]);
  const [levelFilter, setLevelFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [ownerFilter, setOwnerFilter] = useState<string[]>([]);
  const [offeringFilter, setOfferingFilter] = useState<string[]>([]);
  const [closureFilter, setClosureFilter] = useState<string[]>([]);
  const [revenueTypeFilter, setRevenueTypeFilter] = useState<string[]>([]);

  const dealById = useMemo(
    () => new Map(deals.map((d) => [d.id, d])),
    [deals]
  );

  /* THE DEAL BEHIND A PLAN, IN FULL. `deals` is the flat picker the planner
     uses and carries only what a picker needs; the level, the ARR/OTS and the
     offering rows the ported filters ask about live on the opportunity. */
  const oppById = useMemo(
    () => new Map(opportunities.map((o) => [o.id, o])),
    [opportunities]
  );

  const groupNameOf = (o: Opportunity | undefined) => {
    const g = o?.customerId
      ? customerGroups.find((x) => x.customerIds.includes(o.customerId!))
      : undefined;
    return g?.name ?? "No customer group";
  };
  const offeringNameOf = (o: Opportunity | undefined) =>
    (o?.offeringIds[0]
      ? (offeringNames[o.offeringIds[0]] ?? o.offeringIds[0])
      : o?.offeringLabels[0]) ?? "No offering";

  /**
   * ONE DEAL AGAINST THE FILTER SET. A deal with no opportunity record behind
   * it cannot answer any of these questions, so it survives only while nothing
   * is being asked — dropping it silently would make a filter look like it had
   * deleted somebody's plan.
   */
  const matchesDeal = useMemo(() => {
    const anyDealFilter =
      groupFilter.length > 0 ||
      customerFilter.length > 0 ||
      levelFilter.length > 0 ||
      statusFilter.length > 0 ||
      ownerFilter.length > 0 ||
      offeringFilter.length > 0 ||
      closureFilter.length > 0 ||
      revenueTypeFilter.length > 0;
    return (id: string, customerName: string) => {
      if (!anyDealFilter) return true;
      const o = oppById.get(id);
      if (!o) return false;
      if (groupFilter.length && !groupFilter.includes(groupNameOf(o))) return false;
      if (
        customerFilter.length &&
        !customerFilter.some(
          (c) => (o.customer || customerName).trim().toLowerCase() === c.toLowerCase()
        )
      )
        return false;
      /* Revenue type on Opportunities means the funnel level, and it is READ
         off the confidence bar rather than typed — so it is asked the same way
         here, through `effectiveRevenueType`, or the two pages would disagree
         about the same deal. */
      if (levelFilter.length && !levelFilter.includes(effectiveRevenueType(o)))
        return false;
      if (statusFilter.length && !statusFilter.includes(o.status ?? "")) return false;
      if (ownerFilter.length && !ownerFilter.includes(o.owner ?? "")) return false;
      if (offeringFilter.length && !offeringFilter.includes(offeringNameOf(o)))
        return false;
      if (closureFilter.length && !closureFilter.includes(closureBandOf(o)))
        return false;
      if (revenueTypeFilter.length && !revenueTypeFilter.includes(o.revenueType ?? ""))
        return false;
      return true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    oppById,
    customerGroups,
    offeringNames,
    groupFilter,
    customerFilter,
    levelFilter,
    statusFilter,
    ownerFilter,
    offeringFilter,
    closureFilter,
    revenueTypeFilter,
  ]);

  /** A planned month survives the year filter, or the whole page stops
   *  counting it — "if he selects 27, 28, 29, 30, then I only look at that
   *  accrual". Nothing selected is every year, like every other filter here. */
  const monthInFy = useMemo(() => {
    if (fyFilter.length === 0) return () => true;
    const wanted = new Set(fyFilter);
    return (month: string) => {
      const key = fyKeyOf(month);
      return !!key && wanted.has(key);
    };
  }, [fyFilter]);

  /** THE PLANS THE FILTERS LEAVE STANDING, and only the months inside them
   *  that the year filter allows. Every total, the chart and the export read
   *  this, so the year filter cannot narrow one of them and not the others. */
  const linesInScope = useMemo(
    () => (plan: AccrualPlan) => plan.lines.filter((l) => monthInFy(l.month)),
    [monthInFy]
  );

  /* A plan is judged against its deal every time this renders, so the flag
     turns itself on the moment the month rolls over. A stored boolean would
     have needed somebody to write to it to become true, which is exactly the
     silence the module exists to break. */
  const judged = useMemo(
    () =>
      state.plans.map((plan) => ({
        plan,
        deal: dealById.get(plan.opportunityId),
        verdict: judgePlan(plan, dealById.get(plan.opportunityId)),
      })),
    [state.plans, dealById]
  );

  /** Open deals with money on them and no plan at all. Question 1. */
  const missing = useMemo(() => {
    const planned = new Set(state.plans.map((p) => p.opportunityId));
    return deals.filter(
      (d) =>
        !planned.has(d.id) &&
        d.value > 0 &&
        d.status !== "Won" &&
        d.status !== "Lost"
    );
  }, [deals, state.plans]);

  const flagged = judged.filter((j) => j.verdict.invalid);
  const plannedTotal = judged.reduce((s, j) => s + planTotal(j.plan), 0);

  const frozenThisMonth = state.snapshots.some(
    (s) => s.id === monthKey(new Date())
  );

  const snapshot = useMemo(() => {
    const thisMonth = monthKey(new Date());
    const earlier = state.snapshots.filter((s) => s.id < thisMonth);
    return earlier.length ? earlier[earlier.length - 1] : null;
  }, [state.snapshots]);

  const deviation = useMemo(
    () => buildDeviation(state.plans, snapshot),
    [state.plans, snapshot]
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return judged
      .filter((j) => {
        if (only === "flagged" && !j.verdict.invalid) return false;
        if (only === "missing") return false;
        if (!matchesDeal(j.plan.opportunityId, j.plan.customer)) return false;
        /* A plan with no month left inside the chosen years is not part of
           this accrual at all, so it leaves rather than sitting at $0. */
        if (linesInScope(j.plan).length === 0) return false;
        if (!q) return true;
        return [j.plan.opportunityName, j.plan.customer, j.plan.offeringLabel ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      /* Biggest first, always. The sort control went with the deal rows it
         ordered — what is left reads by month or by group, neither of which a
         sort order touches, and a live control that changes nothing on screen
         is worse than no control. */
      .sort((a, b) => planTotal(b.plan) - planTotal(a.plan));
  }, [judged, query, only, matchesDeal, linesInScope]);

  /** WHAT IS ACTUALLY PLANNED IN THE CHOSEN YEARS. The fold line above the
   *  table reads this, so a collapsed dashboard still says how much money is
   *  behind it — a fold that hides the number as well as the table is just a
   *  thing you have to open. */
  const plannedInScope = useMemo(
    () =>
      shown.reduce(
        (s, j) => s + linesInScope(j.plan).reduce((a, l) => a + l.amount, 0),
        0
      ),
    [shown, linesInScope]
  );

  /** The set of deals still standing, so the summary table above narrows with
   *  the same filter press the chart does. */
  const shownOpportunities = useMemo(() => {
    const planned = new Map(state.plans.map((p) => [p.opportunityId, p]));
    return opportunities.filter((o) => {
      if (!matchesDeal(o.id, o.customer)) return false;
      const plan = planned.get(o.id);
      /* A DEAL WITH NO PLAN IS NOT PART OF A YEAR'S ACCRUAL. With no year
         chosen it stays on the table, uncounted, exactly as it always has —
         that is how the page names the deals nobody has planned. The moment a
         year IS chosen the question becomes "what accrues in FY27", and a deal
         with no months at all has no answer to it, so it leaves rather than
         padding the table with seventy blank rows. */
      if (fyFilter.length > 0) return !!plan && linesInScope(plan).length > 0;
      return !plan || linesInScope(plan).length > 0;
    });
  }, [opportunities, state.plans, matchesDeal, linesInScope, fyFilter]);

  /**
   * THE SHAPE OF THE YEAR, NOT A LIST OF NUMBERS (Anir, Aug 26: "the revenue
   * accruals page is not visual at all").
   *
   * Every visible plan summed by month. The SOLID part of a bar is money on a
   * plan nobody has to revisit; the HATCHED part is money sitting on a flagged
   * plan. That is the colour law this app already runs on — solid counts,
   * striped is somebody's word until they go and fix it.
   */
  const monthChart = useMemo(() => {
    const byMonth = new Map<string, { total: number; flagged: number }>();
    for (const { plan, verdict } of shown) {
      for (const line of linesInScope(plan)) {
        const cur = byMonth.get(line.month) ?? { total: 0, flagged: 0 };
        cur.total += line.amount;
        if (verdict.invalid) cur.flagged += line.amount;
        byMonth.set(line.month, cur);
      }
    }
    const thisMonth = monthKey(new Date());
    return [...byMonth.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(0, 18)
      .map(([month, v]) => ({
        label: monthLabel(month).replace(" 20", " '"),
        value: v.total,
        pending: v.flagged || undefined,
        /* A month already behind us wears amber whatever else is true: that
           money was supposed to have landed by now. */
        color: month < thisMonth ? AMBER : "#0071E3",
        tip: [
          { name: "On plan", value: formatMoney(v.total - v.flagged) },
          ...(v.flagged
            ? [{ name: "On a flagged plan", value: formatMoney(v.flagged) }]
            : []),
          ...(month < thisMonth
            ? [{ name: "Month has passed", sub: "needs re-planning" }]
            : []),
        ],
      }));
  }, [shown, linesInScope]);

  /**
   * ONE LINE PER COMPANY when the page chart is flipped to Line (Anir,
   * Aug 27: "I meant for each company"). Bars answer "how much lands in
   * March"; the lines answer "whose money is that" — the biggest five
   * customers each get a line in their card's accent, everything smaller
   * shares a grey one so the chart never becomes spaghetti.
   */
  const companyLines = useMemo(() => {
    const months = [
      ...new Set(
        shown.flatMap(({ plan }) => linesInScope(plan).map((l) => l.month))
      ),
    ]
      .sort()
      .slice(0, 18);
    const byCustomer = new Map<string, Map<string, number>>();
    for (const { plan } of shown) {
      const mine = byCustomer.get(plan.customer) ?? new Map<string, number>();
      for (const line of linesInScope(plan))
        mine.set(line.month, (mine.get(line.month) ?? 0) + line.amount);
      byCustomer.set(plan.customer, mine);
    }
    const ranked = [...byCustomer.entries()].sort(
      (a, b) =>
        [...b[1].values()].reduce((x, y) => x + y, 0) -
        [...a[1].values()].reduce((x, y) => x + y, 0)
    );
    const top = ranked.slice(0, 5).map(([customer, mine]) => ({
      label: customer,
      color: accentFor(customer),
      points: months.map((m) => mine.get(m) ?? 0),
    }));
    const rest = ranked.slice(5);
    if (rest.length > 0)
      top.push({
        label: rest.length === 1 ? rest[0][0] : `${rest.length} more`,
        color: "#8E98A8",
        points: months.map((m) =>
          rest.reduce((sum, [, mine]) => sum + (mine.get(m) ?? 0), 0)
        ),
      });
    return top;
  }, [shown, linesInScope]);

  /**
   * EXPORT, BECAUSE THIS MODULE REPLACES A SPREADSHEET. Suren's whole reason
   * for it was "I don't want you guys to maintain an Excel sheet" — the way to
   * win that argument is for the app to hand over the sheet on demand, not to
   * make the sheet unreachable. One row per month per deal, which is the shape
   * anybody would pivot.
   */
  /* NOTHING ON SCREEN, NOTHING TO EXPORT (Anir, Aug 14, on the Reports
     button doing exactly this): it stayed live on an empty page and handed
     back a spreadsheet holding one row of headings. Reports learned that;
     this did not. `shown` is the FILTERED list, so this also covers having
     filtered everything away. */
  const nothingToExport = shown.length === 0;

  /**
   * WHAT THE FILTER BUTTON OFFERS. Every list is read off the data actually on
   * this page, so a year, an owner or a closure quarter nobody has is never
   * offered — the same rule the Opportunities filter follows, and the reason
   * its menu never shows a choice that empties the page.
   */
  const filterOptions = useMemo(() => {
    /* THE YEARS THAT EXIST, not a hardcoded 27-28-29-30. He named those four
       because they are the ones in front of him; a plan booked into FY31 has
       to be selectable the day somebody writes it. */
    const years = [
      ...new Set(
        state.plans.flatMap((p) =>
          p.lines.map((l) => fyKeyOf(l.month)).filter((k): k is string => !!k)
        )
      ),
    ].sort();
    const customers = [...new Set(opportunities.map((o) => o.customer))]
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    const owners = [...new Set(opportunities.map((o) => o.owner ?? ""))]
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    const offerings = [...new Set(opportunities.map((o) => offeringNameOf(o)))].sort(
      (a, b) => a.localeCompare(b)
    );
    const closures = [...new Set(opportunities.map((o) => closureBandOf(o)))].sort(
      (a, b) => a.localeCompare(b)
    );
    return { years, customers, owners, offerings, closures };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.plans, opportunities, offeringNames]);

  function clearAllFilters() {
    setOnly("all");
    setFyFilter([]);
    setGroupFilter([]);
    setCustomerFilter([]);
    setLevelFilter([]);
    setStatusFilter([]);
    setOwnerFilter([]);
    setOfferingFilter([]);
    setClosureFilter([]);
    setRevenueTypeFilter([]);
  }

  function exportCsv() {
    const rows: (string | number)[][] = [];
    for (const { plan, verdict } of shown) {
      for (const line of linesInScope(plan)) {
        rows.push([
          plan.opportunityName, plan.customer, plan.offeringLabel ?? "",
          plan.contractValue, monthLabel(line.month), line.month, line.amount,
          verdict.invalid ? "FLAGGED" : "On plan", verdict.headline,
          plan.updatedBy, plan.updatedAt.slice(0, 10),
        ]);
      }
    }
    downloadCSV(
      `freyr-revenue-accruals-${new Date().toISOString().slice(0, 10)}.csv`,
      toCSV(
        ["Opportunity", "Customer", "Offering", "Contract value", "Month",
         "Month key", "Amount", "Flag", "Why", "Updated by", "Updated"],
        rows
      )
    );
    toast(`${rows.length} monthly ${rows.length === 1 ? "row" : "rows"} exported.`);
  }

  async function post(body: Record<string, unknown>, success: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/revenue-accruals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        toast(data?.error || "That didn't save.", "error");
        return false;
      }
      if (data.state) setState(data.state);
      toast(success);
      router.refresh();
      return true;
    } catch {
      toast("That didn't save.", "error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Revenue Accruals"
        subtitle="When the money on each deal is planned to land, month by month, and what moved since last month. Nothing here reschedules itself."
        action={
          canWrite ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setConfirmFreeze(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border-light bg-white px-3.5 py-2 text-[13px] font-semibold text-text-secondary transition-colors hover:border-blue-subtle hover:text-blue-primary"
              >
                <Lock size={14} strokeWidth={2.2} />
                {frozenThisMonth ? "Re-freeze this month" : "Freeze this month"}
              </button>
              {frozenThisMonth && (
                <button
                  type="button"
                  onClick={() => setConfirmUnfreeze(monthKey(new Date()))}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border-light bg-white px-3 py-2 text-[13px] font-semibold text-text-secondary transition-colors hover:border-blue-subtle hover:text-blue-primary"
                >
                  <Unlock size={14} strokeWidth={2.2} /> Unfreeze
                </button>
              )}
              {/* A BUTTON, NOT A TIMER, exactly like Freeze beside it. This one
                  writes a version onto every plan whose deal should have been
                  signed by now, which is the last thing that should ever fire
                  unattended. */}
              <button
                type="button"
                onClick={() => setConfirmSweep(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border-light bg-white px-3.5 py-2 text-[13px] font-semibold text-text-secondary transition-colors hover:border-blue-subtle hover:text-blue-primary"
              >
                <ScanLine size={14} strokeWidth={2.2} /> Check signing dates
              </button>
              <button
                type="button"
                onClick={() => setPlanning({ dealId: "" })}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-primary px-4 py-2 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90"
              >
                <Plus size={15} strokeWidth={2.4} /> Plan a deal
              </button>
            </div>
          ) : (
            /* THE SHIELD IN THE TOP BAR ALREADY SAYS THIS (Anir, Sep 1:
                "I don't want you to say that"). A pill announcing what you
                CANNOT do is a permanent apology in the header of every page a
                view-only account opens, and the access shield answers it on
                hover already. The mock notice stays — that one says the DATA
                is not real, which nothing else says. */
            live ? null : (
              <span className="rounded-full bg-[rgba(0,113,227,0.08)] px-2.5 py-1 text-[11px] font-semibold text-blue-primary">
                Sample plan. Switch to Real mode to work the live numbers
              </span>
            )
          )
        }
      />

      {/* THREE VALUES, THE ACCRUAL ONES (Suren, Aug 30: "which ones you take
          off, TCV, ACV, all goes away. Opportunities are fine... just say 79
          opportunities here, total all 79 deals" — plus the accrued total).
          No ACV anywhere on this page: when they sell, the rule takes the
          total contract value and splits it, so ACV has nothing to do here. */}
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          icon={Briefcase}
          label="Opportunities"
          value={String(opportunities.length)}
          sub={`${state.plans.length} of them planned`}
        />
        <StatTile
          icon={Coins}
          label="Total accrued revenue"
          value={formatMoney(plannedTotal)}
          sub={`${state.plans.length} ${state.plans.length === 1 ? "plan" : "plans"} across the months`}
        />
        <StatTile
          icon={AlertTriangle}
          label="Flagged"
          value={String(flagged.length)}
          color={AMBER}
          warn={flagged.length > 0}
          sub="close month passed, needs re-planning"
        />
        <StatTile
          icon={CalendarRange}
          label="No accrual numbers"
          value={String(missing.length)}
          color={AMBER}
          warn={missing.length > 0}
          sub="open deals with nothing planned"
        />
        {/* NO FIFTH CARD. Four fit the row; the fifth wrapped onto a line
            of its own with three empty columns beside it (Anir, Aug 30: "why
            the fuck is there a fifth card... it says the fifth card is on its
            own line"). It was also the emptiest of them — "freeze a month to
            start comparing" until somebody does — and the Month-on-month gap
            tab below already answers what moved, with the deals named. */}

      </div>

      {/* TWO TABS, AND HE NAMED BOTH (Suren, Sep 1: "you call them as this is
          an accrual dashboard, okay? In the next tab, you call it deviations,
          okay").

          The keys are untouched — `plans` and `deviation` are what every
          link, test and remembered state in this app already says. This is
          what the tab is CALLED, not where it lives. */}
      <div className="mt-4 flex items-center gap-1 border-b border-border-light">
        {(
          [
            ["plans", "Accrual dashboard"],
            ["deviation", "Deviations"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "-mb-px cursor-pointer border-b-2 px-3 pb-2.5 text-[14px] transition-colors",
              tab === key
                ? "border-blue-primary font-semibold text-blue-primary"
                : "border-transparent font-medium text-text-secondary hover:text-text-primary"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "plans" ? (
        <div key="plans" className="tab-panel">
          {/* The toolbar needs air under the stat tiles (Anir, Aug 26: "the search
              bar is touching the cards"). Every other list page spaces this row;
              these three called PageToolbar bare and it sat flush against the
              tiles above it. */}
          <PageToolbar
            className="mt-4"
            query={query}
            onQuery={setQuery}
            placeholder="Search by deal, customer or offering"
            searchAriaLabel="Search accrual plans"
            onClearAll={clearAllFilters}
            /* ONE FILTER BUTTON, NOT THREE SELECTS ON THE SHELF (Anir,
               Sep 1: "this UI is so weird. It's so fucking busy... maybe just
               have a filter button instead and have all those things there").

               PageToolbar has had a proper Filter button all along — the Goal
               Master and Customers both use it — and this page simply never
               asked for it, passing its selects as loose extras instead.

               THE SET IS OPPORTUNITIES' OWN (Suren, Sep 1: "all of this filter
               that we're doing on opportunity, same filters, give this here
               also") — customer group, customer, revenue type, status, owner,
               offering, closure date, ARR/OTS, in that order, off the same
               fields and the same colours. Confidence is the one thing on that
               menu NOT ported: this page has no confidence bar and the deals
               it plans are all past the point where the band is the question.

               The financial year leads, because it is the one filter that is
               about the accrual rather than about the deal.

               `only` is single-choice, so it takes the first value it is
               handed and an empty array means the default; every other group
               here is a true multi-select, empty meaning all. */
            filterAriaLabel="Filter accrual plans"
            groups={[
              {
                /* FINANCIAL YEARS, LABELLED THE WAY HE SAYS THEM (Suren,
                   Sep 1: "you have to clearly give the year detail: 27, 28,
                   29, 30"). Pick none and the accrual runs across every year,
                   which is his own rule: "if he selects all the years, then
                   the accrual is going across all years". */
                key: "fy",
                label: "Financial year",
                values: fyFilter,
                onChange: setFyFilter,
                options: filterOptions.years.map((k) => ({
                  value: k,
                  label: fyLabelOf(k),
                  color: "#0071E3",
                })),
              },
              {
                key: "group",
                label: "Customer group",
                values: groupFilter,
                onChange: setGroupFilter,
                options: [
                  ...customerGroups.map((g) => ({
                    value: g.name,
                    label: g.name,
                    color: g.color,
                  })),
                  {
                    value: "No customer group",
                    label: "No customer group",
                    color: "#8E98A8",
                  },
                ],
              },
              {
                key: "customer",
                label: "Customer",
                values: customerFilter,
                onChange: setCustomerFilter,
                options: filterOptions.customers.map((c) => ({
                  value: c,
                  label: c,
                  logoName: c,
                })),
              },
              {
                key: "level",
                label: "Revenue type",
                values: levelFilter,
                onChange: setLevelFilter,
                options: OPPORTUNITY_LEVELS.map((l) => ({
                  value: l,
                  label: l,
                  color: LEVEL_COLOR[l],
                })),
              },
              {
                key: "status",
                label: "Status",
                values: statusFilter,
                onChange: setStatusFilter,
                options: OPPORTUNITY_STATUSES.map((st) => ({
                  value: st,
                  label: st,
                  color: STATUS_COLOR[st],
                })),
              },
              {
                key: "owner",
                label: "Owner",
                values: ownerFilter,
                onChange: setOwnerFilter,
                options: [
                  ...filterOptions.owners.map((n) => ({
                    value: n,
                    label: n,
                    avatarName: n,
                  })),
                  { value: "", label: "Unassigned", color: "#8E98A8" },
                ],
              },
              {
                key: "offering",
                label: "Offering",
                values: offeringFilter,
                onChange: setOfferingFilter,
                options: filterOptions.offerings.map((n) => ({
                  value: n,
                  label: n,
                  color: n === "No offering" ? "#8E98A8" : "#B4318F",
                })),
              },
              {
                key: "closure",
                label: "Closure date",
                values: closureFilter,
                onChange: setClosureFilter,
                options: filterOptions.closures.map((n) => ({
                  value: n,
                  label: n,
                  color: n === "No date" ? "#8E98A8" : "#0F766E",
                })),
              },
              {
                key: "revenueType",
                label: "ARR / OTS",
                values: revenueTypeFilter,
                onChange: setRevenueTypeFilter,
                options: [
                  { value: "ARR", label: "ARR — recurring", color: "#0F766E" },
                  { value: "OTS", label: "OTS — one-time", color: "#B4318F" },
                  { value: "", label: "Not set", color: "#8E98A8" },
                ],
              },
              {
                key: "show",
                label: "Show",
                values: only === "all" ? [] : [only],
                onChange: (next) =>
                  setOnly((next[0] as typeof only) ?? "all"),
                options: [
                  { value: "flagged", label: `Flagged (${flagged.length})`, color: AMBER },
                  { value: "missing", label: `Need a plan (${missing.length})`, color: AMBER },
                ],
              },
            ]}
            display={
              <>
                {/* MONTHLY / QUARTERLY BELONGS ON THE TOOLBAR LINE.
                    Anir, Sep 1: "this filter is supposed to be with the
                    filter, the quarterly thing. Move it." It had been sitting
                    inside the card on the VIEW row, so the two controls that
                    decide what the table shows lived on different lines with a
                    card border between them, and Opportunities already put its
                    period selector up here. Same place on both screens now. */}
                <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.07em] text-text-tertiary">
                  Show
                </span>
                  <ColorSelect
                    value={accrTimeline}
                    ariaLabel="Accrual timeline"
                    onChange={(v) => setAccrTimeline(v as Timeline)}
                    /* THE ARROW SAT MILES FROM THE WORD (Anir, Sep 1: "the
                       dropdown arrow on the right side looks a little bit
                       weird"). A fixed 150px trigger around a nine-letter
                       label leaves the chevron floating at the far edge with a
                       lake of white between them, which reads as a broken
                       control rather than a tight one. It sizes to its own
                       label now. */
                    dense
                    collapsible={false}
                    className="shrink-0"
                    options={TIMELINES.map((t) => ({
                      value: t.key,
                      label: t.label,
                      color: "#7C3AED",
                    }))}
                  />
                {/* NO "DELETE A PLAN" HERE.
                    Anir, Sep 1: "did they ask for a delete plan button here?
                    ... remove the delete a plan button."

                    He is right that nobody asked for it. It was mine: when
                    Suren had the deal rows taken off the bottom of this page,
                    those rows carried the only delete path in the module, so I
                    put deletion back as a dialog rather than let a layout
                    instruction quietly make accrual plans permanent. That was
                    a decision to flag, not to make silently, and he has now
                    made it: the button goes.

                    So a plan currently cannot be deleted from anywhere. That
                    is the deliberate consequence of his instruction and not an
                    oversight; the moment somebody needs to delete one, this is
                    the note that says why they cannot. */}
                <PriorityTooltip label="Export CSV">
                  <button
                    type="button"
                    onClick={exportCsv}
                    aria-label="Export CSV"
                    disabled={nothingToExport}
                    title={
                      nothingToExport
                        ? "Nothing to export yet: no plans are showing."
                        : undefined
                    }
                    className="flex items-center rounded-md border border-border px-3 py-2 text-[13px] font-medium text-text-secondary transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Download size={16} strokeWidth={1.5} />
                    <PriorityLabel>Export CSV</PriorityLabel>
                  </button>
                </PriorityTooltip>
              </>
            }
          />

          {only === "missing" ? (
            missing.length === 0 ? (
              <EmptyState
                icon={CalendarRange}
                title="Every open deal has an accrual plan"
                description="Nothing is missing its numbers. Switch back to All plans to see them."
              />
            ) : (
              <section className="mt-4 rounded-xl border border-border-light bg-white p-5 shadow-card">
                <h2 className="flex items-center gap-2 text-[15px] font-semibold text-text-primary">
                  <AlertTriangle size={15} strokeWidth={2} style={{ color: AMBER }} />
                  Deals with money but no plan
                  <InfoHint text="Open deals carrying money that nobody has spread across months yet. Until a deal has an accrual plan its revenue cannot appear in any month, so it is missing from every forecast this page produces." />
                </h2>
                <p className="mt-0.5 text-[12.5px] text-text-secondary">
                  These {missing.length} open{" "}
                  {missing.length === 1 ? "deal carries" : "deals carry"}{" "}
                  {formatMoney(missing.reduce((s, d) => s + d.value, 0))}, and
                  nobody has said which months that money is expected in. Until
                  they do, none of it appears in any month on this page.
                </p>
                <div className="mt-3 divide-y divide-border-light">
                  {missing.map((d) => (
                    <div
                      key={d.id}
                      className="flex items-center gap-3 py-2.5"
                      data-missing-plan={d.id}
                    >
                      <CompanyLogo name={d.customer} className="h-7 w-7 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold text-text-primary">
                          {d.name}
                        </span>
                        <span className="block truncate text-[12px] text-text-secondary">
                          {d.customer}
                          {d.estSignDate && ` · est. ${formatDate(d.estSignDate)}`}
                        </span>
                      </span>
                      <span className="shrink-0 text-[13px] font-semibold tnum text-text-primary">
                        {formatMoney(d.value)}
                      </span>
                      {canWrite && (
                        <button
                          type="button"
                          onClick={() => setPlanning({ dealId: d.id })}
                          className="shrink-0 rounded-lg bg-blue-primary px-3 py-1.5 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90"
                        >
                          Plan it
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )
          ) : shown.length === 0 ? (
            <EmptyState
              icon={CalendarRange}
              title={
                state.plans.length === 0
                  ? "No accrual plan yet"
                  : "Nothing matches that"
              }
              description={
                state.plans.length === 0
                  ? "An accrual plan says when a deal's money is expected to land, month by month. Press “Plan a deal” to pick one and set its months."
                  : "Clear the search or the filter."
              }
            />
          ) : (
            <>
            {/* HOW REVENUE IS ACCRUING ACROSS, in the same grouped table
                the pipeline uses (Suren, Aug 30: "revenue accruals mean how
                revenue is accruing across... when you say monthly, monthly,
                monthly, all the way to yearly, this has to be a scrollable
                thing").

                THE MONEY IS EACH PLAN'S MONTHS, not the deal's closure date.
                That is the whole difference between this page and the
                pipeline: a deal there is worth its TCV on the day it signs,
                and here that TCV is spread over the months somebody planned it
                into. Total is the sum of those months, so the row always adds
                up across — an accrual table that does not reconcile is worse
                than no table.

                Deals with no plan contribute nothing and are counted in the
                tile above, rather than padding a total nobody has planned. */}
            <section className="mt-4 rounded-xl border border-border-light bg-white p-4 shadow-card">
              {/* NO HEADING (Anir, Sep 1: "You don't need to say how the
                  revenue accrues. Just literally put the view stuff at the top
                  in line with the quarterly dropdown, and then it's just that
                  simple"). The page is called Revenue Accruals and the table
                  is the only thing in the card; a heading saying so again is
                  a third tier of chrome over one table. The picker moves onto
                  the chips' own row, where it belongs — both answer "how do
                  you want this cut".

                  AND WHY THE EXPANDER IS A FACT LINE, NOT A TITLE (Suren,
                  Sep 1: "the upper tab is also a collapsible expander"). A
                  fold needs something to press, and the app's own idiom is a
                  heading you press with a chevron that turns. A heading here
                  would be the tier Anir struck out, so the press target says
                  what is behind the fold instead of naming it again — the
                  count and the money, which is a breakdown rather than a
                  restatement. Open by default: this table IS the dashboard. */}
              <button
                type="button"
                onClick={() => setTableOpen((v) => !v)}
                aria-expanded={tableOpen}
                className="group flex w-full cursor-pointer items-center justify-between gap-3 text-left"
              >
                <span className="min-w-0 text-[12.5px] text-text-secondary">
                  <b className="text-text-primary tnum">{formatMoney(plannedInScope)}</b>{" "}
                  planned
                  {" · "}
                  <b className="text-text-primary tnum">{shown.length}</b> of{" "}
                  <b className="text-text-primary tnum">{shownOpportunities.length}</b>{" "}
                  {shownOpportunities.length === 1 ? "deal" : "deals"} carry months
                </span>
                <ChevronDown
                  size={16}
                  strokeWidth={2.2}
                  aria-hidden="true"
                  className={cn(
                    "shrink-0 text-text-tertiary transition-transform duration-200 group-hover:text-blue-primary",
                    tableOpen && "rotate-180"
                  )}
                />
              </button>
              {tableOpen && (
              <div className="mt-3">
              <OpportunitySummary
                /* THE FILTERS ACT ON THE TABLE, not on a list underneath it.
                   That is what "same filters, give this here also" has to mean
                   now the rows are gone: pressing Customer or FY28 redraws the
                   dashboard itself. */
                deals={shownOpportunities}
                order={accrDims}
                onReorder={setAccrDims}
                measure="tcv"
                timeline={accrTimeline}
                groupNameFor={(d) => {
                  const g = d.customerId
                    ? customerGroups.find((x) => x.customerIds.includes(d.customerId!))
                    : undefined;
                  return g?.name ?? "No customer group";
                }}
                offeringNameFor={(d) =>
                  (d.offeringIds[0]
                    ? (offeringNames[d.offeringIds[0]] ?? d.offeringIds[0])
                    : d.offeringLabels[0]) ?? "No offering"
                }
                onOpenDeal={(id) =>
                  /* ONE SCREEN FOR ADD AND EDIT — and this reverses an earlier
                     call, so both are on the record.

                     Anir, Aug 30: "I'm pretty sure he wants it to be a page
                     instead of a popup" — because a twelve-month spread scrolls
                     inside a fixed dialog sitting on top of the table it edits.
                     That reasoning is real and this change does not make it
                     untrue.

                     Suren, Sep 1, with the page and the dialog open beside each
                     other: "I don't want a different screen. It has to be
                     consistent... this screen is confusing, this screen is
                     better", pointing at the dialog. He also asked why editing
                     an accrual looked nothing like adding one, which is what
                     three entry points to two screens produced.

                     So all three doors now open the dialog. startPlan already
                     took the saved plan for the pencil; this hands it the same
                     thing. */
                  /* The dialog finds the deal's saved plan itself, out of
                     the `plans` it is handed, so all three doors say the same
                     one thing: open the planner on this deal. */
                  setPlanning({ dealId: id })
                }
                spread={{
                  /* `linesInScope` and not `plan.lines`: a year the filter
                     excluded must be gone from the table's own columns too,
                     or the chart below and the table above would be totalling
                     two different accruals. */
                  periodsOf: (d, tl) => {
                    const plan = state.plans.find((p) => p.opportunityId === d.id);
                    if (!plan) return [];
                    const keys = new Set<string>();
                    for (const l of linesInScope(plan)) {
                      const k = periodKeyOf(`${l.month}-01`, tl);
                      if (k) keys.add(k);
                    }
                    return [...keys];
                  },
                  amountIn: (d, period, _measure) => {
                    const plan = state.plans.find((p) => p.opportunityId === d.id);
                    if (!plan) return 0;
                    return linesInScope(plan).reduce(
                      (sum, l) =>
                        periodKeyOf(`${l.month}-01`, accrTimeline) === period
                          ? sum + (l.amount || 0)
                          : sum,
                      0
                    );
                  },
                }}
              />
              </div>
              )}
            </section>

            {/* WHEN THE MONEY IS PLANNED TO LAND, drawn — AND FOLDED SHUT
                (Suren, Sep 1: "it's just a graph view of the same thing, yeah,
                correct, but make it collapsible", and "the graph tab comes
                below").

                It really is the same numbers as the table above it, which is
                the whole argument for the fold and the whole argument for it
                starting closed: a page that opens with the same figures drawn
                twice makes the reader work out which one to trust. Pressing
                the heading is how everything else in this app folds — the
                summary's own chart, the goal categories, the deal form.

                A column per month across everything the filters leave on
                screen, so a filter press redraws this too. */}
            {monthChart.length > 0 && (
              <section className="mt-4 rounded-xl border border-border-light bg-white p-5 pb-2.5 shadow-card">
                {/* THE CONTROLS READ LEFT TO RIGHT: what it is, then what it
                    draws, then whether it is open.

                    Anir, Sep 1: "this looks weird too. The dropdown arrow is
                    probably supposed to be at the end, right? There's a
                    question mark, and the bars chooser is all fucked up."

                    It was: the fold button spanned the whole row with
                    justify-between, so its chevron was flung to the middle of
                    the row and the hint and the Bars picker trailed AFTER it.
                    The collapse control, which acts on the whole section, sat
                    inside the row it collapses with two unrelated controls to
                    its right.

                    Now the title owns the left, its hint sits beside it the way
                    every other hint in this app does (never inside the fold
                    button, which is a button inside a button and breaks
                    hydration), and the right cluster is the picker followed by
                    the collapse toggle, last, in a round target the same size
                    as the hint so the two line up. */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-start gap-2">
                  <button
                    type="button"
                    onClick={() => setChartOpen((v) => !v)}
                    aria-expanded={chartOpen}
                    className="group flex min-w-0 cursor-pointer items-start gap-3 text-left"
                  >
                    <span className="flex min-w-0 flex-wrap items-baseline gap-x-2.5">
                      <span className="flex items-center gap-2 text-[15px] font-semibold text-text-primary">
                        <CalendarRange size={15} strokeWidth={2} className="text-blue-primary" />
                        When this money is planned to land
                      </span>
                      <span className="text-[12.5px] text-text-secondary">
                        {formatMoney(monthChart.reduce((s, m) => s + m.value, 0))} across{" "}
                        {monthChart.length} {monthChart.length === 1 ? "month" : "months"}
                        {monthChart.some((m) => m.pending) && (
                          <>
                            {" · "}
                            <b style={{ color: AMBER }}>
                              {formatMoney(
                                monthChart.reduce((s, m) => s + (m.pending ?? 0), 0)
                              )}{" "}
                              needs re-planning
                            </b>
                          </>
                        )}
                      </span>
                    </span>
                  </button>
                  {/* Beside the heading, never inside the fold button: InfoHint
                      renders a <button>, and a button inside a button is
                      invalid HTML that fails hydration. */}
                  <div className="flex h-6 shrink-0 items-center">
                    <InfoHint text="Every plan on screen, summed by month. A solid column is money on a plan nobody needs to revisit. The hatched part is money sitting on a flagged plan, and an amber column is a month that has already gone by." />
                  </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {/* The picker only appears once the chart it redraws is on
                        screen. */}
                    {chartOpen && (
                      <AccrualChartPicker
                        value={kindFor("page")}
                        onChange={(k) => setKindFor("page", k)}
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => setChartOpen((v) => !v)}
                      aria-expanded={chartOpen}
                      aria-label={chartOpen ? "Hide the chart" : "Show the chart"}
                      className="group flex h-6 w-6 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-blue-light"
                    >
                      <ChevronDown
                        size={15}
                        strokeWidth={2.2}
                        aria-hidden="true"
                        className={cn(
                          "text-text-tertiary transition-transform duration-200 group-hover:text-blue-primary",
                          chartOpen && "rotate-180"
                        )}
                      />
                    </button>
                  </div>
                </div>
                {chartOpen && (
                <div className="mt-3">
                  {/* No fillCard here: it puts h-full on the chart, which
                      needs a parent with a definite height and collapses every
                      bar to a hairline without one. Same call shape the goal
                      charts use. */}
                  <AccrualChart
                    kind={kindFor("page")}
                    data={monthChart}
                    series={companyLines.length > 0 ? companyLines : undefined}
                    height={180}
                  />
                  {kindFor("page") === "line" && companyLines.length > 1 && (
                    /* The key for the lines — each name in its line's colour,
                       the same colour that company's card wears below. */
                    <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-text-secondary">
                      {companyLines.map((l) => (
                        <span key={l.label} className="inline-flex items-center gap-1.5">
                          <span
                            aria-hidden="true"
                            className="h-[3px] w-4 rounded-full"
                            style={{ background: l.color }}
                          />
                          {l.label}
                        </span>
                      ))}
                    </p>
                  )}
                </div>
                )}
              </section>
            )}

            {/* THE DEAL ROWS ARE GONE (Suren, Sep 1: "remove these deals at
                the bottom", and again on the shape of the page: "there's only
                a dashboard, so you have a customer group. You have all the
                deals showing here in a certain fashion: one tab, and then
                another tab is the graph tab. That's all… and this third tab I
                don't need").

                What stood here was a card per plan — DEAL / SHAPE / PLANNED /
                EST. CLOSE / LAST UPDATED / ACTIONS, with a sparkline, a
                per-card chart picker and a month-by-month column inside each
                fold. Every figure on it is in the table above, cut the way you
                ask for it, so it was a third telling of the same accrual under
                a second one.

                WHAT WENT WITH IT, AND WHERE IT LIVES NOW. The row carried the
                only controls in the module, so removing it silently would have
                taken away things nobody asked to lose:

                  · OPEN THE DEAL — the opportunity is one click from its row
                    in the table above, which links out the same way.
                  · EDIT A PLAN — every deal row in the summary table opens
                    the accrual planner, the same dialog "Plan a deal" and the
                    pencil open. It went through /revenue-accruals/[id] until
                    Sep 1; that page is gone, because Suren wanted one screen.
                  · DELETE A PLAN — had NO other door anywhere in the module,
                    and the planner has no delete of its own. It is the
                    "Delete a plan" control on the toolbar above.

                The sort and the row grouping went too: both existed only to
                order these rows, and a control that changes nothing on screen
                is worse than no control. */}
            </>
          )}
        </div>
      ) : (
        <div key="deviation" className="tab-panel mt-4">
          {!deviation.againstMonth ? (
            <EmptyState
              icon={Lock}
              title="No frozen sheet to compare against yet"
              description="Freeze a month once and every later change is measured against it: which months moved, and which deals moved them. Freezing at the end of each month is what makes the month-on-month gap possible."
            />
          ) : (
            <>
              <section className="rounded-xl border border-border-light bg-white p-5 shadow-card">
                <h2 className="flex items-center gap-2 text-[15px] font-semibold text-text-primary">
                  <CalendarRange size={15} strokeWidth={2} className="text-blue-primary" />
                  What each month says now, against {monthLabel(deviation.againstMonth)}
                  <InfoHint text="The frozen sheet is what every plan said when the month was closed. This compares today's plans against it, so a month that lost money shows the amount and the deals that caused it." />
                </h2>
                <p className="mt-0.5 text-[12.5px] text-text-secondary">
                  Frozen {deviation.takenAt ? formatDate(deviation.takenAt) : "—"}.
                  Across every month, the plan is{" "}
                  <b
                    className="tnum"
                    style={{
                      color: deviation.totalDelta < 0 ? AMBER : "#16A34A",
                    }}
                  >
                    {deviation.totalDelta >= 0 ? "+" : "-"}
                    {formatMoney(Math.abs(deviation.totalDelta))}
                  </b>{" "}
                  against that sheet.
                </p>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left">
                    <thead>
                      <tr className="border-b border-border-light text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary [&>th]:whitespace-nowrap [&>th]:py-2">
                        <th className="w-[34%]">Month</th>
                        <th className="w-[22%] text-right">Frozen sheet</th>
                        <th className="w-[22%] text-right">Plan today</th>
                        <th className="w-[22%] text-right">Gap</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-light">
                      {deviation.byMonth.map((m) => (
                        <tr key={m.month} data-deviation-month={m.month}>
                          <td className="py-2 text-[13px] font-semibold text-text-primary">
                            {monthLabel(m.month)}
                          </td>
                          <td className="py-2 text-right text-[12.5px] tnum text-text-secondary">
                            {formatMoney(m.was)}
                          </td>
                          <td className="py-2 text-right text-[12.5px] tnum text-text-primary">
                            {formatMoney(m.now)}
                          </td>
                          <td
                            className="py-2 text-right text-[12.5px] font-semibold tnum"
                            style={{
                              color:
                                m.delta === 0
                                  ? "var(--text-tertiary)"
                                  : m.delta < 0
                                    ? AMBER
                                    : "#16A34A",
                            }}
                          >
                            {m.delta === 0
                              ? "—"
                              : `${m.delta > 0 ? "+" : "-"}${formatMoney(Math.abs(m.delta))}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="mt-3 rounded-xl border border-border-light bg-white p-5 shadow-card">
                <h2 className="flex items-center gap-2 text-[15px] font-semibold text-text-primary">
                  <AlertTriangle size={15} strokeWidth={2} style={{ color: AMBER }} />
                  Where the gap came from
                  <InfoHint text="A total that fell tells you nothing you can act on. These are the deals whose plans changed since the sheet was frozen, biggest movement first, with the months that moved." />
                </h2>
                {deviation.byDeal.length === 0 ? (
                  <p className="mt-2 text-[13px] text-text-secondary">
                    Nothing has moved since that sheet was frozen.
                  </p>
                ) : (
                  <div className="mt-2 divide-y divide-border-light">
                    {deviation.byDeal.map((d) => (
                      <div key={d.opportunityId} className="py-3" data-deviation-deal={d.opportunityId}>
                        <div className="flex items-center gap-2.5">
                          <CompanyLogo name={d.customer} className="h-7 w-7 shrink-0" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-semibold text-text-primary">
                              {d.opportunityName}
                            </span>
                            <span className="block truncate text-[12px] text-text-secondary">
                              {d.customer}
                            </span>
                          </span>
                          {/* A SLIP IS NOT "NOTHING HAPPENED". Money that moved
                              from one month to the next nets to zero, and that
                              is precisely the case worth surfacing: "how many
                              opportunities we thought will close in July are
                              not closed in July and are now spilling into
                              August". It gets its own word rather than a
                              green +$0. */}
                          <span
                            className="shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-bold tnum"
                            style={{
                              background: d.slipped
                                ? "rgba(180,83,9,0.10)"
                                : d.delta < 0
                                  ? "rgba(180,83,9,0.10)"
                                  : "rgba(22,163,74,0.10)",
                              color: d.slipped || d.delta < 0 ? AMBER : "#16A34A",
                            }}
                          >
                            {d.slipped
                              ? `${formatMoney(d.movement)} slipped`
                              : `${d.delta >= 0 ? "+" : "-"}${formatMoney(Math.abs(d.delta))}`}
                          </span>
                        </div>
                        {d.months.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5 pl-[38px]">
                            {d.months.map((m) => (
                              <span
                                key={m.month}
                                className="rounded-md border border-border-light bg-surface/60 px-2 py-1 text-[11.5px] tnum text-text-secondary"
                              >
                                {monthLabel(m.month)}{" "}
                                <b
                                  style={{ color: m.delta < 0 ? AMBER : "#16A34A" }}
                                >
                                  {m.delta > 0 ? "+" : "-"}
                                  {formatMoney(Math.abs(m.delta))}
                                </b>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      )}

      {/* THE SAME PLANNER THE DEAL PAGE OPENS (Suren, Sep 1: "I don't want a
          different screen. It has to be consistent... this screen is
          confusing, this screen is better", pointing at this dialog; and on
          the deal: "it's just that same screen shows up here").

          It lives in AccrualPlanDialog and is mounted here and on the
          opportunity page, so there is one accrual form in the app and not
          two that drift. Mounted only while it is open, so it seeds itself
          from the deal it was opened on and cannot be left showing the deal
          before last. */}
      {planning && (
        <AccrualPlanDialog
          dealId={planning.dealId}
          deals={deals}
          /* The dropdown offers the deals with no plan on them yet. */
          pickable={missing}
          plans={state.plans}
          onClose={() => setPlanning(null)}
          onSaved={(next) => {
            setState(next);
            /* LAND ON WHAT YOU JUST MADE. Saving from the "No numbers yet"
               list used to drop the plan straight out of the visible filter —
               the work vanished with nothing to show for it, which is the same
               complaint Suren made about a saved opportunity on Aug 18 ("I was
               working on an opportunity, how can it disappear, man?"). The
               table above is where the plan now appears, and clearing the
               filter is what puts it in view. */
            setOnly("all");
            setQuery("");
          }}
        />
      )}

      
      {/* UNDOING A FREEZE. A sheet frozen by mistake becomes the baseline every
          later gap is measured against, so there has to be a way back — and it
          is a person's decision, like every other write in this module. Only
          offered for THIS month's sheet: an older one is history somebody has
          already reported against. */}
      <ConfirmDialog
        open={!!confirmUnfreeze}
        onClose={() => setConfirmUnfreeze(null)}
        busy={busy}
        onConfirm={async () => {
          if (!confirmUnfreeze) return;
          await post(
            { op: "unfreeze", month: confirmUnfreeze },
            `${monthLabel(confirmUnfreeze)} is no longer frozen.`
          );
          setConfirmUnfreeze(null);
        }}
        title={`Unfreeze ${confirmUnfreeze ? monthLabel(confirmUnfreeze) : ""}?`}
        body="The frozen sheet is removed and stops being the baseline for the month-on-month gap. Every accrual plan is left exactly as it is — this removes the photograph, not the thing photographed."
        confirmLabel="Unfreeze the month"
      />
      <ConfirmDialog
        open={confirmSweep}
        onClose={() => setConfirmSweep(false)}
        busy={busy}
        onConfirm={async () => {
          await post(
            { op: "system-deviate" },
            "Checked. Any plan whose deal should have signed by now is flagged."
          );
          setConfirmSweep(false);
        }}
        /* PLAIN WORDS, AND NOT RED (Anir, Sep 1: "speak in language a
           thirteen-year-old can understand, this goes for literally all the
           question marks and popups similar to this").

           The old wording said "gets a new version marked Inactive and System
           deviated", which is the database talking. And it wore the red
           destructive styling while deleting nothing at all: red is reserved
           in this app for things you cannot take back. */
        tone="primary"
        title="Find deals that should have been signed by now?"
        body="Some deals were supposed to be signed already and have not been. This finds them and puts a flag on their plan so somebody knows to look. Nothing you have typed is changed or deleted, and plans with no numbers in them yet are skipped."
        confirmLabel="Find them"
      />

      <ConfirmDialog
        open={confirmFreeze}
        onClose={() => setConfirmFreeze(false)}
        busy={busy}
        onConfirm={async () => {
          await post({ op: "freeze" }, "This month's sheet is frozen.");
          setConfirmFreeze(false);
        }}
        /* Not red: freezing SAVES a copy, it destroys nothing. Red is
           reserved here for what cannot be taken back, and spending it on a
           safe action is why nobody reads it on the ones that matter (Anir,
           Sep 1: "if the colours don't match, then it probably doesn't match
           on other things too"). Unfreeze below stays red, because that one
           does throw the saved copy away. */
        tone="primary"
        title={`Freeze ${monthLabel(monthKey(new Date()))}?`}
        body="Every plan as it stands right now is saved as this month's sheet. From here on, the month-on-month gap is measured against it. Freezing again this month replaces it."
        confirmLabel="Freeze the month"
      />

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (!confirmDelete) return;
          await post(
            { op: "delete", opportunityId: confirmDelete.opportunityId },
            "Plan deleted."
          );
          setConfirmDelete(null);
        }}
        title="Delete this accrual plan?"
        body={
          confirmDelete
            ? `${confirmDelete.opportunityName} goes back to having no accrual numbers, and shows up under “No numbers yet”. The deal itself is untouched.`
            : ""
        }
        confirmLabel="Delete plan"
      />
    </div>
  );
}
