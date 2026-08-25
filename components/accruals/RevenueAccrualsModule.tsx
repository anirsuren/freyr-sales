"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarRange,
  ChevronDown,
  Coins,
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
import { cn, formatDate } from "@/lib/utils";
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
  live,
  canWrite,
}: {
  state: RevenueAccrualsState;
  deals: DealOption[];
  live: boolean;
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
  const [confirmFreeze, setConfirmFreeze] = useState(false);
  const [confirmUnfreeze, setConfirmUnfreeze] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AccrualPlan | null>(null);
  const [openDeal, setOpenDeal] = useState<string | null>(null);
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
      .sort(
        (a, b) =>
          Number(b.verdict.invalid) - Number(a.verdict.invalid) ||
          planTotal(b.plan) - planTotal(a.plan)
      );
  }, [judged, query, only]);

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
    setEditing({
      opportunityId: dealId,
      contractValue: String(existing?.contractValue ?? deal?.value ?? 0),
      startMonth,
      months: String(existing?.lines.length || 6),
      lines: (existing?.lines ?? []).map((l) => ({
        month: l.month,
        amount: String(l.amount),
      })),
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
          live && canWrite ? (
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
                onClick={() => setOnly("missing")}
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
          <PageToolbar
            query={query}
            onQuery={setQuery}
            placeholder="Search by deal, customer or offering"
            searchAriaLabel="Search accrual plans"
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
                    label: `No numbers yet (${missing.length})`,
                    color: AMBER,
                  },
                ]}
              />
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
                  Open deals with no accrual numbers
                  <InfoHint text="Suren, Aug 25: 'at the report level there are so many projects where there is no accrual numbers — so then they have to go and fill that.' These are the deals carrying money that nobody has spread across months yet." />
                </h2>
                <p className="mt-0.5 text-[12.5px] text-text-secondary">
                  {missing.length} {missing.length === 1 ? "deal" : "deals"} worth{" "}
                  {formatMoney(missing.reduce((s, d) => s + d.value, 0))} with
                  nothing planned.
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
                      {live && canWrite && (
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
                  ? "An accrual plan says when a deal's money is expected to land, month by month. Use “No numbers yet” to see which open deals still need one."
                  : "Clear the search or the filter."
              }
            />
          ) : (
            <div className="mt-4 space-y-2.5">
              {shown.map(({ plan, deal, verdict }) => {
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
                          : "border-border-light"
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
                      <div className="border-t border-border-light px-4 py-3.5">
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
                        <div className="flex flex-wrap gap-1.5">
                          {plan.lines.map((line) => {
                            const past = line.month < monthKey(new Date());
                            return (
                              <span
                                key={line.month}
                                className={cn(
                                  "rounded-lg border px-2.5 py-1.5 text-[12px]",
                                  past
                                    ? "border-[rgba(180,83,9,0.3)] bg-[rgba(180,83,9,0.06)]"
                                    : "border-border-light bg-surface/60"
                                )}
                              >
                                <span className="block text-[10.5px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
                                  {monthLabel(line.month)}
                                </span>
                                <span
                                  className="block font-bold tnum"
                                  style={past ? { color: AMBER } : undefined}
                                >
                                  {formatMoney(line.amount)}
                                </span>
                              </span>
                            );
                          })}
                        </div>
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
                          {live && canWrite && (
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
          )}
        </div>
      ) : (
        <div key="deviation" className="tab-panel mt-4">
          {!deviation.againstMonth ? (
            <EmptyState
              icon={Lock}
              title="No frozen sheet to compare against yet"
              description="Freeze this month once and every later change is measured against it: which months moved, and which deals moved them. Suren's words: “by July end we are freezing; on August 1st we are developing another sheet, then comparing these two.”"
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
          size="wide"
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
