"use client";

import { useStickyValue } from "@/lib/useStickyValue";
import {
  OpportunitySummary,
  periodKeyOf,
  TIMELINES,
  type SummaryDimension,
  type Timeline,
} from "@/components/opportunities/OpportunitySummary";
import type { Opportunity } from "@/lib/opportunitiesShared";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarRange,
  Building2,
  ChevronDown,
  Coins,
  Download,
  Package,
  Lock,
  Pencil,
  Plus,
  TrendingDown,
  TrendingUp,
  Trash2,
  Unlock,
  Briefcase,
} from "lucide-react";
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
import { Field, Input } from "@/components/ui/Input";
import { formatMoney } from "@/lib/pipeline";
import { Sparkline } from "@/components/charts/Charts";
import { cn, formatDate } from "@/lib/utils";
import { downloadCSV, toCSV } from "@/lib/csv";
import { PriorityLabel, PriorityTooltip } from "@/components/ui/SearchPriority";
import {
  buildDeviation,
  judgePlan,
  monthKey,
  monthLabel,
  monthsFrom,
  planTotal,
  spreadEvenly,
  type AccrualPlan,
  type RevenueAccrualsState,
} from "@/lib/revenueAccrualsShared";

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

type DealOption = {
  id: string;
  name: string;
  customer: string;
  customerId?: string;
  offeringId?: string;
  offeringLabel?: string;
  value: number;
  status?: string;
  estSignDate?: string;
  owner?: string;
};

type Draft = {
  opportunityId: string;
  contractValue: string;
  startMonth: string;
  months: string;
  /** `pinned` means a person typed this month's amount, so the even split
   *  works around it instead of overwriting it. */
  lines: { month: string; amount: string; pinned?: boolean }[];
  note: string;
};

/** How many months the dialog is showing, whatever is half-typed in the box. */
function planMonthCount(d: Draft): number {
  return Math.max(1, Math.min(60, Number(d.months) || 1));
}

/** The rows on screen: `months` of them, always keyed from the first month, so
 *  moving the start date slides the whole schedule instead of relabelling it. */
function planRows(d: Draft): { month: string; amount: string; pinned?: boolean }[] {
  const count = planMonthCount(d);
  return monthsFrom(d.startMonth, count).map((month, i) => ({
    month,
    amount: d.lines[i]?.amount ?? "",
    ...(d.lines[i]?.pinned ? { pinned: true } : {}),
  }));
}

const AMBER = "#B45309";

/**
 * ONE COLUMN TEMPLATE FOR THE LIST HEADER AND EVERY ROW IN IT.
 *
 * Shared rather than written twice, because a header whose widths drift from
 * its rows is worse than no header at all — it labels the wrong column.
 */
const ACCRUAL_ROW_GRID =
  "grid grid-cols-[minmax(0,1fr)_120px_120px_128px_180px_150px] items-center gap-5";

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
  const [editing, setEditing] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  /** The deal picker "Plan a deal" opens. A button that says it plans a
   *  deal has to ask which deal, not quietly change a filter behind you. */
  const [confirmFreeze, setConfirmFreeze] = useState(false);
  const [confirmUnfreeze, setConfirmUnfreeze] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AccrualPlan | null>(null);
  const [openDeal, setOpenDeal] = useState<string | null>(null);
  /** Same two controls every other list page carries. */
  const [sort, setSort] = useState<"biggest" | "risk" | "soonest" | "customer">("biggest");
  /* "Revenue accruals can also be looked at from an offering point of view"
     (Suren, Aug 25) — so grouping is not decoration here, it is one of the
     three angles he asked the module to answer. */
  const [groupBy, setGroupBy] = useState<"none" | "customer" | "offering">("none");
  /** The opportunity whose plan just landed — opened and lit for a moment. */
  const [justSaved, setJustSaved] = useState<string | null>(null);

  const dealById = useMemo(
    () => new Map(deals.map((d) => [d.id, d])),
    [deals]
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
        if (!q) return true;
        return [j.plan.opportunityName, j.plan.customer, j.plan.offeringLabel ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => {
        if (sort === "customer") {
          return (
            a.plan.customer.localeCompare(b.plan.customer) ||
            planTotal(b.plan) - planTotal(a.plan)
          );
        }
        if (sort === "soonest") {
          const first = (x: typeof a) => x.plan.lines[0]?.month ?? "9999-99";
          return first(a).localeCompare(first(b));
        }
        if (sort === "risk") {
          /* Most at risk: flagged first, then by how much money is stranded —
             a flagged $2M plan is not the same finding as a flagged $20K one. */
          return (
            Number(b.verdict.invalid) - Number(a.verdict.invalid) ||
            b.verdict.strandedAmount - a.verdict.strandedAmount ||
            planTotal(b.plan) - planTotal(a.plan)
          );
        }
        return planTotal(b.plan) - planTotal(a.plan);
      });
  }, [judged, query, only, sort]);

  /** Grouped exactly the way Opportunities groups: a header per bucket with
   *  its own total, biggest bucket first. */
  const groups = useMemo(() => {
    if (groupBy === "none") return null;
    const by = new Map<string, typeof shown>();
    for (const row of shown) {
      const key =
        groupBy === "customer"
          ? row.plan.customer || "No customer"
          : row.plan.offeringLabel || "No offering";
      by.set(key, [...(by.get(key) ?? []), row]);
    }
    return [...by.entries()]
      .map(([key, rows]) => ({
        key,
        rows,
        total: rows.reduce((s, r) => s + planTotal(r.plan), 0),
        flagged: rows.filter((r) => r.verdict.invalid).length,
      }))
      .sort((a, b) => b.total - a.total);
  }, [shown, groupBy]);

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
      for (const line of plan.lines) {
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
  }, [shown]);

  /**
   * ONE LINE PER COMPANY when the page chart is flipped to Line (Anir,
   * Aug 27: "I meant for each company"). Bars answer "how much lands in
   * March"; the lines answer "whose money is that" — the biggest five
   * customers each get a line in their card's accent, everything smaller
   * shares a grey one so the chart never becomes spaghetti.
   */
  const companyLines = useMemo(() => {
    const months = [
      ...new Set(shown.flatMap(({ plan }) => plan.lines.map((l) => l.month))),
    ]
      .sort()
      .slice(0, 18);
    const byCustomer = new Map<string, Map<string, number>>();
    for (const { plan } of shown) {
      const mine = byCustomer.get(plan.customer) ?? new Map<string, number>();
      for (const line of plan.lines)
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
  }, [shown]);

  /**
   * EXPORT, BECAUSE THIS MODULE REPLACES A SPREADSHEET. Suren's whole reason
   * for it was "I don't want you guys to maintain an Excel sheet" — the way to
   * win that argument is for the app to hand over the sheet on demand, not to
   * make the sheet unreachable. One row per month per deal, which is the shape
   * anybody would pivot.
   */
  function exportCsv() {
    const rows: (string | number)[][] = [];
    for (const { plan, verdict } of shown) {
      for (const line of plan.lines) {
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

  /* ONE POP-UP, NOT TWO (Anir, Aug 27: "why do you have to have two
     different screens? Maybe you choose the deal, and then the other stuff
     shows up. It shouldn't be like two separate pop-ups").

     Called with "" it opens the plan dialog with nothing chosen: a deal
     dropdown at the top and the rest of the form waiting underneath. Called
     with a deal id — from the dropdown, or from a row's Edit — it fills the
     form in. Same function, same dialog, no second screen. */
  function startPlan(dealId: string, existing?: AccrualPlan) {
    const deal = dealById.get(dealId);
    if (!dealId) {
      setEditing({
        opportunityId: "",
        contractValue: "",
        startMonth: monthKey(new Date()),
        months: "6",
        lines: [],
        note: "",
      });
      return;
    }
    const startMonth =
      existing?.lines[0]?.month ??
      (deal?.estSignDate ? monthKey(deal.estSignDate) : monthKey(new Date()));
    const months = existing?.lines.length || 6;
    const contractValue = existing?.contractValue ?? deal?.value ?? 0;
    setEditing({
      opportunityId: dealId,
      contractValue: String(contractValue),
      startMonth,
      months: String(months),
      /* A NEW PLAN OPENS ALREADY SPREAD.
         It used to open with a contract value, a start month and six months
         but NO month lines, so Save refused with "add at least one month, or
         press Spread evenly" — while the banner directly above it said "the
         months add up to $0... saving is allowed". Two messages, opposite
         instructions, and the button did nothing either way. The defaults are
         right there, so apply them and let the person adjust. */
      /* A SAVED PLAN'S OWN SHAPE IS DELIBERATE. If its months are not a plain
         even split, somebody sat down and chose those numbers, so they open
         held — changing the count re-splits around them instead of flattening
         a hand-built schedule. A plan that IS an even split opens loose and
         keeps following the formula. */
      lines: (() => {
        const even = spreadEvenly(contractValue, startMonth, months);
        if (!existing?.lines) {
          return even.map((l) => ({ month: l.month, amount: String(l.amount) }));
        }
        const wasEven =
          existing.lines.length === even.length &&
          existing.lines.every((l, i) => l.amount === even[i]?.amount);
        return existing.lines.map((l) => ({
          month: l.month,
          amount: String(l.amount),
          ...(wasEven ? {} : { pinned: true }),
        }));
      })(),
      note: existing?.note ?? "",
    });
  }

  /** "You give them a simple formula: this is the contract value." Also the
   *  way back: every month goes loose again and the value re-splits clean. */
  function applySpread() {
    if (!editing) return;
    setEditing(reshape({ ...editing, lines: [] }));
  }

  /**
   * THE THREE FIELDS ARE THE FORMULA AND THE TABLE IS ITS ANSWER (Anir,
   * Aug 28: "if I'm changing the number here, shouldn't it change below? and
   * make me enter in other stuff / prefill it"). Typing 8 into "number of
   * months" left four rows sitting underneath, so the top of the form and the
   * bottom of the form disagreed until you went looking for "Spread evenly".
   *
   * A month is either LOCKED — someone typed that number, and it is theirs —
   * or loose. Every loose month carries an equal share of whatever the locked
   * ones have not claimed, recomputed on every keystroke. So the table always
   * adds up to the contract value on its own, and pinning December to $500K
   * makes the other months absorb the difference instead of leaving the plan
   * over by $500K until someone notices the banner.
   *
   * Shrinking the count only HIDES months; their amounts stay in `lines`. That
   * matters because typing "12" over "4" passes through the empty string, and
   * a rebuild on that keystroke would otherwise throw away nine months of
   * typing between one character and the next.
   */
  function reshape(next: Draft): Draft {
    const count = planMonthCount(next);
    const keys = monthsFrom(next.startMonth, count);
    if (!keys.length) return { ...next, months: String(count) };
    const value = Number(next.contractValue) || 0;

    const locked = keys.map((_, i) =>
      next.lines[i]?.pinned ? Number(next.lines[i]?.amount) || 0 : null
    );
    const loose = locked.filter((a) => a === null).length;
    const left = Math.max(
      0,
      value - locked.reduce((s: number, a) => s + (a ?? 0), 0)
    );
    /* The rounding remainder lands on the last loose month, so the rows add
       back to exactly the contract value rather than to $499,999. */
    const per = loose ? Math.floor(left / loose) : 0;
    let seen = 0;

    const lines = keys.map((month, i) => {
      const pinned = locked[i] !== null;
      if (pinned) return { month, amount: next.lines[i].amount, pinned: true };
      seen += 1;
      const share = seen === loose ? left - per * (loose - 1) : per;
      return { month, amount: String(share) };
    });

    return {
      ...next,
      months: String(count),
      /* Months past the visible count ride along untouched, ready for the
         moment the count goes back up. */
      lines: [...lines, ...next.lines.slice(count)],
    };
  }

  /** Edit one of the three formula fields and let the table follow. */
  function editFormula(patch: Partial<Draft>) {
    if (!editing) return;
    setEditing(reshape({ ...editing, ...patch }));
  }

  /** Typing an amount locks that month; the loose ones re-split around it. */
  function editMonth(index: number, raw: string) {
    if (!editing) return;
    const lines = [...editing.lines];
    while (lines.length <= index)
      lines.push({ month: planRows(editing)[lines.length]?.month ?? "", amount: "" });
    lines[index] = { ...lines[index], amount: raw, pinned: true };
    setEditing(reshape({ ...editing, lines }));
  }

  async function savePlan() {
    if (!editing) return;
    const deal = dealById.get(editing.opportunityId);
    if (!deal) {
      toast("Pick an opportunity first.", "error");
      return;
    }
    const lines = planRows(editing)
      .map((l) => ({ month: l.month, amount: Math.round(Number(l.amount) || 0) }))
      .filter((l) => l.month);
    if (!lines.length) {
      toast("Add at least one month, or press Spread evenly.", "error");
      return;
    }
    const ok = await post(
      {
        op: "save",
        plan: {
          opportunityId: deal.id,
          opportunityName: deal.name,
          customer: deal.customer,
          customerId: deal.customerId,
          offeringId: deal.offeringId,
          offeringLabel: deal.offeringLabel,
          contractValue: Math.round(Number(editing.contractValue) || 0),
          /* The date these months were chosen against. If somebody moves it
             later, the plan is flagged rather than quietly going wrong. */
          ...(deal.estSignDate ? { signDateAtPlan: deal.estSignDate } : {}),
          lines,
          note: editing.note,
        },
      },
      "Accrual plan saved."
    );
    if (ok) {
      setEditing(null);
      /* LAND ON WHAT YOU JUST MADE. Saving from the "No numbers yet" list used
         to drop the plan straight out of the visible filter — the work
         vanished with nothing to show for it, which is the same complaint
         Suren made about a saved opportunity on Aug 18 ("I was working on an
         opportunity, how can it disappear, man?"). */
      setOnly("all");
      setQuery("");
      setOpenDeal(null);
      setJustSaved(deal.id);
    }
  }

  /* The months ON SCREEN are the plan. A row parked beyond the visible count
     is remembered, not counted, or the total would argue with the table. */
  const editingRows = editing ? planRows(editing) : [];
  const editingTotal = editingRows.reduce(
    (s, l) => s + (Number(l.amount) || 0),
    0
  );
  const editingValue = editing ? Number(editing.contractValue) || 0 : 0;

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
              <button
                type="button"
                onClick={() => startPlan("")}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-primary px-4 py-2 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90"
              >
                <Plus size={15} strokeWidth={2.4} /> Plan a deal
              </button>
            </div>
          ) : (
            <span className="rounded-full bg-[rgba(0,113,227,0.08)] px-2.5 py-1 text-[11px] font-semibold text-blue-primary">
{/* SAY THE REAL REASON (Anir, Aug 30: "why does it say sample
                  leads switch to real mode, but I'm on real mode?"). These
                  pills were gated on canWrite alone, so every non-admin in
                  REAL mode was told to switch to the mode they were already
                  in — an instruction that cannot be followed. Mock and
                  view-only are two different states. */}
              {live
                ? "You can see the plans here, but not change them"
                : "Sample plan. Switch to Real mode to work the live numbers"}
            </span>
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

      {/* Two views, not two pages: the plans, and the gap. */}
      <div className="mt-4 flex items-center gap-1 border-b border-border-light">
        {(
          [
            ["plans", "Plans"],
            ["deviation", "Month-on-month gap"],
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
            onClearAll={() => {
              setOnly("all");
              setGroupBy("none");
            }}
            filtersBefore={
              <ColorSelect
                value={only}
                onChange={(v) => setOnly(v as typeof only)}
                ariaLabel="Show"
                minWidth={200}
                dense
                collapsible={false}
                options={[
                  { value: "all", label: "All plans", color: "#0071E3" },
                  {
                    value: "flagged",
                    label: `Flagged (${flagged.length})`,
                    color: AMBER,
                  },
                  {
                    value: "missing",
                    label: `Need a plan (${missing.length})`,
                    color: AMBER,
                  },
                ]}
              />
            }
            filtersAfter={
              /* His third angle. The other two — by deal and by month — are
                 the list and the gap tab; this is the offering one. */
              <ColorSelect
                value={groupBy}
                onChange={(v) => setGroupBy(v as typeof groupBy)}
                ariaLabel="Group rows"
                minWidth={180}
                dense
                collapsible={false}
                options={[
                  { value: "none", label: "No grouping", color: "#8E98A8" },
                  { value: "customer", label: "Group by customer", color: "#0071E3", icon: Building2 },
                  { value: "offering", label: "Group by offering", color: "#B4318F", icon: Package },
                ]}
              />
            }
            sort={
              <ColorSelect
                value={sort}
                onChange={(v) => setSort(v as typeof sort)}
                ariaLabel="Sort plans"
                minWidth={175}
                dense
                collapsible={false}
                options={[
                  { value: "biggest", label: "Biggest first", color: "#0071E3" },
                  { value: "risk", label: "Most at risk", color: AMBER },
                  { value: "soonest", label: "Soonest month", color: "#0F766E" },
                  { value: "customer", label: "Customer A–Z", color: "#8E98A8" },
                ]}
              />
            }
            display={
              <PriorityTooltip label="Export CSV">
                <button
                  type="button"
                  onClick={exportCsv}
                  aria-label="Export CSV"
                  className="flex items-center rounded-md border border-border px-3 py-2 text-[13px] font-medium text-text-secondary transition-colors hover:bg-surface"
                >
                  <Download size={16} strokeWidth={1.5} />
                  <PriorityLabel>Export CSV</PriorityLabel>
                </button>
              </PriorityTooltip>
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
                          onClick={() => startPlan(d.id)}
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
                  you want this cut". */}
              <OpportunitySummary
                toolbar={
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
                }
                deals={opportunities}
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
                  /* Straight into planning it — "when you click on it again,
                     you need to go and update the accruals on the revenue".
                     A PAGE, not a sheet: the planner grows a row per month, so
                     a twelve-month spread was scrolling inside a fixed dialog
                     on top of the table it was editing (Anir, Aug 30: "I'm
                     pretty sure he wants it to be a page instead of a popup").
                     The dialog stays for "Plan a deal", where choosing the deal
                     is the first step. */
                  router.push(`/revenue-accruals/${id}`)
                }
                spread={{
                  periodsOf: (d, tl) => {
                    const plan = state.plans.find((p) => p.opportunityId === d.id);
                    if (!plan) return [];
                    const keys = new Set<string>();
                    for (const l of plan.lines) {
                      const k = periodKeyOf(`${l.month}-01`, tl);
                      if (k) keys.add(k);
                    }
                    return [...keys];
                  },
                  amountIn: (d, period, _measure) => {
                    const plan = state.plans.find((p) => p.opportunityId === d.id);
                    if (!plan) return 0;
                    return plan.lines.reduce(
                      (sum, l) =>
                        periodKeyOf(`${l.month}-01`, accrTimeline) === period
                          ? sum + (l.amount || 0)
                          : sum,
                      0
                    );
                  },
                }}
              />
            </section>

            {/* WHEN THE MONEY IS PLANNED TO LAND, drawn. A column per month
                across everything on screen, so the filters and the grouping
                change the picture rather than only the list. */}
            {monthChart.length > 0 && (
              <section className="mt-4 rounded-xl border border-border-light bg-white p-5 pb-2.5 shadow-card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h2 className="flex items-center gap-2 text-[15px] font-semibold text-text-primary">
                    <CalendarRange size={15} strokeWidth={2} className="text-blue-primary" />
                    When this money is planned to land
                    <InfoHint text="Every plan on screen, summed by month. A solid column is money on a plan nobody needs to revisit. The hatched part is money sitting on a flagged plan, and an amber column is a month that has already gone by." />
                  </h2>
                  {/* Bars, line or area — the page summary's own remembered
                      choice; every card below carries its own (Anir, Aug 27:
                      "I meant for each company"). */}
                  <AccrualChartPicker
                    value={kindFor("page")}
                    onChange={(k) => setKindFor("page", k)}
                  />
                </div>
                <p className="mt-0.5 text-[12.5px] text-text-secondary">
                  {formatMoney(monthChart.reduce((s, m) => s + m.value, 0))} across{" "}
                  {monthChart.length} {monthChart.length === 1 ? "month" : "months"}
                  {flagged.length > 0 && (
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
                </p>
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
              </section>
            )}

            {/* COLUMNS, NOT A CRUSH (Anir, Sep 1: "Why is everything so
                fucking close together? Just make it a nice table... Why is it
                so squished together? You have so much space").

                The row was one flex line: the name was flex-1 so it ate every
                spare pixel and pushed the sparkline, the total, the close
                date, the author and four icons into the right edge, shoulder
                to shoulder. And because nothing lined up between rows, each
                row had to caption its own values — a tiny EST. CLOSE and
                LAST UPDATED over every single one — which is the noise he is
                reading as squashed.

                One grid template, shared by the header and every row, so the
                values line up in real columns and the captions are said once
                at the top instead of 79 times down the page. */}
            <div className={cn(ACCRUAL_ROW_GRID, "mt-4 px-4 pb-1 text-[10.5px] font-bold uppercase tracking-[0.05em] text-text-tertiary")}>
              {/* LEFT, ALL OF THEM (Anir, Sep 1: "make sure every single
                  column and the data points are left-aligned. I don't think
                  they are"). Money and dates were right-aligned out of
                  convention; the rule in this app is one edge, and a header
                  that sits over the right end of its column while the next
                  one starts at the left is exactly the ragged reading he keeps
                  striking out. */}
              <span>Deal</span>
              <span>Shape</span>
              <span>Planned</span>
              <span>Est. close</span>
              <span>Last updated</span>
              {/* Left-aligned, header and icons both — the standing rule for
                  an actions column everywhere in this app. */}
              <span className="text-left">Actions</span>
            </div>

            <div className="space-y-2.5">
              {(groups
                ? groups.flatMap((g) => [
                    /* A GROUP HEADER, then its plans — the same shape the
                       pipeline uses when you group it by customer. The total
                       is on the header because a bucket you cannot value is
                       just a fold. */
                    <div
                      key={`h-${g.key}`}
                      data-accrual-group={g.key}
                      className="flex items-center gap-2.5 px-1 pb-0.5 pt-2"
                    >
                      {groupBy === "customer" ? (
                        <CompanyLogo name={g.key} className="h-6 w-6 shrink-0" />
                      ) : (
                        <Package size={14} strokeWidth={2.2} className="shrink-0 text-[color:#B4318F]" />
                      )}
                      <span className="text-[13px] font-bold text-text-primary">
                        {g.key}
                      </span>
                      <span className="text-[12px] text-text-secondary tnum">
                        {g.rows.length} {g.rows.length === 1 ? "plan" : "plans"} ·{" "}
                        {formatMoney(g.total)}
                      </span>
                      {g.flagged > 0 && (
                        <span
                          className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                          style={{ background: "rgba(180,83,9,0.10)", color: AMBER }}
                        >
                          {g.flagged} flagged
                        </span>
                      )}
                      <span className="h-px flex-1 bg-border-light" />
                    </div>,
                    ...g.rows,
                  ])
                : shown
              ).map((entry) => {
                if (!("plan" in entry)) return entry;
                const { plan, deal, verdict } = entry;
                const fresh = justSaved === plan.opportunityId;
                const isOpen = openDeal === plan.id || fresh;
                const accent = accentFor(plan.customer);
                return (
                  <section
                    key={plan.id}
                    data-accrual-plan={plan.opportunityId}
                    className={cn(
                      "overflow-hidden rounded-xl border bg-white shadow-card transition-colors",
                      /* DIM WHAT YOU ARE NOT READING (Anir, Sep 1: "when I
                         click a deal, the others should dim"), the same rule
                         the pipeline tree already follows. Dimmed, not hidden:
                         a row you are not reading is still a row you might
                         glance at, and hover brings it straight back.

                         No transition on the opacity — the card already runs
                         one on its border colour, and a second running
                         transition on the same element supplies its own value,
                         which is how the summary table's fade got stuck at 1. */
                      openDeal !== null &&
                        !isOpen &&
                        "opacity-40 hover:opacity-100",
                      fresh
                        ? "border-blue-primary ring-2 ring-[rgba(0,113,227,0.18)]"
                        : verdict.invalid
                          ? "border-[rgba(180,83,9,0.35)]"
                          : "border-border-light",
                      /* THE RAIL, ON THE WHOLE OPEN BLOCK (Anir, Aug 26:
                         "you're not doing the separator thing here, like the
                         line on the left"). It goes on the SECTION rather than
                         on the header and the panel separately, so it is one
                         line by construction and cannot arrive in two pieces
                         the way the solutioning one did. Amber when the plan
                         needs re-planning, because that is what the rest of
                         the card is already saying. */
                      isOpen &&
                        verdict.invalid &&
                        "[box-shadow:inset_3px_0_0_0_#B45309]"
                    )}
                    style={
                      isOpen && !verdict.invalid
                        ? { boxShadow: `inset 3px 0 0 0 ${accent}` }
                        : undefined
                    }
                  >
                    {/* EVERYTHING THAT ACTS ON THE PLAN IS ON THE TOP ROW
                        (Anir, Aug 30: "the stuff at the bottom that you have
                        when I open it should be on the top — the delete, the
                        re-plan, the person, the close, the contract value,
                        which is already on the top, so it's redundant. When I
                        click on it, it's just the graphs").

                        The card used to hide its own controls one click deep,
                        under the chart, and repeat the contract value down
                        there beside a total that was already in the header. A
                        row, not a button, because the actions are siblings of
                        the disclosure rather than nested inside it. */}
                    <div className={cn(ACCRUAL_ROW_GRID, "w-full px-4 py-3 transition-colors hover:bg-blue-light/25")}>
                    <button
                      type="button"
                      onClick={() => setOpenDeal(isOpen ? null : plan.id)}
                      aria-expanded={isOpen}
                      className="flex min-w-0 cursor-pointer items-center gap-3 text-left"
                    >
                      <CompanyLogo name={plan.customer} className="h-8 w-8 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-semibold text-text-primary">
                          {plan.opportunityName}
                        </span>
                        <span className="block truncate text-[12px] text-text-secondary">
                          {plan.customer}
                          {plan.offeringLabel && ` · ${plan.offeringLabel}`}
                        </span>
                      </span>
                      {verdict.invalid && (
                        <span
                          className="shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold"
                          style={{ background: "rgba(180,83,9,0.10)", color: AMBER }}
                        >
                          Needs re-planning
                        </span>
                      )}
                    </button>
                    {/* SHAPE. Flat, front-loaded or ramping, before you commit
                        to a click. Its own column now, so it stops being the
                        thing wedged between a name and a number. */}
                    <span className="min-w-0">
                      {/* THE SHAPE WITHOUT OPENING ANYTHING (Anir, Aug 27:
                          "I need it completely revamped"). A closed row used
                          to say only a total; the sparkline shows whether the
                          money is flat, front-loaded or ramping before you
                          commit to a click. Decorative here — the real chart
                          is one click away — so it takes no hover of its own. */}
                      {plan.lines.length > 1 ? (
                        <span aria-hidden="true" className="block">
                          <Sparkline
                            points={plan.lines.map((l) => l.amount)}
                            color={accent}
                            height={26}
                            interactive={false}
                          />
                        </span>
                      ) : (
                        <span className="block text-[12px] text-text-tertiary">
                          one month
                        </span>
                      )}
                    </span>
                    <span className="text-left">
                      <span className="block text-[14px] font-bold tnum text-text-primary">
                        {formatMoney(planTotal(plan))}
                      </span>
                      <span className="block text-[11.5px] tnum text-text-secondary">
                        over {plan.lines.length}{" "}
                        {plan.lines.length === 1 ? "month" : "months"}
                      </span>
                    </span>
                      {/* The two facts worth carrying, and the three things
                          you can do. Est. close and who last touched it used
                          to live under the chart; the contract value that sat
                          beside them was the same number as the total above. */}
                      {/* The captions moved to the header, so a row prints a
                          value and nothing else. A cell with no value keeps
                          its place rather than collapsing and shunting every
                          column after it out of line. */}
                      <span className="text-left">
                        {deal?.estSignDate ? (
                          <b className="block text-[12.5px] tnum text-text-primary">
                            {formatDate(deal.estSignDate)}
                          </b>
                        ) : (
                          <span className="block text-[12.5px] text-text-tertiary">
                            &mdash;
                          </span>
                        )}
                      </span>
                      {/* A FACE ON THE PERSON (Anir, Sep 1: "just make sure
                          there are profile pictures"). The customer had its
                          logo and the person who last touched the plan was a
                          line of text, which is the one place on this row a
                          name appears and the one place it had nothing to
                          recognise it by. */}
                      <span
                        className="flex min-w-0 items-center gap-2 text-left"
                        title={`Last updated by ${plan.updatedBy} on ${formatDate(plan.updatedAt)}`}
                      >
                        <Avatar
                          name={plan.updatedBy}
                          className="h-7 w-7 shrink-0 text-[9px]"
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-[12.5px] font-medium text-text-primary">
                            {plan.updatedBy}
                          </span>
                          <span className="block text-[11.5px] tnum text-text-secondary">
                            {formatDate(plan.updatedAt)}
                          </span>
                        </span>
                      </span>
                      {/* Every control on the row, in the column the header
                          names, left-aligned like every other actions column
                          in the app. */}
                      <span className="flex items-center gap-1">
                      {/* THE ARROW, NOT A SENTENCE (Anir, Aug 30: "wherever
                          you put 'Open the deal' or anything similar, replace
                          it with the arrow, and it can just go at the top"). */}
                      <Link
                        href={`/opportunities?deal=${encodeURIComponent(plan.opportunityId)}`}
                        title="Open the deal"
                        aria-label={`Open ${plan.opportunityName}`}
                        onClick={(e) => e.stopPropagation()}
                        className="shrink-0 cursor-pointer rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-blue-light hover:text-blue-primary"
                      >
                        <ArrowUpRight size={15} strokeWidth={2.2} />
                      </Link>
                      {canWrite && (
                        <>
                          <button
                            type="button"
                            onClick={() => startPlan(plan.opportunityId, plan)}
                            title="Re-plan this deal"
                            aria-label={`Re-plan ${plan.opportunityName}`}
                            className="shrink-0 cursor-pointer rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-blue-light hover:text-blue-primary"
                          >
                            <Pencil size={14} strokeWidth={2.2} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(plan)}
                            title="Delete this plan"
                            aria-label={`Delete the plan for ${plan.opportunityName}`}
                            className="shrink-0 cursor-pointer rounded-md p-1.5 text-[color:#DC2626] transition-colors hover:bg-[rgba(220,38,38,0.08)]"
                          >
                            <Trash2 size={14} strokeWidth={2.2} />
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => setOpenDeal(isOpen ? null : plan.id)}
                        aria-expanded={isOpen}
                        aria-label={isOpen ? "Hide the chart" : "Show the chart"}
                        className="shrink-0 cursor-pointer rounded-md p-1 text-text-tertiary transition-colors hover:bg-surface"
                      >
                        <ChevronDown
                          size={16}
                          strokeWidth={2.2}
                          className={cn("transition-transform", !isOpen && "-rotate-90")}
                        />
                      </button>
                      </span>
                    </div>

                    {/* The panel is always mounted while a plan is open so the
                        fold can animate to its own height; .freyr-fold does
                        the reveal. */}
                    <div className="freyr-fold" data-open={isOpen ? "true" : "false"}>
                      <div>
                    {isOpen && (
                      /* THE DIVIDER STOPS SHORT OF THE RAIL (Anir, Aug 26: "I
                         don't want this gap, you see where it cuts off"). A
                         full-width border-t paints its 1px straight across the
                         3px rail, so the rail arrives at the panel in two
                         pieces. Drawn as an inset shadow that starts 3px in,
                         it separates the header from the panel without
                         crossing the line down the side. */
                      <div className="freyr-rule-inset px-4 py-3.5">
                        {verdict.invalid && (
                          <p
                            className="mb-3 rounded-lg px-3 py-2 text-[12.5px] font-semibold"
                            style={{ background: "rgba(180,83,9,0.08)", color: AMBER }}
                          >
                            {verdict.headline}
                            {verdict.strandedAmount > 0 && (
                              <span className="font-normal">
                                {" "}
                                {formatMoney(verdict.strandedAmount)} is sitting in
                                months that have already gone by. Nothing was moved
                                for you — re-plan it, or close the deal.
                              </span>
                            )}
                          </p>
                        )}
                        {/* THE PLAN AS A SHAPE, NOT A ROW OF NUMBERS (Anir,
                            Aug 26: "you just have numbers and you're not
                            showing anything"). A column per month, amber for a
                            month that has already gone by, plus the running
                            total underneath so you can see the money arriving
                            rather than read twelve figures and add them up. */}
                        {(() => {
                          const now = monthKey(new Date());
                          let running = 0;
                          const bars = plan.lines.map((line) => {
                            running += line.amount;
                            const past = line.month < now;
                            return {
                              label: monthLabel(line.month).replace(" 20", " '"),
                              value: line.amount,
                              color: past ? AMBER : accent,
                              tip: [
                                { name: "Planned", value: formatMoney(line.amount) },
                                { name: "Cumulative by then", value: formatMoney(running) },
                                ...(past
                                  ? [{ name: "This month has passed", sub: "re-plan it or close the deal" }]
                                  : []),
                              ],
                            };
                          });
                          return (
                            <div className="rounded-xl border border-border-light bg-surface/40 p-3.5">
                              <div className="grid gap-x-5 gap-y-3 lg:grid-cols-[minmax(0,1fr)_236px]">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="text-[10px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                                      How the money lands
                                    </span>
                                    {/* THIS card's own choice (Anir, Aug 27:
                                        "I meant for each company") — flipping
                                        Haleon to a line redraws Haleon, and
                                        nothing else. */}
                                    <AccrualChartPicker
                                      value={kindFor(plan.id)}
                                      onChange={(k) => setKindFor(plan.id, k)}
                                    />
                                  </div>
                                  <div className="mt-2">
                                    <AccrualChart
                                      kind={kindFor(plan.id)}
                                      data={bars}
                                      color={accent}
                                      height={150}
                                    />
                                  </div>
                                </div>
                                {/* MONTH BY MONTH, READABLE AS NUMBERS. The
                                    chart gives the shape; this column gives
                                    the exact figure per month with a track
                                    showing its share of the biggest month —
                                    a breakdown beside the drawing, not a
                                    restatement of it. */}
                                <div className="min-w-0 lg:border-l lg:border-border-light lg:pl-5">
                                  <span className="text-[10px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                                    Month by month
                                  </span>
                                  {/* The scrollbar keeps off the figures
                                      (Anir, Aug 27: "it's too much touching
                                      the numbers. Move to the right"):
                                      content keeps a 12px clearance and the
                                      negative margin parks the bar out in
                                      the panel's own padding. */}
                                  <ul className="-mr-3 mt-2 max-h-[176px] space-y-2 overflow-y-auto pr-3">
                                    {bars.map((b, i) => {
                                      const biggest = Math.max(...bars.map((x) => x.value), 1);
                                      const past = b.color === AMBER;
                                      return (
                                        <li key={`${b.label}-${i}`} className="text-[11.5px] tnum">
                                          <span className="flex items-baseline justify-between gap-2">
                                            <span className={cn(past ? "font-semibold" : "text-text-secondary")} style={past ? { color: AMBER } : undefined}>
                                              {b.label}
                                              {past && " · passed"}
                                            </span>
                                            <b className="text-text-primary">{formatMoney(b.value)}</b>
                                          </span>
                                          <span className="mt-1 block h-1 overflow-hidden rounded-full bg-border-light">
                                            <span
                                              className="block h-full rounded-full"
                                              style={{
                                                width: `${Math.round((b.value / biggest) * 100)}%`,
                                                background: past ? AMBER : accent,
                                              }}
                                            />
                                          </span>
                                        </li>
                                      );
                                    })}
                                  </ul>
                                </div>
                              </div>
                              {/* No facts line either (Anir, Aug 27: "and
                                  what's the point of this"). It said the
                                  month count, the range and the per-month
                                  figure — all three now visible twice over:
                                  on the chart's own axis and in the
                                  Month-by-month column beside it. A line
                                  restating two neighbours is noise. */}
                            </div>
                          );
                        })()}
                        {/* NOTHING UNDER THE CHART (Anir, Aug 30: "when I
                            click on it, it's just the graphs. That's it").
                            The block that lived here repeated the contract
                            value the header already shows, and carried the
                            actions one click away from where you decide to use
                            them. Both moved up to the row. */}
                      </div>
                    )}
                      </div>
                    </div>
                  </section>
                );
              })}
            </div>
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

      {editing && (
        <Modal
          open
          onClose={() => setEditing(null)}
          title={
            editing.opportunityId
              ? `Accrual plan · ${dealById.get(editing.opportunityId)?.name ?? "deal"}`
              : "Plan a deal"
          }
          /* ONE SIZE FOR EVERY FORM DIALOG (Anir, Aug 26: "all the pop-ups,
             let's just make it a set size"). These were "wide" (640px), which
             is too narrow for a two-column form — the fields stacked and the
             dialog came out tall and thin. "workflow" is 980px, the width the
             Solutioning request dialog already uses, and the floor below stops
             a short form collapsing into a strip. */
          size="workflow"
        >
          {/* THE DEAL IS A DROPDOWN, IN THIS SAME DIALOG (Anir, Aug 27:
              "maybe just make it a dropdown... you choose the deal, and then
              the other stuff shows up. It should be one pop-up").

              It used to be a separate full-height dialog listing all
              seventy-one open deals as 59px rows — a screen you had to get
              through before the screen you wanted. The picker is searchable,
              so a long list costs nothing, and the plan fields below wait
              until there is something to plan. */}
          <Field label="Which deal">
            <ColorSelect
              value={editing.opportunityId}
              ariaLabel="Which deal are you planning"
              collapsible={false}
              /* One line per deal (Anir, Aug 28). The menu runs the full
                 width of its field, so stacking the name over its customer
                 and value wasted that room and showed four deals where it
                 can show eight. */
              inlineDescription
              searchable
              className="w-full"
              minWidth={0}
              onChange={(v) => {
                if (v) startPlan(v);
              }}
              options={[
                { value: "", label: "Pick a deal…", color: "#8E98A8" },
                ...missing.map((d) => ({
                  value: d.id,
                  label: d.name,
                  /* The account's own mark on every row (Anir, Aug 28: "I
                     need the company profile picture on the plan a deal") —
                     the standing rule that a company on screen always brings
                     its logo, and seventy deals as seventy identical grey
                     dots said nothing about which account you were picking. */
                  logoName: d.customer,
                  /* SAY EACH THING ONCE (Anir, Aug 28: "why are you
                     repeating"). A deal is named after its offering and its
                     account — "GRI — Takeda (ARR)" — so printing "Takeda ·
                     GRI" beside it said the same two words twice. Only the
                     parts the name does not already carry survive; the
                     value always does, because a name never carries it. */
                  description: [
                    d.name.toLowerCase().includes(d.customer.toLowerCase())
                      ? null
                      : d.customer,
                    d.offeringLabel &&
                    !d.name.toLowerCase().includes(d.offeringLabel.toLowerCase())
                      ? d.offeringLabel
                      : null,
                    formatMoney(d.value),
                  ]
                    .filter(Boolean)
                    .join(" · "),
                })),
                /* The deal being edited stays selectable even though it is no
                   longer "missing a plan" — otherwise reopening an existing
                   plan shows an empty picker. */
                ...(editing.opportunityId && !missing.some((d) => d.id === editing.opportunityId)
                  ? [
                      {
                        value: editing.opportunityId,
                        label: dealById.get(editing.opportunityId)?.name ?? "This deal",
                        ...(dealById.get(editing.opportunityId)?.customer
                          ? { logoName: dealById.get(editing.opportunityId)!.customer }
                          : {}),
                        /* Same rule on the chosen row: the account only when
                           the deal's own name does not already say it. */
                        description: (() => {
                          const d = dealById.get(editing.opportunityId);
                          if (!d?.customer) return undefined;
                          return d.name.toLowerCase().includes(d.customer.toLowerCase())
                            ? undefined
                            : d.customer;
                        })(),
                      },
                    ]
                  : []),
              ]}
            />
          </Field>

          {!editing.opportunityId ? (
            /* THE DIALOG OPENS AT ITS WORKING SIZE (Anir, Aug 27: "why is
               the pop-up so small? It looks bad, but once I pick a deal, it
               looks good. Keep the size" — the third screenshot, the filled
               form, is the size he kept). The placeholder holds the height
               the form will occupy, so picking a deal fills the space
               instead of doubling the dialog under your cursor. */
            <p className="mt-4 flex min-h-[420px] items-center justify-center rounded-xl border border-dashed border-border-light bg-surface/40 px-4 py-6 text-center text-[12.5px] text-text-secondary">
              {missing.length === 0
                ? "Every open deal already has a plan. Nothing left to do here."
                : "Pick a deal above and its months appear here."}
            </p>
          ) : (
          <>
          <p className="mt-4 text-[12.5px] text-text-secondary">
            Spread the contract value across the months you expect it to land.
            Nothing here reschedules itself later: if the close date passes, the
            plan is flagged and you come back and change it.
          </p>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <Field label="Contract value (USD)">
              <Input
                value={editing.contractValue}
                inputMode="numeric"
                onChange={(e) =>
                  editFormula({
                    contractValue: e.target.value.replace(/[^0-9]/g, ""),
                  })
                }
              />
            </Field>
            <Field label="First month">
              <Input
                type="month"
                value={editing.startMonth}
                onChange={(e) => editFormula({ startMonth: e.target.value })}
              />
            </Field>
            <Field label="Number of months">
              <Input
                value={editing.months}
                inputMode="numeric"
                onChange={(e) =>
                  editFormula({ months: e.target.value.replace(/[^0-9]/g, "") })
                }
              />
            </Field>
          </div>
          {/* The table moves on its own now, so this stopped being the way to
              fill it in and became the way BACK: it lets go of every month
              somebody typed and re-splits the contract value clean. */}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <button
              type="button"
              onClick={applySpread}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border-light bg-white px-3 py-1.5 text-[12.5px] font-semibold text-blue-primary transition-colors hover:border-blue-subtle hover:bg-blue-light"
            >
              <Coins size={13} strokeWidth={2.2} />
              {editingRows.some((l) => l.pinned)
                ? "Start over, even split"
                : "Spread evenly"}
            </button>
            <span className="text-[12px] text-text-secondary">
              Type an amount to hold that month. The rest share what is left.
            </span>
          </div>

          {editingRows.length > 0 && (
            /* THE SCROLL BOX ENDS ON A ROW, NOT THROUGH ONE. The header used
               to sit inside the scrolling element, so its height ate into the
               budget and a twelve-month plan was cut off across the middle of
               April. Header outside, body inside, and the cap is exactly six
               rows of `h-11` — 264px — so the seventh is either fully there or
               fully below the fold. */
            <div className="mt-3 overflow-hidden rounded-lg border border-border-light">
              <table className="w-full table-fixed text-left">
                <thead className="bg-surface">
                  <tr className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary [&>th]:px-3 [&>th]:py-2">
                    <th className="w-1/2">Month</th>
                    <th className="w-1/2">Amount (USD)</th>
                  </tr>
                </thead>
              </table>
              <div className="max-h-[264px] overflow-y-auto border-t border-border-light">
              <table className="w-full table-fixed text-left">
                <tbody className="divide-y divide-border-light">
                  {editingRows.map((line, i) => (
                    <tr key={line.month || i} className="h-11">
                      <td className="w-1/2 px-3 py-1.5 text-[13px] font-semibold text-text-primary">
                        {monthLabel(line.month)}
                      </td>
                      <td className="w-1/2 px-3 py-1.5">
                        <input
                          value={line.amount}
                          placeholder="0"
                          inputMode="numeric"
                          aria-label={`Amount for ${monthLabel(line.month)}`}
                          onChange={(e) =>
                            editMonth(i, e.target.value.replace(/[^0-9]/g, ""))
                          }
                          className={cn(
                            "h-8 w-full rounded-md border px-2 text-[13px] tnum outline-none focus:border-blue-subtle",
                            /* A locked month is the one number on the table
                               that is not the app's arithmetic, so it says so
                               rather than looking identical to a share. */
                            line.pinned
                              ? "border-blue-subtle bg-blue-light/40 font-semibold text-text-primary"
                              : "border-border-light"
                          )}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          )}

          <p className="mt-2 text-[12.5px]">
            The months add up to{" "}
            <b className="tnum text-text-primary">{formatMoney(editingTotal)}</b>
            {editingValue > 0 && Math.abs(editingTotal - editingValue) > 1 && (
              <span className="font-semibold" style={{ color: AMBER }}>
                {" "}
                — that is {formatMoney(Math.abs(editingTotal - editingValue))}{" "}
                {editingTotal > editingValue ? "more" : "less"} than the contract
                value. Saving is allowed; the plan will be flagged.
              </span>
            )}
          </p>
          </>
          )}

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="rounded-lg border border-border-light px-3.5 py-2 text-[13px] font-semibold text-text-secondary transition-colors hover:bg-surface"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || !editing.opportunityId}
              onClick={savePlan}
              className="rounded-lg bg-blue-primary px-4 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              Save plan
            </button>
          </div>
        </Modal>
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
        open={confirmFreeze}
        onClose={() => setConfirmFreeze(false)}
        busy={busy}
        onConfirm={async () => {
          await post({ op: "freeze" }, "This month's sheet is frozen.");
          setConfirmFreeze(false);
        }}
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
