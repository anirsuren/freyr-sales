"use client";

/**
 * NOTHING ROUTES TO THIS FILE ANY MORE. Read the block below before you wire
 * it back up.
 *
 * Suren, Sep 1, with this page and the accrual dialog open beside each other:
 * "I don't want a different screen. It has to be consistent... this screen is
 * confusing, this screen is better" — pointing at the dialog. And on the deal
 * page: "It's NOT a revenue accrual tab... I think the same screen from there,
 * both the screens have to be the same. It's just that same screen shows up
 * here."
 *
 * So the one accrual screen in the app is components/accruals/
 * AccrualPlanDialog, mounted in the Revenue accruals module and, in place, on
 * the deal's own Revenue accruals tab. app/revenue-accruals/[id] used to
 * render this component and now redirects to the module.
 *
 * This file is left on disk deliberately, unrouted and unimported, so the
 * decision is one line away from being reversed. It is NOT maintained: it
 * does not know about deviations, and anything added to the planner from here
 * on is added to the dialog.
 */

import { useState } from "react";
import { fmtMoney } from "@/lib/currency";
import { expandMoneyShorthand } from "@/lib/moneyShorthand";
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
 *
 * THIS PAGE IS ON ITS WAY OUT (Suren, Sep 1: "when you added an accrual, this
 * screen you did, right? This is the same screen that shows up in there for
 * them to edit if they want... I don't want a different screen. It has to be
 * consistent.").
 *
 * He is describing exactly what this file is. Adding a plan opens the plan
 * dialog; editing a plan card opens the same dialog; but clicking a deal in
 * the opportunity summary lands here instead — a second editor over the same
 * data, reached from one place out of three. It is meant to become the dialog,
 * which means nothing new should be built into it. What it must do until then
 * is not LOSE anything the dialog can write, which is why the one-time and
 * recurring split is carried through below rather than re-authored here.
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

type Line = {
  month: string;
  amount: string;
  pinned?: boolean;
  /** One-time revenue, as it was typed on the plan dialog. */
  ots?: string;
  /** Recurring revenue, as it was typed on the plan dialog. */
  arr?: string;
};

/**
 * ONE-TIME AND RECURRING PASS THROUGH THIS PAGE UNTOUCHED.
 *
 * Suren, Sep 1: "what if we need a separation between month-on-month revenue
 * and one-time revenue? You can make another column: OTS amount in USD, ARR
 * amount in USD... and then you can have a total column."
 *
 * The two halves are filled in on the plan dialog, which is the screen he then
 * said is the only one there should be: "I don't want a different screen. It
 * has to be consistent." This page is the older second editor and is on its way
 * out. Until it goes, it has to be able to CARRY a split it does not itself
 * author — because it loaded only `month` and `amount` and saved only `month`
 * and `amount`, so opening a split plan here and pressing Save wiped the
 * breakdown while every total stayed exactly the same. Nothing on screen said
 * anything had happened.
 *
 * Same two helpers as the dialog, with the same names and the same rules,
 * written out here rather than imported because they are private to that
 * module.
 */

/** Has somebody filled in a split for this month? An empty box is not a
 *  split — a month with neither half behaves as it always did. */
function isSplit(l: Line | undefined): boolean {
  return !!l && (!!l.ots || !!l.arr);
}

/** WHAT A MONTH IS WORTH: the two halves added up once either is filled in,
 *  and otherwise the amount that was typed or shared out. One function, so the
 *  bar, the banner, the even split and the save all agree on the same number. */
function rowTotal(l: Line): string {
  return isSplit(l)
    ? String((Number(l.ots) || 0) + (Number(l.arr) || 0))
    : l.amount;
}

/* The shared shorthand — see lib/currency. Kept as a local name so the call
   sites read the same, but the rounding and the carry are no longer this
   file's own opinion. */
function money(n: number): string {
  return fmtMoney(n);
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
      ? plan.lines.map((l) => ({
          month: l.month,
          amount: String(l.amount),
          /* A SAVED SPLIT COMES IN WITH THE MONTH IT BELONGS TO. Dropping it
             here is what made Save destructive: the row was rebuilt from two
             fields, so the two halves never existed by the time it was
             written back. */
          ...(l.ots === undefined ? {} : { ots: String(l.ots) }),
          ...(l.arr === undefined ? {} : { arr: String(l.arr) }),
        }))
      : spreadEvenly(deal.value ?? 0, startMonth, 6).map((l) => ({
          month: l.month,
          amount: String(l.amount),
        }))
  );
  const [note, setNote] = useState(plan?.note ?? "");

  /** Split months count as what their two halves come to, not as the amount
   *  that was sitting in the row before somebody split it. */
  const planned = lines.reduce((s, l) => s + (Number(rowTotal(l)) || 0), 0);
  const anySplit = lines.some((l) => isSplit(l));
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

    /* A month is held either because somebody typed its total or because
       somebody filled in its OTS/ARR. A split IS a typed number — it just
       arrived as two — so it claims its share of the contract value the same
       way and the loose months absorb the rest. Without this line a split
       month is loose, gets overwritten by the even share, and then saves an
       amount that disagrees with the two halves underneath it. */
    const locked = keys.map((_, i) => {
      const l = current[i];
      if (isSplit(l)) return Number(rowTotal(l)) || 0;
      return l?.pinned ? Number(l.amount) || 0 : null;
    });
    const loose = locked.filter((a) => a === null).length;
    const left = Math.max(
      0,
      value - locked.reduce((sum: number, a) => sum + (a ?? 0), 0)
    );
    const per = loose ? Math.floor(left / loose) : 0;
    let seen = 0;

    setLines(
      keys.map((month, i) => {
        /* A held month rides through WHOLE — its typed total, its pin and
           both halves of its split. Rebuilding the row from named fields here
           is what threw the split away on the very next keystroke, so editing
           one month quietly rewrote every other one. */
        if (locked[i] !== null) return { ...current[i], month };
        seen += 1;
        const share = seen === loose ? left - per * (loose - 1) : per;
        return { month, amount: String(share) };
      })
    );
  }

  async function save() {
    /* `amount` IS THE TOTAL, always — the report, the frozen sheet and the
       month-on-month gap all read it, and a split only ever says how that
       total was arrived at. Each half rides along when somebody filled it in
       and is simply absent when nobody did, so a plan written before these
       columns existed saves exactly as it always has. */
    const rows = lines
      .map((l) => ({
        month: l.month,
        amount: Math.round(Number(rowTotal(l)) || 0),
        ...(l.ots ? { ots: Math.round(Number(l.ots) || 0) } : {}),
        ...(l.arr ? { arr: Math.round(Number(l.arr) || 0) } : {}),
      }))
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
        {/* Only the MOCK notice survives: "you cannot change this" is the
            access shield's job, and it does it on hover instead of holding
            header space on every visit. */}
        {!canWrite && !live && (
          <span className="rounded-full bg-surface px-2.5 py-1 text-[11.5px] font-semibold text-text-secondary">
            Sample plan. Switch to Real mode to work the live numbers
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
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-[color:var(--ink-green)]">
            <Check size={15} strokeWidth={2.6} />
            The months add up
          </span>
        ) : (
          <span className="text-[13px] font-semibold text-[color:var(--ink-amber)]">
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
                  const v = expandMoneyShorthand(e.target.value, { integer: true });
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
                  const v = expandMoneyShorthand(e.target.value, { integer: true });
                  setCount(v);
                  /* NOT WHILE THE BOX IS EMPTY. Typing "12" over "6" passes
                     through the empty string, which used to reshape the plan
                     down to a single month between one keystroke and the next
                     — taking five months of typed amounts, and now their
                     splits, with it. The rows simply hold still until there is
                     a number to hold them to. */
                  if (Number(v) >= 1) reshape({ count: v });
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
                {/* THE BUTTON SAYS WHAT IT COSTS. It lets go of every month
                    somebody chose — a held total, and now a one-time/recurring
                    split — and re-splits the contract value clean. That is the
                    point of it, but a button that reads "Spread evenly" gives
                    no warning that a breakdown is about to go. Same wording
                    the plan dialog uses for the same press. */}
                {lines.some((l) => l.pinned || isSplit(l))
                  ? "Start over, even split"
                  : "Spread evenly"}
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
              <span className="w-[150px] shrink-0">Total (USD)</span>
            </div>
            {lines.map((l, i) => {
              const split = isSplit(l);
              const amount = Number(rowTotal(l)) || 0;
              /* Against the BIGGEST month, not the contract: with an even
                 spread every bar would otherwise sit at a sixth of the width
                 and the row would look empty on a plan that is perfectly
                 fine. Measured against the peak, an even split reads as six
                 full bars, which is what "even" should look like. */
              const peak = Math.max(
                ...lines.map((x) => Number(rowTotal(x)) || 0),
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
                          /* A split month is somebody's own number just as
                             much as a typed total is, so it wears the same
                             held colour rather than looking like a share the
                             formula worked out. */
                          background: l.pinned || split ? "var(--ink-bright-blue)" : "var(--ink-violet-soft)",
                        }}
                      />
                    </span>
                    <span className="w-[42px] shrink-0 text-[11.5px] tnum text-text-tertiary">
                      {share > 0 ? `${Math.round(share)}%` : ""}
                    </span>
                  </span>
                  {/* A SPLIT MONTH'S TOTAL IS ARITHMETIC, NOT A FIELD.
                      Typing over it would set an amount that disagrees with
                      the two halves saved underneath, and the store resolves
                      that disagreement in favour of the halves — so the number
                      a person typed would vanish on the way to the database
                      with nothing on screen to say so. It reads as a number
                      instead of a box that lies about being typeable. */}
                  <input
                    value={rowTotal(l)}
                    disabled={!canWrite}
                    readOnly={split}
                    tabIndex={split ? -1 : undefined}
                    inputMode="numeric"
                    aria-label={`Total for ${monthLabel(l.month)}`}
                    onChange={(e) => {
                      const next = [...lines];
                      next[i] = {
                        ...next[i],
                        amount: expandMoneyShorthand(e.target.value, { integer: true }),
                        pinned: true,
                      };
                      setLines(next);
                      reshape({ lines: next });
                    }}
                    className={cn(
                      "h-[34px] w-[150px] shrink-0 rounded-lg border px-3 text-[13px] font-semibold text-text-primary outline-none focus:border-blue-primary disabled:bg-surface",
                      split
                        ? "cursor-default border-transparent bg-surface"
                        : l.pinned
                          ? "border-blue-primary"
                          : "border-border-light"
                    )}
                  />
                </div>
              );
            })}
          </div>

          {/* SAY IT, RATHER THAN LEAVING A DEAD BOX. Somebody who lands here
              on a split plan needs to know why one row will not take a number
              and that pressing Save keeps the breakdown intact. */}
          {anySplit && (
            <p className="mt-2 text-[12px] text-text-tertiary">
              Some months are split into one-time and recurring revenue. Those
              totals add themselves up here and save exactly as they are. To
              change a split, open the plan from the accruals list.
            </p>
          )}

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
                  <InfoHint text="A deal is signed on one date, but the money comes in over several months. Here you say how much lands in each month. A $150K deal spread over six months is $25K a month. Saving only writes the plan down. No money moves and nobody is told." />
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
