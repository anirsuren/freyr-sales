"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Coins, Loader2, Sparkles } from "lucide-react";
import { SmartBack } from "@/components/ui/BackButton";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { StatTile } from "@/components/ui/StatTile";
import { useToast } from "@/components/ui/Toast";
import {
  monthKey,
  monthLabel,
  monthsFrom,
  spreadEvenly,
  type AccrualPlan,
} from "@/lib/revenueAccrualsShared";
import { cn } from "@/lib/utils";

/**
 * PLANNING ONE DEAL'S ACCRUAL, AS A PAGE.
 *
 * Anir, Aug 30: "I don't think he wants it to be like this. I'm pretty sure he
 * wants it to be a page instead of a popup."
 *
 * The form grows with the plan — a row per month — so a twelve-month spread
 * scrolled inside a fixed sheet, on top of the table it was editing. Here the
 * months have the room they need and the totals sit beside them.
 *
 * THE MATHS IS THE SHARED ONE. spreadEvenly and the pinning rule come from
 * lib/revenueAccrualsShared, the same functions the dialog uses, so a plan
 * built here and a plan built there cannot round differently.
 */

type Deal = {
  id: string;
  name: string;
  customer: string;
  customerId?: string;
  offeringId?: string;
  offeringLabel?: string;
  value: number;
  status?: string;
  estSignDate?: string;
};

type Line = { month: string; amount: string; pinned?: boolean };

function money(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

export function AccrualPlanPage({
  plan,
  deal,
  canWrite,
  live,
}: {
  plan: AccrualPlan | null;
  deal: Deal;
  canWrite: boolean;
  live: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const [contractValue, setContractValue] = useState(
    String(plan?.contractValue ?? deal.value ?? 0)
  );
  const [startMonth, setStartMonth] = useState(
    plan?.lines[0]?.month ??
      (deal.estSignDate ? monthKey(deal.estSignDate) : monthKey(new Date()))
  );
  const [count, setCount] = useState(String(plan?.lines.length || 6));
  const [lines, setLines] = useState<Line[]>(
    plan?.lines.length
      ? plan.lines.map((l) => ({ month: l.month, amount: String(l.amount) }))
      : spreadEvenly(deal.value ?? 0, startMonth, 6).map((l) => ({
          month: l.month,
          amount: String(l.amount),
        }))
  );
  const [note, setNote] = useState(plan?.note ?? "");

  const planned = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const target = Number(contractValue) || 0;
  const off = planned - target;

  /** Re-spread whatever is not pinned across the chosen months. */
  function reshape(next: {
    contractValue?: string;
    startMonth?: string;
    count?: string;
    lines?: Line[];
  }) {
    const value = Number(next.contractValue ?? contractValue) || 0;
    const start = next.startMonth ?? startMonth;
    const n = Math.max(1, Math.min(60, Number(next.count ?? count) || 1));
    const current = next.lines ?? lines;
    const keys = monthsFrom(start, n);

    const locked = keys.map((_, i) =>
      current[i]?.pinned ? Number(current[i]?.amount) || 0 : null
    );
    const loose = locked.filter((a) => a === null).length;
    const left = Math.max(
      0,
      value - locked.reduce((sum: number, a) => sum + (a ?? 0), 0)
    );
    const per = loose ? Math.floor(left / loose) : 0;
    let seen = 0;

    setLines(
      keys.map((month, i) => {
        if (locked[i] !== null)
          return { month, amount: String(locked[i]), pinned: true };
        seen += 1;
        const share = seen === loose ? left - per * (loose - 1) : per;
        return { month, amount: String(share) };
      })
    );
  }

  async function save() {
    const rows = lines
      .map((l) => ({ month: l.month, amount: Math.round(Number(l.amount) || 0) }))
      .filter((l) => l.month);
    if (!rows.length) {
      toast("Add at least one month, or press Spread evenly.", "error");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/revenue-accruals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: "save",
          plan: {
            opportunityId: deal.id,
            opportunityName: deal.name,
            customer: deal.customer,
            customerId: deal.customerId,
            offeringId: deal.offeringId,
            offeringLabel: deal.offeringLabel,
            contractValue: Math.round(target),
            ...(deal.estSignDate ? { signDateAtPlan: deal.estSignDate } : {}),
            lines: rows,
            note,
          },
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast(data?.error || "That didn't save.", "error");
        return;
      }
      toast("Accrual plan saved.");
      router.push("/revenue-accruals");
      router.refresh();
    } catch {
      toast("That didn't save.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <SmartBack
        fallback="/revenue-accruals"
        className="mb-4 inline-flex cursor-pointer items-center gap-1.5 text-[13px] text-text-secondary hover:text-blue-primary"
      >
        <ArrowLeft size={15} strokeWidth={1.8} /> All accruals
      </SmartBack>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <CompanyLogo name={deal.customer} className="mt-0.5 h-11 w-11 shrink-0" />
          <div className="min-w-0">
            <h1 className="truncate text-[24px] font-semibold tracking-[-0.02em] text-text-primary">
              {deal.name}
            </h1>
            <p className="mt-1 truncate text-[13px] text-text-secondary">
              {deal.customer}
              {deal.offeringLabel ? ` · ${deal.offeringLabel}` : ""}
              {deal.estSignDate ? ` · signs ${deal.estSignDate}` : ""}
            </p>
          </div>
        </div>
        {!canWrite && (
          <span className="rounded-full bg-surface px-2.5 py-1 text-[11.5px] font-semibold text-text-secondary">
            {live
              ? "You can see this plan, but not change it"
              : "Sample plan. Switch to Real mode to work the live numbers"}
          </span>
        )}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile icon={Coins} label="Contract value" value={money(target)} sub="what is being spread" />
        <StatTile
          icon={Sparkles}
          label="Planned across the months"
          value={money(planned)}
          sub={`${lines.length} ${lines.length === 1 ? "month" : "months"}`}
        />
        <StatTile
          icon={Coins}
          label={off === 0 ? "It adds up" : off > 0 ? "Over by" : "Short by"}
          value={off === 0 ? "✓" : money(Math.abs(off))}
          color={off === 0 ? "#1A7A35" : "#B45309"}
          warn={off !== 0}
          sub={off === 0 ? "months match the contract" : "months do not match the contract"}
        />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0 rounded-xl border border-border-light bg-white p-5 shadow-card">
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-0 flex-1">
              <span className="mb-1 block text-[11.5px] text-text-tertiary">
                Contract value (USD)
              </span>
              <input
                value={contractValue}
                disabled={!canWrite}
                inputMode="numeric"
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9]/g, "");
                  setContractValue(v);
                  reshape({ contractValue: v });
                }}
                className="h-[38px] w-full rounded-lg border border-border-light px-3 text-[13px] font-semibold text-text-primary outline-none focus:border-blue-primary disabled:bg-surface"
              />
            </label>
            <label className="min-w-0 flex-1">
              <span className="mb-1 block text-[11.5px] text-text-tertiary">
                First month
              </span>
              <input
                type="month"
                value={startMonth}
                disabled={!canWrite}
                onChange={(e) => {
                  setStartMonth(e.target.value);
                  reshape({ startMonth: e.target.value });
                }}
                className="h-[38px] w-full rounded-lg border border-border-light px-3 text-[13px] font-semibold text-text-primary outline-none focus:border-blue-primary disabled:bg-surface"
              />
            </label>
            <label className="w-[130px] shrink-0">
              <span className="mb-1 block text-[11.5px] text-text-tertiary">
                Number of months
              </span>
              <input
                value={count}
                disabled={!canWrite}
                inputMode="numeric"
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9]/g, "");
                  setCount(v);
                  reshape({ count: v });
                }}
                className="h-[38px] w-full rounded-lg border border-border-light px-3 text-[13px] font-semibold text-text-primary outline-none focus:border-blue-primary disabled:bg-surface"
              />
            </label>
            {canWrite && (
              <button
                type="button"
                onClick={() =>
                  setLines(
                    spreadEvenly(target, startMonth, Number(count) || 1).map((l) => ({
                      month: l.month,
                      amount: String(l.amount),
                    }))
                  )
                }
                className="h-[38px] shrink-0 rounded-lg border border-border-light px-3.5 text-[13px] font-semibold text-blue-primary transition-colors hover:bg-blue-light"
              >
                Spread evenly
              </button>
            )}
          </div>

          <p className="mt-2 text-[12px] text-text-tertiary">
            Type an amount to hold that month. The rest share what is left.
          </p>

          <div className="mt-4 overflow-hidden rounded-xl border border-border-light">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-border-light bg-surface">
                  <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-[0.04em] text-text-tertiary">
                    Month
                  </th>
                  <th className="px-3 py-2 text-right text-[11px] font-bold uppercase tracking-[0.04em] text-text-tertiary">
                    Amount (USD)
                  </th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={l.month} className="border-b border-border-light last:border-b-0">
                    <td className="px-3 py-2 text-[13px] font-semibold text-text-primary">
                      {monthLabel(l.month)}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <input
                        value={l.amount}
                        disabled={!canWrite}
                        inputMode="numeric"
                        onChange={(e) => {
                          const next = [...lines];
                          next[i] = {
                            ...next[i],
                            amount: e.target.value.replace(/[^0-9]/g, ""),
                            pinned: true,
                          };
                          setLines(next);
                          reshape({ lines: next });
                        }}
                        className={cn(
                          "h-[34px] w-[160px] rounded-lg border px-3 text-right text-[13px] font-semibold text-text-primary outline-none focus:border-blue-primary disabled:bg-surface",
                          l.pinned ? "border-blue-primary" : "border-border-light"
                        )}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="min-w-0">
          <section className="rounded-xl border border-border-light bg-white p-5 shadow-card">
            {/* SAY WHAT THE BUTTON DOES BEFORE SOMEBODY PRESSES IT.
                Anir, Sep 1: "What the hell does 'create the plan' mean? I
                don't know what this button does on the right side... I just
                pressed it. I don't even know what I did."

                Fair. A blue button called "Create the plan" sat under a Note
                box with nothing on the page saying what a plan IS, so it read
                as "save the note" and gave no clue whether pressing it moved
                money, told anyone, or counted towards a target. The answer —
                it records the schedule and moves nothing — was written down in
                lib/revenueAccruals and never said out loud to the person
                deciding whether to click.

                The negative is the important half: Suren's rule is that
                nothing auto-pushes, and a person cannot rely on that unless
                they are told it. */}
            <p className="text-[13px] font-semibold text-text-primary">
              What this saves
            </p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-text-secondary">
              The month-by-month split on the left: how this deal&apos;s{" "}
              <b>{money(target)}</b> is expected to land. It is a plan, not a
              payment.
            </p>
            <ul className="mt-2.5 space-y-1.5 text-[12.5px] text-text-secondary">
              <li className="flex gap-2">
                <span className="text-text-tertiary">·</span>
                <span>
                  It does <b>not</b> move any money, and it does not count
                  towards anyone&apos;s goal.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-text-tertiary">·</span>
                <span>
                  Nobody is notified. You can come back and change it whenever
                  the deal changes.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-text-tertiary">·</span>
                <span>
                  If a month later comes up short, it gets flagged here rather
                  than quietly shifted.
                </span>
              </li>
            </ul>

            <label className="mt-4 block border-t border-border-light pt-4">
              <span className="mb-1 block text-[11.5px] text-text-tertiary">
                Note
                <span className="ml-1.5 text-text-tertiary">
                  optional, for whoever reads this next
                </span>
              </span>
              <textarea
                value={note}
                disabled={!canWrite}
                onChange={(e) => setNote(e.target.value)}
                rows={4}
                placeholder="Why the money lands this way."
                className="w-full resize-y rounded-lg border border-border-light px-3 py-2 text-[13px] text-text-primary outline-none focus:border-blue-primary disabled:bg-surface"
              />
            </label>
            {canWrite && (
              <button
                type="button"
                onClick={() => void save()}
                disabled={busy}
                className="mt-3 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-blue-primary px-4 py-2.5 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {busy && <Loader2 size={14} className="animate-spin" />}
                {/* The button names the thing it acts on, not an abstraction:
                    "the plan" meant nothing until the card above it said so,
                    and even now the months are what you are saving. */}
                {plan ? "Save this month split" : "Save this month split"}
              </button>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
