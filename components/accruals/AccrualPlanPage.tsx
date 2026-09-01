"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import { SmartBack } from "@/components/ui/BackButton";
import { InfoHint } from "@/components/ui/InfoHint";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
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

      {/* ONE LINE, NOT THREE CARDS (Anir, Sep 1: "you can just significantly
          make this UI look a lot better... I don't know what this is").

          The three tiles said one fact three times: the contract is $150K,
          the months come to $150K, and — as a third card, with a tick — that
          those two match. Three restatements of a sum, taking a quarter of
          the screen above the thing you actually came to edit. It is one
          sentence, and the only part worth a colour is the part where the two
          numbers DISAGREE. */}
      <div
        className={cn(
          "mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border px-4 py-3",
          off === 0
            ? "border-border-light bg-white"
            : "border-[rgba(180,83,9,0.3)] bg-[rgba(180,83,9,0.05)]"
        )}
      >
        <span className="flex items-baseline gap-2">
          <span className="text-[11.5px] text-text-tertiary">Contract</span>
          <b className="text-[16px] tnum text-text-primary">{money(target)}</b>
        </span>
        <span className="text-text-tertiary" aria-hidden="true">
          &rarr;
        </span>
        <span className="flex items-baseline gap-2">
          <span className="text-[11.5px] text-text-tertiary">
            Planned over {lines.length}{" "}
            {lines.length === 1 ? "month" : "months"}
          </span>
          <b className="text-[16px] tnum text-text-primary">{money(planned)}</b>
        </span>
        <span className="flex-1" />
        {off === 0 ? (
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-[color:#1A7A35]">
            <Check size={15} strokeWidth={2.6} />
            The months add up
          </span>
        ) : (
          <span className="text-[13px] font-semibold text-[color:#B45309]">
            {off > 0 ? "Over by" : "Short by"} {money(Math.abs(off))} &mdash;
            the months do not add up to the contract
          </span>
        )}
      </div>

      <div className="mt-5">
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

          {/* THE SHAPE, WHERE THE DEAD SPACE WAS.
              Anir, Sep 1: "I think you can just significantly make this UI
              look a lot better, to be honest. I don't know what this is."

              Six numbers were taking 400px of a two-column table whose middle
              was empty: the month sat at the far left, its amount box at the
              far right, and a hand-span of nothing in between. On a screen
              whose entire subject is HOW the money is distributed, that empty
              middle is exactly where the distribution belongs.

              So each row draws its own share as a bar. Flat, front-loaded or
              tailing off is now visible while you type rather than only after
              you save and look at the list. Rows are tighter too — the bar
              carries the reading, so the row does not need the height. */}
          <div className="mt-4 overflow-hidden rounded-xl border border-border-light">
            <div className="flex items-center gap-4 border-b border-border-light bg-surface px-3 py-2 text-[11px] font-bold uppercase tracking-[0.04em] text-text-tertiary">
              <span className="w-[96px] shrink-0">Month</span>
              <span className="min-w-0 flex-1">Share</span>
              <span className="w-[150px] shrink-0">Amount (USD)</span>
            </div>
            {lines.map((l, i) => {
              const amount = Number(l.amount) || 0;
              /* Against the BIGGEST month, not the contract: with an even
                 spread every bar would otherwise sit at a sixth of the width
                 and the row would look empty on a plan that is perfectly
                 fine. Measured against the peak, an even split reads as six
                 full bars, which is what "even" should look like. */
              const peak = Math.max(
                ...lines.map((x) => Number(x.amount) || 0),
                1
              );
              const share = planned > 0 ? (amount / planned) * 100 : 0;
              return (
                <div
                  key={l.month}
                  className="flex items-center gap-4 border-b border-border-light px-3 py-2 last:border-b-0"
                >
                  <span className="w-[96px] shrink-0 text-[13px] font-semibold text-text-primary">
                    {monthLabel(l.month)}
                  </span>
                  <span className="flex min-w-0 flex-1 items-center gap-2.5">
                    <span
                      aria-hidden="true"
                      className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface"
                    >
                      <span
                        className="block h-full rounded-full transition-[width] duration-200"
                        style={{
                          width: `${Math.max((amount / peak) * 100, amount > 0 ? 2 : 0)}%`,
                          background: l.pinned ? "#0071E3" : "#7C3AED",
                        }}
                      />
                    </span>
                    <span className="w-[42px] shrink-0 text-[11.5px] tnum text-text-tertiary">
                      {share > 0 ? `${Math.round(share)}%` : ""}
                    </span>
                  </span>
                  <input
                    value={l.amount}
                    disabled={!canWrite}
                    inputMode="numeric"
                    aria-label={`Amount for ${monthLabel(l.month)}`}
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
                      "h-[34px] w-[150px] shrink-0 rounded-lg border px-3 text-[13px] font-semibold text-text-primary outline-none focus:border-blue-primary disabled:bg-surface",
                      l.pinned ? "border-blue-primary" : "border-border-light"
                    )}
                  />
                </div>
              );
            })}
          </div>

          {/* THE BUTTON LIVES WITH THE THING IT SAVES (Anir, Sep 1: "are you
              telling me this stuff on the right is saving what's on the left?"
              — and, once told: "that's the worst UI in the world, and it's so
              unclear").

              He is right. The months were in one card and the button that
              saved them in a separate card beside it, under its own heading.
              Two cards side by side read as two independent things, so the
              button looked like it belonged to the Note it sat under — which
              is exactly how he read it, twice, and why he pressed it without
              knowing what he had done.

              One card now, and the save is the last thing in it: the months,
              then a note about them, then the button that writes them down.
              Nothing to the right of it to be confused with. */}
          <div className="mt-5 border-t border-border-light pt-4">
            <label className="block">
              <span className="mb-1 block text-[12px] font-semibold text-text-primary">
                Note
                <span className="ml-1.5 font-normal text-text-tertiary">
                  optional, for whoever reads this next
                </span>
              </span>
              <textarea
                value={note}
                disabled={!canWrite}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Why the money lands this way."
                className="w-full resize-y rounded-lg border border-border-light px-3 py-2 text-[13px] text-text-primary outline-none focus:border-blue-primary disabled:bg-surface"
              />
            </label>
            {canWrite && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="flex items-center gap-1.5 text-[12.5px] text-text-secondary">
                  Saves the {lines.length}{" "}
                  {lines.length === 1 ? "month" : "months"} above.
                  <InfoHint text="A deal signs on one date but is earned over several months. This is where you say which: a $150K deal over six months is $25K a month. It matters because close dates answer the wrong question — they say a six-month deal signed in September earns nothing in January, when it earns a sixth of itself. Saving moves no money and tells nobody. Freeze a month later and anything that shifts out of it is flagged, so revenue cannot slide quietly into next quarter." />
                </p>
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={busy}
                  className="inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-blue-primary px-5 py-2.5 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {busy && <Loader2 size={14} className="animate-spin" />}
                  Save these months
                </button>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
