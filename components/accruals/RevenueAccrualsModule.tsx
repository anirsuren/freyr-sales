"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
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
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatTile } from "@/components/ui/StatTile";
import { PageToolbar } from "@/components/ui/PageToolbar";
import { ColorSelect } from "@/components/ui/ColorSelect";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { InfoHint } from "@/components/ui/InfoHint";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { Field, Input } from "@/components/ui/Input";
import { formatMoney } from "@/lib/pipeline";
import { BarChart } from "@/components/charts/Charts";
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
  lines: { month: string; amount: string }[];
  note: string;
};

const AMBER = "#B45309";

export function RevenueAccrualsModule({
  state: initial,
  deals,
  canWrite,
}: {
  state: RevenueAccrualsState;
  deals: DealOption[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [state, setState] = useState(initial);
  const [query, setQuery] = useState("");
  const [only, setOnly] = useState<"all" | "flagged" | "missing">("all");
  const [tab, setTab] = useState<"plans" | "deviation">("plans");
  const [editing, setEditing] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  /** The deal picker "Plan a deal" opens. A button that says it plans a
   *  deal has to ask which deal, not quietly change a filter behind you. */
  const [picking, setPicking] = useState(false);
  const [pickQuery, setPickQuery] = useState("");
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

  function startPlan(dealId: string, existing?: AccrualPlan) {
    const deal = dealById.get(dealId);
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
      lines: (existing?.lines ?? spreadEvenly(contractValue, startMonth, months)).map(
        (l) => ({ month: l.month, amount: String(l.amount) })
      ),
      note: existing?.note ?? "",
    });
  }

  /** "You give them a simple formula: this is the contract value." */
  function applySpread() {
    if (!editing) return;
    const value = Number(editing.contractValue) || 0;
    const months = Math.max(1, Math.min(60, Number(editing.months) || 1));
    setEditing({
      ...editing,
      months: String(months),
      lines: spreadEvenly(value, editing.startMonth, months).map((l) => ({
        month: l.month,
        amount: String(l.amount),
      })),
    });
  }

  async function savePlan() {
    if (!editing) return;
    const deal = dealById.get(editing.opportunityId);
    if (!deal) {
      toast("Pick an opportunity first.", "error");
      return;
    }
    const lines = editing.lines
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

  const editingTotal = editing
    ? editing.lines.reduce((s, l) => s + (Number(l.amount) || 0), 0)
    : 0;
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
                onClick={() => setPicking(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-primary px-4 py-2 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90"
              >
                <Plus size={15} strokeWidth={2.4} /> Plan a deal
              </button>
            </div>
          ) : (
            <span className="rounded-full bg-[rgba(0,113,227,0.08)] px-2.5 py-1 text-[11px] font-semibold text-blue-primary">
              Sample plan. Switch to Real mode to work the live numbers
            </span>
          )
        }
      />

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          icon={Coins}
          label="Planned revenue"
          value={formatMoney(plannedTotal)}
          sub={`${state.plans.length} ${state.plans.length === 1 ? "deal" : "deals"} planned`}
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
        <StatTile
          icon={deviation.totalDelta < 0 ? TrendingDown : TrendingUp}
          label="Moved since last sheet"
          value={
            deviation.againstMonth
              ? `${deviation.totalDelta >= 0 ? "+" : "-"}${formatMoney(Math.abs(deviation.totalDelta))}`
              : "—"
          }
          color={deviation.totalDelta < 0 ? AMBER : "#16A34A"}
          sub={
            deviation.againstMonth
              ? `against ${monthLabel(deviation.againstMonth)}`
              : "freeze a month to start comparing"
          }
        />
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
            {/* WHEN THE MONEY IS PLANNED TO LAND, drawn. A column per month
                across everything on screen, so the filters and the grouping
                change the picture rather than only the list. */}
            {monthChart.length > 0 && (
              <section className="mt-4 rounded-xl border border-border-light bg-white p-5 pb-2.5 shadow-card">
                <h2 className="flex items-center gap-2 text-[15px] font-semibold text-text-primary">
                  <CalendarRange size={15} strokeWidth={2} className="text-blue-primary" />
                  When this money is planned to land
                  <InfoHint text="Every plan on screen, summed by month. A solid column is money on a plan nobody needs to revisit. The hatched part is money sitting on a flagged plan, and an amber column is a month that has already gone by." />
                </h2>
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
                  <BarChart
                    hideLabelDots
                    data={monthChart}
                    height={180}
                    format="money"
                  />
                </div>
              </section>
            )}

            <div className="mt-4 space-y-2.5">
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
                return (
                  <section
                    key={plan.id}
                    data-accrual-plan={plan.opportunityId}
                    className={cn(
                      "overflow-hidden rounded-xl border bg-white shadow-card transition-colors",
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
                        (verdict.invalid
                          ? "[box-shadow:inset_3px_0_0_0_#B45309]"
                          : "[box-shadow:inset_3px_0_0_0_var(--blue-primary)]")
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setOpenDeal(isOpen ? null : plan.id)}
                      aria-expanded={isOpen}
                      className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-blue-light/25"
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
                      <span className="shrink-0 text-right">
                        <span className="block text-[14px] font-bold tnum text-text-primary">
                          {formatMoney(planTotal(plan))}
                        </span>
                        <span className="block text-[11.5px] tnum text-text-secondary">
                          over {plan.lines.length}{" "}
                          {plan.lines.length === 1 ? "month" : "months"}
                        </span>
                      </span>
                      <ChevronDown
                        size={16}
                        strokeWidth={2.2}
                        className={cn(
                          "shrink-0 text-text-tertiary transition-transform",
                          !isOpen && "-rotate-90"
                        )}
                      />
                    </button>

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
                              color: past ? AMBER : "#0071E3",
                              tip: [
                                { name: "Planned", value: formatMoney(line.amount) },
                                { name: "Cumulative by then", value: formatMoney(running) },
                                ...(past
                                  ? [{ name: "This month has passed", sub: "re-plan it or close the deal" }]
                                  : []),
                              ],
                            };
                          });
                          const total = planTotal(plan);
                          let acc = 0;
                          return (
                            <div className="rounded-xl border border-border-light bg-surface/40 p-3.5">
                              <BarChart
                                hideLabelDots
                                data={bars}
                                height={210}
                                format="money"
                              />
                              {/* Labelled, and separated from the chart by a
                                  rule — an unlabelled grey strip under a
                                  scrolling chart reads as a scrollbar (Anir,
                                  Aug 26). */}
                              <div className="mt-3 border-t border-border-light pt-3">
                              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                                How the money arrives, month by month
                              </p>
                              <div className="flex h-2.5 overflow-hidden rounded-full bg-[color:var(--surface)] ring-1 ring-inset ring-border-light">
                                {plan.lines.map((line) => {
                                  acc += line.amount;
                                  const past = line.month < now;
                                  return (
                                    <span
                                      key={line.month}
                                      title={`${monthLabel(line.month)} · ${formatMoney(line.amount)} · ${Math.round((acc / (total || 1)) * 100)}% cumulative`}
                                      className="h-full border-r-2 border-white last:border-r-0"
                                      style={{
                                        width: `${(line.amount / (total || 1)) * 100}%`,
                                        background: past ? AMBER : "#0071E3",
                                        opacity: past ? 1 : 0.55 + 0.45 * (acc / (total || 1)),
                                      }}
                                    />
                                  );
                                })}
                              </div>
                              <p className="mt-2 flex flex-wrap items-center gap-x-4 text-[11.5px] text-text-secondary tnum">
                                <span>
                                  First month{" "}
                                  <b className="text-text-primary">
                                    {monthLabel(plan.lines[0]?.month ?? "")}
                                  </b>
                                </span>
                                <span>
                                  Last month{" "}
                                  <b className="text-text-primary">
                                    {monthLabel(plan.lines[plan.lines.length - 1]?.month ?? "")}
                                  </b>
                                </span>
                                <span>
                                  Average a month{" "}
                                  <b className="text-text-primary">
                                    {formatMoney(Math.round(total / (plan.lines.length || 1)))}
                                  </b>
                                </span>
                                <span>
                                  Biggest month{" "}
                                  <b className="text-text-primary">
                                    {formatMoney(Math.max(...plan.lines.map((l) => l.amount), 0))}
                                  </b>
                                </span>
                              </p>
                              </div>
                            </div>
                          );
                        })()}
                        <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px] text-text-secondary">
                          <span>
                            Contract value{" "}
                            <b className="tnum text-text-primary">
                              {formatMoney(plan.contractValue)}
                            </b>
                          </span>
                          {deal?.estSignDate && (
                            <span>
                              Est. close{" "}
                              <b className="tnum text-text-primary">
                                {formatDate(deal.estSignDate)}
                              </b>
                            </span>
                          )}
                          <span>
                            Updated by <b>{plan.updatedBy}</b>{" "}
                            {formatDate(plan.updatedAt)}
                          </span>
                          <Link
                            href={`/opportunities?deal=${encodeURIComponent(plan.opportunityId)}`}
                            className="font-semibold text-blue-primary hover:underline"
                          >
                            Open the deal
                          </Link>
                          {canWrite && (
                            <span className="ml-auto flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => startPlan(plan.opportunityId, plan)}
                                className="inline-flex items-center gap-1 rounded-lg border border-border-light px-2.5 py-1.5 text-[12px] font-semibold text-text-secondary transition-colors hover:border-blue-subtle hover:text-blue-primary"
                              >
                                <Pencil size={12} strokeWidth={2.2} /> Re-plan
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDelete(plan)}
                                className="rounded-lg p-1.5 text-text-tertiary transition-colors hover:bg-[rgba(220,38,38,0.08)] hover:text-[color:#DC2626]"
                                title="Delete this plan"
                              >
                                <Trash2 size={13} strokeWidth={2.2} />
                              </button>
                            </span>
                          )}
                        </div>
                      </div>
                    )}
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
          title={`Accrual plan · ${dealById.get(editing.opportunityId)?.name ?? "deal"}`}
          /* ONE SIZE FOR EVERY FORM DIALOG (Anir, Aug 26: "all the pop-ups,
             let's just make it a set size"). These were "wide" (640px), which
             is too narrow for a two-column form — the fields stacked and the
             dialog came out tall and thin. "workflow" is 980px, the width the
             Solutioning request dialog already uses, and the floor below stops
             a short form collapsing into a strip. */
          size="workflow"
        >
          <p className="text-[12.5px] text-text-secondary">
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
                  setEditing({
                    ...editing,
                    contractValue: e.target.value.replace(/[^0-9]/g, ""),
                  })
                }
              />
            </Field>
            <Field label="First month">
              <Input
                type="month"
                value={editing.startMonth}
                onChange={(e) =>
                  setEditing({ ...editing, startMonth: e.target.value })
                }
              />
            </Field>
            <Field label="Number of months">
              <Input
                value={editing.months}
                inputMode="numeric"
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    months: e.target.value.replace(/[^0-9]/g, ""),
                  })
                }
              />
            </Field>
          </div>
          <button
            type="button"
            onClick={applySpread}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-border-light bg-white px-3 py-1.5 text-[12.5px] font-semibold text-blue-primary transition-colors hover:border-blue-subtle hover:bg-blue-light"
          >
            <Coins size={13} strokeWidth={2.2} /> Spread evenly
          </button>

          {editing.lines.length > 0 && (
            <div className="mt-3 max-h-[280px] overflow-y-auto rounded-lg border border-border-light">
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-surface">
                  <tr className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary [&>th]:px-3 [&>th]:py-2">
                    <th className="w-1/2">Month</th>
                    <th className="w-1/2">Amount (USD)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-light">
                  {editing.lines.map((line, i) => (
                    <tr key={line.month || i}>
                      <td className="px-3 py-1.5 text-[13px] font-semibold text-text-primary">
                        {monthLabel(line.month)}
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          value={line.amount}
                          inputMode="numeric"
                          aria-label={`Amount for ${monthLabel(line.month)}`}
                          onChange={(e) => {
                            const lines = [...editing.lines];
                            lines[i] = {
                              ...line,
                              amount: e.target.value.replace(/[^0-9]/g, ""),
                            };
                            setEditing({ ...editing, lines });
                          }}
                          className="h-8 w-full rounded-md border border-border-light px-2 text-[13px] tnum outline-none focus:border-blue-subtle"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
              disabled={busy}
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

      {/* PICK THE DEAL, THEN PLAN IT (Anir, Aug 26: "when I press Plan a Deal
          I'm expecting a pop-up… why is it giving me this thing?"). It used to
          flip the list to a filtered view, which reads as the page changing
          under you rather than as an answer to the button you pressed. */}
      {picking && (
        <Modal
          open
          onClose={() => {
            setPicking(false);
            setPickQuery("");
          }}
          title="Which deal are you planning?"
          size="workflow"
        >
          <div className="flex min-h-[420px] flex-col">
            <p className="text-[12.5px] text-text-secondary">
              Pick an open deal and say which months you expect its money in.
              Only deals carrying a value can be planned.
            </p>
            <input
              value={pickQuery}
              onChange={(e) => setPickQuery(e.target.value)}
              placeholder="Search deals by name or customer"
              aria-label="Search deals to plan"
              className="mt-3 h-9 w-full rounded-lg border border-border-light bg-white px-3 text-[13px] outline-none transition-colors focus:border-blue-subtle"
            />
            {(() => {
              const q = pickQuery.trim().toLowerCase();
              const rows = missing.filter(
                (d) =>
                  !q ||
                  `${d.name} ${d.customer}`.toLowerCase().includes(q)
              );
              if (missing.length === 0) {
                return (
                  <p className="mt-6 text-center text-[13px] text-text-secondary">
                    Every open deal already has a plan. Nothing left to do here.
                  </p>
                );
              }
              if (rows.length === 0) {
                return (
                  <p className="mt-6 text-center text-[13px] text-text-secondary">
                    No open deal without a plan matches “{pickQuery.trim()}”.
                  </p>
                );
              }
              return (
                <div className="mt-3 flex-1 overflow-y-auto rounded-xl border border-border-light">
                  {rows.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      data-pick-deal={d.id}
                      onClick={() => {
                        setPicking(false);
                        setPickQuery("");
                        startPlan(d.id);
                      }}
                      className="flex w-full cursor-pointer items-center gap-3 border-b border-border-light px-3.5 py-2.5 text-left transition-colors last:border-0 hover:bg-blue-light/40"
                    >
                      <CompanyLogo name={d.customer} className="h-7 w-7 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold text-text-primary">
                          {d.name}
                        </span>
                        <span className="block truncate text-[12px] text-text-secondary">
                          {d.customer}
                          {d.offeringLabel && ` · ${d.offeringLabel}`}
                          {d.estSignDate && ` · est. ${formatDate(d.estSignDate)}`}
                        </span>
                      </span>
                      <span className="shrink-0 text-[13px] font-semibold tnum text-text-primary">
                        {formatMoney(d.value)}
                      </span>
                    </button>
                  ))}
                </div>
              );
            })()}
          </div>
        </Modal>
      )}

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
