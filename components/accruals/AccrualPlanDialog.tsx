"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleDot, Coins, Plus, Trash2, UserPen, X } from "lucide-react";
import {
  AccrualOriginChip,
  AccrualStatusChip,
} from "@/components/accruals/AccrualStatusChip";
import { ColorSelect } from "@/components/ui/ColorSelect";
import { Field, Input } from "@/components/ui/Input";
import {
  BASE_CURRENCY,
  currencyMeta,
  rateFor,
  setFxRates,
} from "@/lib/currency";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";
import { Tooltip } from "@/components/ui/Tooltip";
import { useToast } from "@/components/ui/Toast";
import { formatMoney } from "@/lib/pipeline";
import { cn } from "@/lib/utils";
import {
  buildPlanDeviation,
  buildVersionComparison,
  tabAccrualStatus,
  type TabAccrualStatus,
  buildVersionHistory,
  latestActiveVersion,
  monthKey,
  monthLabel,
  monthsFrom,
  spreadEvenly,
  type AccrualLine,
  type AccrualPlan,
  type RevenueAccrualsState,
} from "@/lib/revenueAccrualsShared";

/**
 * THE ONE SCREEN AN ACCRUAL IS WRITTEN ON.
 *
 * Suren, Sep 1, with the standalone planning page and this dialog open beside
 * each other: "I don't want a different screen. It has to be consistent...
 * this screen is confusing, this screen is better" — pointing at the dialog.
 * And then, on the deal: "that opportunity is going to have only one revenue
 * approval... Create revenue accrual, we should do it at this level only. It's
 * NOT a revenue accrual tab... I think the same screen from there, both the
 * screens have to be the same. It's just that same screen shows up here."
 *
 * So this file exists to be MOUNTED IN TWO PLACES and to be the same thing in
 * both: the Revenue accruals module, and the Revenue accruals tab on a deal's
 * own page. It lives here rather than inside RevenueAccrualsModule because a
 * page that knows nothing about that module's filters, tabs and summary state
 * has to be able to open it — and because a copy of it on the deal page is a
 * second place for the months to disagree with each other.
 *
 * IT IS MOUNTED WHILE IT IS OPEN, the same way NewContractDialog and
 * EditDealDialog are on the opportunity page. It seeds its form once, on
 * mount, from the deal it was opened on; closing it unmounts it. There is no
 * `open` prop to fall out of step with the form inside.
 *
 * NOTHING IN HERE MOVES A MONTH BY ITSELF. That was the explicit decision in
 * the room (Manoj, Aug 25: "if you keep pushing it, then I'm off the hook, you
 * will never catch hold of me"), and it is the only reason the flag on a
 * slipped plan means anything.
 */

/** A deal, as the planner needs it. The picker's row and the plan's header. */
export type DealOption = {
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
  /**
   * The money the DEAL was agreed in (item 10). Accruals are stored in USD and
   * stay stored in USD; this is only what the toggle converts INTO.
   */
  currency?: string;
};

/**
 * MONTHS THAT HAVE ALREADY GONE BY WEAR THIS, and identity colours never do.
 * Exported because the module paints its flags and its "Need a plan" chip with
 * the same one, and two literals of a single reserved colour drift.
 */
export const ACCRUAL_AMBER = "#B45309";

/**
 * ONE MONTH ON THE FORM. `amount` is that month's TOTAL, which is the number
 * the plan saves and the number every rollup on this page reads.
 *
 * ONE-TIME AND RECURRING, SPLIT (Suren, Sep 1: "what if we need a separation
 * between month-on-month revenue and one-time revenue? You can make another
 * column: OTS amount in USD, ARR amount in USD... and then you can have a
 * total column, which will come for every month. This amount that he's showing
 * in this total column automatically gets filled, and then people can adjust.
 * The other two columns, people can fill them, and accordingly, the total can
 * change.")
 *
 * `ots` and `arr` are EMPTY until somebody types in them, and that emptiness is
 * the switch. A month with nothing in either box behaves exactly as it did
 * before these columns existed: its total is typed, or shared out by the even
 * split. Fill either one and the total becomes their sum and stops being
 * typeable. Clear them both and the month goes back to where it was. Nothing
 * already saved has to be migrated, and nobody who does not need the split ever
 * has to notice it is there.
 */
type DraftLine = {
  month: string;
  amount: string;
  pinned?: boolean;
  /** One-time revenue, as typed. */
  ots?: string;
  /** Recurring revenue, as typed. */
  arr?: string;
};

type Draft = {
  opportunityId: string;
  contractValue: string;
  startMonth: string;
  months: string;
  /** `pinned` means a person typed this month's amount, so the even split
   *  works around it instead of overwriting it. */
  lines: DraftLine[];
  /**
   * MONTHS THE PERSON TOOK OUT OF THE SUGGESTION.
   *
   * Manoj, Sep 3, on the call: "why do you even want to see December to March
   * as line items? They're just empty rows... imagine if it is a 5-year
   * contract, so you said number of months are going to be 60. There will be
   * 60 rows, and some of those rows may not be even entered with any value."
   *
   * The even spread STAYS the opening suggestion — "this is fine, they can see
   * this first, because more often than not this will be the schedule, 80% of
   * the time". This is what happens after: a schedule of $50K in November and
   * $50K in April is two rows, not six with four zeroes.
   *
   * Kept as a list of removed months rather than as an explicit month list,
   * because start + count is what GENERATES the suggestion and has to keep
   * doing so. Removing is a subtraction from it, and putting one back is a
   * subtraction undone.
   */
  dropped: string[];
  note: string;
};

/** Has somebody filled in a split for this month? An empty box is not a split
 *  — clearing both is how you hand the month back to the formula. */
function isSplit(l: DraftLine | undefined): boolean {
  return !!l && (!!l.ots || !!l.arr);
}

/** THE TOTAL THIS MONTH SHOWS: the two halves added up once either is filled
 *  in, and otherwise the amount that was typed or shared out. One function, so
 *  the table, the footer, the even split and the save all agree on what a
 *  month is worth. */
function rowTotal(l: DraftLine): string {
  return isSplit(l)
    ? String((Number(l.ots) || 0) + (Number(l.arr) || 0))
    : l.amount;
}

/** How many months the dialog is showing, whatever is half-typed in the box. */
function planMonthCount(d: Draft): number {
  return Math.max(1, Math.min(60, Number(d.months) || 1));
}

/** The rows on screen: `months` of them, always keyed from the first month, so
 *  moving the start date slides the whole schedule instead of relabelling it. */
function planRows(d: Draft): DraftLine[] {
  const count = planMonthCount(d);
  /* The suggestion, minus what was taken out of it. */
  return monthsFrom(d.startMonth, count)
    .filter((month) => !d.dropped.includes(month))
    .map((month, i) => {
    const l = d.lines[i];
    return {
      month,
      amount: l?.amount ?? "",
      ...(l?.pinned ? { pinned: true } : {}),
      ...(l?.ots === undefined ? {} : { ots: l.ots }),
      ...(l?.arr === undefined ? {} : { arr: l.arr }),
    };
  });
}

/**
 * THE MONTH TABLE'S COLUMNS, NAMED ONCE.
 *
 * Deviation reporting lands on this same screen (Suren, Sep 1: "deviation
 * reporting also will have to happen here only — correct? Yes"), and the
 * deviation carries its own pair of figures beside the plan's: "the two
 * columns repeat for the deviation". Widths used to be a hardcoded `w-1/4` in
 * eight places across a header table and a body table, so adding that pair
 * meant finding all eight and getting the new fraction right in each. Name the
 * columns here and the width falls out of the count; the header row and every
 * cell read it from the same place.
 */
const MONTH_COLUMNS = ["Month", "OTS (USD)", "ARR (USD)", "Total (USD)"] as const;

/**
 * THE PAIR THAT REPEATS FOR A DEVIATION.
 *
 * Suren, Sep 1: "the moment he clicks on Deviate, there should be another
 * column that shows up against all of this... one is OTS, and the other is
 * ARR. The two columns repeat for the deviation."
 *
 * TWO COLUMNS AND NOT THREE. There is deliberately no revised Total box: a
 * month carrying a split has its total DEFINED as the sum of its two halves,
 * in the store, in the API and on the planned side of this same table. A third
 * box would invite somebody to type a figure the model then overwrites, which
 * is the one thing a deviation must never do to a number a person entered.
 * The revised total is reported under the table instead, where it is
 * arithmetic rather than a field.
 */
const DEVIATION_COLUMNS = ["Revised OTS (USD)", "Revised ARR (USD)"] as const;

/** Every column takes an equal share, so the header keeps sitting over its own
 *  column whether there are four of them or six. */
function colWidth(count: number): string {
  return `${100 / count}%`;
}

/**
 * A FIGURE ON THE FROZEN SIDE OF THE DEVIATION TABLE. Written out in full
 * rather than through formatMoney, which rounds to "$1.2M": the planned
 * figures are what somebody is typing a revision AGAINST, so they have to be
 * the exact number that was saved. All money in this module is USD.
 */
function exactUsd(n: number): string {
  return `$${n.toLocaleString("en-US")}`;
}

export function AccrualPlanDialog({
  dealId,
  deals,
  inline = false,
  pickable = [],
  plans = [],
  onClose,
  onSaved,
  onDelete,
}: {
  /**
   * Render without the modal chrome, for the deal's Revenue Accrual card
   * (Manoj, Sep 3: "that entire thing should come here as well"). Same
   * component, same rules — see the note above `body`.
   */
  inline?: boolean;
  /**
   * The deal this opens on. "" opens the picker with nothing chosen, which is
   * what "Plan a deal" does from the module's header; a deal id fills the form
   * in, which is what every other door does.
   */
  dealId: string;
  /** Every deal the dialog may have to name — the chosen one included. */
  deals: DealOption[];
  /**
   * The deals OFFERED in the dropdown: the ones with no plan on them yet. The
   * module hands over its "Need a plan" list; a deal page hands over nothing,
   * because on a deal page the deal is not a question.
   */
  pickable?: DealOption[];
  /** Plans already saved, so picking a deal opens ITS months and not a blank
   *  form that would overwrite them. */
  plans?: AccrualPlan[];
  onClose: () => void;
  /** The whole store as it stands after a save, so the caller can update in
   *  place instead of reloading the page under the person who just typed. */
  onSaved?: (state: RevenueAccrualsState) => void;
  /**
   * THE SEAM FOR A DELETE, unused today. The module deletes from its own
   * "Delete an accrual plan" list, which is where the control has lived since
   * the deal rows came off the page, and putting a second one in here would
   * change what the module looks like. Passing this renders a red button on
   * the left of the footer and hands the confirmation to the caller, which is
   * the app's rule for every delete that is not already inside one.
   */
  onDelete?: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const dealById = useMemo(
    () => new Map(deals.map((d) => [d.id, d])),
    [deals]
  );

  /**
   * THE FORM FOR ONE DEAL, BUILT FROM THAT DEAL AND ITS SAVED PLAN.
   *
   * Called with "" it opens with nothing chosen: a deal dropdown at the top and
   * the rest of the form waiting underneath (Anir, Aug 27: "maybe you choose
   * the deal, and then the other stuff shows up. It shouldn't be like two
   * separate pop-ups"). Called with a deal id it fills the form in. Same
   * function, same dialog, no second screen.
   */
  function buildDraft(id: string): Draft {
    const deal = dealById.get(id);
    if (!id) {
      return {
        opportunityId: "",
        contractValue: "",
        startMonth: monthKey(new Date()),
        months: "6",
        lines: [],
        dropped: [],
        note: "",
      };
    }
    const existing = plans.find((p) => p.opportunityId === id);
    const startMonth =
      existing?.lines[0]?.month ??
      (deal?.estSignDate ? monthKey(deal.estSignDate) : monthKey(new Date()));
    const months = existing?.lines.length || 6;
    const contractValue = existing?.contractValue ?? deal?.value ?? 0;
    return {
      opportunityId: id,
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
          /* A SAVED SPLIT COMES BACK INTO ITS OWN TWO BOXES, so reopening a
             plan shows the numbers somebody typed rather than only the total
             they added up to. A month carrying a split is held by `isSplit`
             below whether or not it is pinned, so an even-looking plan with
             splits in it still cannot be flattened by the formula. */
          ...(l.ots === undefined ? {} : { ots: String(l.ots) }),
          ...(l.arr === undefined ? {} : { arr: String(l.arr) }),
        }));
      })(),
      /* A SAVED PLAN'S GAPS ARE DELIBERATE. If the formula would generate a
         month the stored plan does not carry, somebody took it out — so it
         opens taken out, rather than reappearing as an empty row the moment
         the dialog is opened. */
      dropped: existing?.lines?.length
        ? monthsFrom(
            existing.lines[0].month,
            months
          ).filter((k) => !existing.lines.some((l) => l.month === k))
        : [],
      note: existing?.note ?? "",
    };
  }

  /* SEEDED ONCE, ON MOUNT. The caller mounts this while it is open and
     unmounts it when it closes, so the form can never be left showing the
     deal before last. */
  const [editing, setEditing] = useState<Draft>(() => buildDraft(dealId));

  /** The terms a contract is actually written in (item 9). Not a cap: "Other"
 *  keeps a free box for everything in between. */
const SUGGESTED_TERMS: number[] = [3, 6, 9, 12, 18, 24, 36];

/** The Deviations tab's three colours, so the scheduler paints them the same
 *  (item 20). Kept beside the helper that produces the words. */
const TAB_STATUS_COLOR: Record<TabAccrualStatus, string> = {
  Active: "#0F766E",
  Deviated: "#7C3AED",
  Inactive: "#B45309",
};

/* ------------------------------------------------------------- deviating */

  /**
   * DEVIATE MODE.
   *
   * Suren, Sep 1: "Beside this button, if he's going to change it, he has to
   * put a button called Deviate... the moment he clicks on Deviate, there
   * should be another column that shows up against all of this."
   *
   * A SAVE IS NOT A DEVIATION, AND THAT IS WHY THIS IS A MODE AND NOT A FLAG
   * ON THE SAVE. `op: "save"` writes into the latest active version IN PLACE;
   * only `op: "deviate"` appends a new one. If every save appended, the
   * "number of deviations" on his Deviations tab would be counting keystrokes
   * instead of decisions, and the history table below would fill with rows
   * nobody chose to make. So the ordinary path still posts `save` and nothing
   * but saveDeviation() posts `deviate`.
   */
  const [deviating, setDeviating] = useState(false);
  /**
   * "Other…" IS A CHOICE, NOT A DERIVED STATE (item 9).
   *
   * Showing the typed box only when the count is off-list looked right and was
   * a dead option: picking "Other…" while the count was 12 left it at 12, 12 is
   * on the list, so nothing appeared and the choice did nothing at all. It has
   * to be remembered as an intent.
   */

  /**
   * ITEM 10 — READ THE SCHEDULE IN THE DEAL'S OWN MONEY.
   *
   * Manoj's sheet: "Under Revenue Accrual as well, provide an option for local
   * currency. Provide a toggle button to see the values in USD vs local
   * currency."
   *
   * THIS REVERSES SUREN, who was explicit on Sep 1: "we don't have to go to
   * local currency. It automatically only picks up USD, and everywhere
   * reporting will be USD. Only within the opportunities where we will capture
   * the local currency." Every amount in this dialog is stored in USD and that
   * has NOT changed — the toggle converts for reading and writes nothing. What
   * gets saved is what the person typed, in dollars, exactly as before.
   *
   * The rate comes from /api/fx through lib/currency, the same seam the deal
   * editor uses, keyed on the deal's sign date so the accrual and the deal
   * convert at the same rate rather than two.
   */
  const [showLocal, setShowLocal] = useState(false);
  const dealCurrency = (dealById.get(editing.opportunityId)?.currency || BASE_CURRENCY).toUpperCase();
  const hasLocal = dealCurrency !== BASE_CURRENCY;
  const localSignDate = dealById.get(editing.opportunityId)?.estSignDate;
  const [fxReady, setFxReady] = useState<"off" | "loading" | "ready" | "failed">("off");

  useEffect(() => {
    if (!hasLocal || !showLocal) {
      setFxReady("off");
      return;
    }
    let running = true;
    setFxReady("loading");
    const query = localSignDate ? `?on=${encodeURIComponent(localSignDate)}` : "";
    fetch(`/api/fx${query}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!running) return;
        const day = data?.day;
        if (!day?.date || !day?.rates) return setFxReady("failed");
        setFxRates(localSignDate || undefined, day);
        setFxReady("ready");
      })
      .catch(() => running && setFxReady("failed"));
    return () => {
      running = false;
    };
  }, [hasLocal, showLocal, localSignDate]);

  /** A stored USD figure, read in whichever money the toggle is showing. */
  function readMoney(usd: number): string {
    if (!showLocal || !hasLocal || fxReady !== "ready") return exactUsd(usd);
    const rate = rateFor(dealCurrency, localSignDate || undefined);
    if (!rate) return exactUsd(usd);
    const sym = currencyMeta(dealCurrency).symbol.trim();
    return `${sym}${Math.round(usd * rate).toLocaleString("en-US")}`;
  }
  /** The revised figures, keyed by month. An empty pair is NOT a zero. */
  const [revised, setRevised] = useState<
    Record<string, { ots: string; arr: string }>
  >({});
  const [reason, setReason] = useState("");
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  /**
   * THE VERSION THIS DIALOG HAS JUST WRITTEN, held locally so the screen shows
   * it immediately. The module hands its whole store back through `plans`, but
   * a deal's own page renders the plan on the server and refreshes underneath
   * a dialog that stays open, and "this record is now version 2" should not
   * arrive a round trip late on the screen that just did it.
   */
  const [justDeviated, setJustDeviated] = useState<AccrualPlan | null>(null);

  /**
   * THE SAVED PLAN, WHICH IS NOT THE DRAFT. A deviation branches from what is
   * stored, never from what somebody is half-typing above it, or the variance
   * it reports would be measured against a number nobody ever agreed to.
   */
  const savedPlan =
    justDeviated && justDeviated.opportunityId === editing.opportunityId
      ? justDeviated
      : plans.find((p) => p.opportunityId === editing.opportunityId);

  /** "When the user enters, it's always whichever is the latest active
   *  version", which is not simply the newest one, because a version the
   *  system opened is inactive by construction. */
  const currentVersion = savedPlan ? latestActiveVersion(savedPlan) : null;
  /** "There will be one more table about all the previous deviations for this
   *  record." Newest first; the helper owns the order. */
  const history = savedPlan ? buildVersionHistory(savedPlan) : [];
  /**
   * THE RECORD'S OWN VERSION AND STATUS, which is NOT the same thing as the
   * version being edited.
   *
   * "Every time you see an accrual record, the record has a version number and
   * a status." On a record the sweep has touched, the newest version is an
   * inactive one and the edit target is the active version under it. The chips
   * at the top report the record, so an Inactive flag is not buried behind the
   * version somebody happens to be typing into; the deviation still branches
   * from currentVersion, which is what "whichever is the latest active
   * version" means.
   */
  const record = savedPlan ? buildPlanDeviation(savedPlan) : null;

  /** The months a deviation is offered against: the current version's own. */
  const deviateRows: AccrualLine[] = currentVersion?.lines ?? [];

  function revisedOf(month: string): { ots: string; arr: string } {
    return revised[month] ?? { ots: "", arr: "" };
  }
  function isRevised(month: string): boolean {
    const r = revisedOf(month);
    return r.ots !== "" || r.arr !== "";
  }
  const touchedMonths = deviateRows.filter((l) => isRevised(l.month));

  /**
   * WHAT THE DEVIATION WOULD SAY, MONTH BY MONTH.
   *
   * A MONTH NOBODY TYPED IN CARRIES FORWARD UNCHANGED. Dropping it instead
   * would blank that month on every report the moment somebody revised one
   * row, because a plan's operative lines mirror its newest active version.
   * Zeroing a month is still there and still says exactly what it means: type
   * 0 into both boxes.
   */
  const deviationLines: AccrualLine[] = deviateRows.map((l) => {
    if (!isRevised(l.month)) return l;
    const r = revisedOf(l.month);
    const ots = Math.round(Number(r.ots) || 0);
    const arr = Math.round(Number(r.arr) || 0);
    return { month: l.month, amount: ots + arr, ots, arr };
  });

  /** One shared subtraction, so the table and its own footer can never
   *  disagree about what moved. */
  const comparison = buildVersionComparison(deviateRows, deviationLines);

  /* startDeviating() went with the button (item 17). Deviate mode is no
     longer something a person enters: any save that changes the schedule is
     the deviation, and savePlan() asks first. The mode's own UI below is
     unreachable and comes out next. */

  function stopDeviating() {
    setDeviating(false);
    setRevised({});
    setReason("");
  }

  function editRevised(month: string, field: "ots" | "arr", raw: string) {
    setRevised((prev) => ({
      ...prev,
      [month]: { ...(prev[month] ?? { ots: "", arr: "" }), [field]: raw },
    }));
  }

  /**
   * SAVE THE DEVIATION. `op: "deviate"` and never `op: "save"`. See the mode
   * note above; this is the only call in the app that appends a version.
   */
  async function saveDeviation() {
    if (!savedPlan || !currentVersion) {
      toast("Save this plan before deviating from it.", "error");
      return;
    }
    /* SAY WHY IT IS NEEDED RATHER THAN RELAYING A 400. The API refuses a
       reasonless deviation, and letting that arrive as a raw failure would
       teach people that this form is broken rather than that a deviation
       carries a reason. */
    if (!reason.trim()) {
      toast(
        "A deviation needs a reason. Whoever reads this next will ask why the months moved.",
        "error"
      );
      /* AND TAKE THEM TO IT. The reason sits under the months, so on a long
         plan it can be below the fold when the button is pressed, and a toast
         about a field you cannot see is a puzzle rather than an answer. */
      reasonRef.current?.scrollIntoView({ block: "center" });
      reasonRef.current?.focus();
      return;
    }
    if (!touchedMonths.length) {
      toast(
        "Nothing has changed yet. Put revised figures against at least one month.",
        "error"
      );
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/revenue-accruals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: "deviate",
          opportunityId: savedPlan.opportunityId,
          /* A carried-forward month goes back exactly as it was stored: its
             split when it had one, its bare total when it did not. */
          lines: deviationLines.map((l) => ({
            month: l.month,
            ...(l.ots === undefined && l.arr === undefined
              ? { amount: l.amount }
              : { ots: l.ots ?? 0, arr: l.arr ?? 0 }),
          })),
          reason: reason.trim(),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        toast(data?.error || "That deviation didn't save.", "error");
        return;
      }
      const next = data.plan as AccrualPlan | undefined;
      if (next) {
        setJustDeviated(next);
        /* THE FORM FOLLOWS THE NEW VERSION. Leaving the draft on the old
           months would let the very next "Save plan" write the superseded
           figures straight back over the deviation that was just made. Every
           month comes back held, so the even-split formula cannot flatten
           numbers somebody deliberately revised. */
        setEditing((prev) => ({
          ...prev,
          contractValue: String(next.contractValue),
          startMonth: next.lines[0]?.month ?? prev.startMonth,
          months: String(next.lines.length || 1),
          lines: next.lines.map((l) => ({
            month: l.month,
            amount: String(l.amount),
            pinned: true,
            ...(l.ots === undefined ? {} : { ots: String(l.ots) }),
            ...(l.arr === undefined ? {} : { arr: String(l.arr) }),
          })),
        }));
      }
      if (data.state) onSaved?.(data.state as RevenueAccrualsState);
      toast(
        `Deviated. This record is now version ${
          next ? latestActiveVersion(next).version : currentVersion.version + 1
        }.`
      );
      /* THE DIALOG STAYS OPEN. A deviation is a thing you want to watch land:
         the history table gains a row and the version beside it moves, which
         is the confirmation. The screens behind are server rendered, so they
         are refreshed the same way a save refreshes them. */
      stopDeviating();
      router.refresh();
    } catch {
      toast("That deviation didn't save.", "error");
    } finally {
      setBusy(false);
    }
  }

  /** "You give them a simple formula: this is the contract value." Also the
   *  way back: every month goes loose again and the value re-splits clean. */
  function applySpread() {
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
    /* THE SUGGESTION MINUS WHAT WAS REMOVED. Everything below shares the
       contract value across the months that are LEFT, which is what makes
       taking December out put its money back into the months that remain
       ("and then I can remove January, or remove February, and then it'll
       auto-calculate" — yes). */
    const keys = monthsFrom(next.startMonth, count).filter(
      (k) => !next.dropped.includes(k)
    );
    if (!keys.length) return { ...next, months: String(count) };
    const value = Number(next.contractValue) || 0;

    /* A month is held either because somebody typed its total or because
       somebody filled in its OTS/ARR. A split IS a typed number — it just
       arrived as two — so it claims its share of the contract value the same
       way, and the loose months absorb the rest. */
    const byMonth = new Map(next.lines.filter((l) => l.month).map((l) => [l.month, l]));
    const locked = keys.map((k, i) => {
      /* BY MONTH, NOT BY POSITION. Removing a month shifts every row after it,
         so an index would hand April's typed figure to May. */
      const l = byMonth.get(k) ?? next.lines[i];
      if (isSplit(l)) return Number(rowTotal(l)) || 0;
      return l?.pinned ? Number(l.amount) || 0 : null;
    });
    const loose = locked.filter((a) => a === null).length;
    const left = Math.max(
      0,
      value - locked.reduce((s: number, a) => s + (a ?? 0), 0)
    );
    /* The rounding remainder lands on the last loose month, so the rows add
       back to exactly the contract value rather than to $499,999. */
    const per = loose ? Math.floor(left / loose) : 0;
    let seen = 0;

    const lines: DraftLine[] = keys.map((month, i) => {
      /* A held month rides through whole — its typed total, its pin, and both
         halves of its split. Rebuilding the row from three named fields here
         is what would throw the split away on the very next keystroke. */
      if (locked[i] !== null)
        return { ...(byMonth.get(month) ?? next.lines[i]), month };
      seen += 1;
      const share = seen === loose ? left - per * (loose - 1) : per;
      return { month, amount: String(share) };
    });

    return {
      ...next,
      months: String(count),
      /* Months past the visible count ride along untouched, ready for the
         moment the count goes back up. */
      lines,
    };
  }

  /** Edit one of the three formula fields and let the table follow. */
  function editFormula(patch: Partial<Draft>) {
    setEditing(reshape({ ...editing, ...patch }));
  }

  /**
   * TAKE A MONTH OUT OF THE SCHEDULE, and put its money back into the rest.
   *
   * Manoj, Sep 3: "I want 50,000 in November, and 50,000 in April. Nothing in
   * between. So why do you even want to see December to March as line items?"
   *
   * The month is dropped and its typed figure with it, so a row that comes
   * back comes back loose rather than carrying a number nobody re-entered.
   */
  function dropMonth(month: string) {
    setEditing(
      reshape({
        ...editing,
        dropped: [...editing.dropped, month],
        lines: editing.lines.filter((l) => l.month !== month),
      })
    );
  }

  /** Put one back. Removing has to be undoable in the same breath, or the only
   *  way back is to reset the month count and lose every typed figure. */
  function restoreMonth(month: string) {
    setEditing(
      reshape({ ...editing, dropped: editing.dropped.filter((m) => m !== month) })
    );
  }

  /**
   * ADD A MONTH THE SUGGESTION NEVER OFFERED.
   *
   * Manoj, Sep 3: "the user should have the ability to remove any rows if they
   * don't want it, and add any rows if they want it, right? From a calendar
   * point of view."
   *
   * Removing is a subtraction from the generated span; this is the other
   * direction — a month OUTSIDE it, picked from a date box. Adding one before
   * the first month moves the start; adding one after simply widens the count.
   * Either way the span grows to include it and the months re-share the
   * contract value, which is the same rule every other change here follows.
   */
  const [addingMonth, setAddingMonth] = useState("");

  /** The month after the last row on screen — what the plus adds. */
  function nextMonthAfterLast(): string {
    const rows = planRows(editing);
    const last = rows[rows.length - 1]?.month ?? editing.startMonth;
    return monthsFrom(last, 2)[1] ?? last;
  }

  function addMonth(month: string) {
    if (!month) return;
    const rows = planRows(editing);
    const first = rows[0]?.month ?? editing.startMonth;
    const last = rows[rows.length - 1]?.month ?? editing.startMonth;
    /* Already showing? Nothing to do. Previously taken out? Put it back rather
       than widening the span around a month that is already in it. */
    if (rows.some((r) => r.month === month)) return;
    if (editing.dropped.includes(month)) return restoreMonth(month);

    const start = month < first ? month : first;
    const end = month > last ? month : last;
    /* The count has to reach from the new start to the new end, and every
       month in between that nobody asked for is dropped — otherwise adding
       one month two years out would silently create 24 empty rows, which is
       the exact thing he asked me to get rid of. */
    const span = monthsFrom(start, 600);
    const endIndex = span.indexOf(end);
    const count = endIndex >= 0 ? endIndex + 1 : planMonthCount(editing);
    const keep = new Set([...rows.map((r) => r.month), month]);
    setEditing(
      reshape({
        ...editing,
        startMonth: start,
        months: String(count),
        dropped: span.slice(0, count).filter((m) => !keep.has(m)),
      })
    );
    setAddingMonth("");
  }

  /** Every month the formula would generate that somebody took out, in order. */
  const droppedRows = monthsFrom(editing.startMonth, planMonthCount(editing)).filter(
    (m) => editing.dropped.includes(m)
  );

  /** Typing an amount locks that month; the loose ones re-split around it. */
  function editMonth(index: number, raw: string) {
    const lines = [...editing.lines];
    while (lines.length <= index)
      lines.push({ month: planRows(editing)[lines.length]?.month ?? "", amount: "" });
    lines[index] = { ...lines[index], amount: raw, pinned: true };
    setEditing(reshape({ ...editing, lines }));
  }

  /**
   * Typing an OTS or ARR figure. The total for that month becomes their sum
   * and stops being typeable — "this amount that he's showing in this total
   * column automatically gets filled" — and the month is held, so the loose
   * months absorb the difference exactly as they do for a typed total.
   * Emptying both boxes hands the month back to the formula, so there is a way
   * out that is not "start over".
   */
  function editSplit(index: number, field: "ots" | "arr", raw: string) {
    const lines = [...editing.lines];
    while (lines.length <= index)
      lines.push({ month: planRows(editing)[lines.length]?.month ?? "", amount: "" });
    lines[index] = { ...lines[index], [field]: raw };
    setEditing(reshape({ ...editing, lines }));
  }


  /**
   * THE PENDING SAVE, held while the Accept/Cancel popup is up (item 17). It
   * carries the exact lines that were about to be written, so pressing Accept
   * commits what the person was looking at rather than re-reading a form that
   * may have re-rendered underneath.
   */
  /** The month the × is asking about. Removing one re-splits every other
   *  month's share, so it is not a keystroke to undo by eye (Anir, Sep 3:
   *  "pressing the x on the month should ask for confirmation in popup").
   *  Consistent with every other delete control in the app. */
  const [pendingDrop, setPendingDrop] = useState<string | null>(null);

  const [pendingSave, setPendingSave] = useState<{
    lines: AccrualLine[];
    contractValue: number;
  } | null>(null);

  /** Does this differ from the version that is current right now? */
  function changedFromCurrent(
    lines: AccrualLine[],
    contractValue: number
  ): boolean {
    if (!savedPlan || !currentVersion) return false;
    /* The contract value is part of the schedule's meaning: the same months
       against a different total is a different plan, and item 14 counts a
       change in Total Contract Value as a deviation in its own right. */
    if (Math.round(savedPlan.contractValue || 0) !== contractValue) return true;
    const before = currentVersion.lines;
    if (before.length !== lines.length) return true;
    /* THE SPLIT IS PART OF THE CHANGE, NOT DECORATION ON IT. Item 17 says
       "any change", and re-cutting a month's 83,333 into 50,000 one-time and
       33,333 recurring changes what that money IS while leaving the total
       exactly where it was. Keyed on the total alone it saved silently, with
       no popup and no version — the one edit Manoj most wants logged.
       Undefined and 0 have to collapse to the same thing here: `save` omits a
       blank half and `deviate` writes it as 0, so a plan that came back
       through the other path would otherwise read as changed while identical. */
    const half = (n: number | undefined) => Math.round(Number(n) || 0);
    const key = (l: AccrualLine) =>
      `${l.month}:${Math.round(l.amount || 0)}:${half(l.ots)}:${half(l.arr)}`;
    const a = [...before].map(key).sort();
    const b = [...lines].map(key).sort();
    return a.some((v, i) => v !== b[i]);
  }

  /**
   * WHY, WRITTEN BY THE SYSTEM. The API refuses a reasonless deviation, and
   * item 17's popup asks only Accept or Cancel — it never collects one. So the
   * reason is composed from what actually moved, which is more use in the
   * history than most typed ones: it names the months and the totals rather
   * than saying "updated".
   */
  function autoReason(lines: AccrualLine[], contractValue: number): string {
    const before = currentVersion?.lines ?? [];
    const beforeBy = new Map(before.map((l) => [l.month, Math.round(l.amount || 0)]));
    const afterBy = new Map(lines.map((l) => [l.month, Math.round(l.amount || 0)]));
    const months = new Set([...beforeBy.keys(), ...afterBy.keys()]);
    const moved = [...months].filter((m) => (beforeBy.get(m) ?? 0) !== (afterBy.get(m) ?? 0));
    const wasTotal = before.reduce((n, l) => n + Math.round(l.amount || 0), 0);
    const nowTotal = lines.reduce((n, l) => n + Math.round(l.amount || 0), 0);
    /* A month whose total held still but whose split moved: named separately,
       because "Schedule edited." alone would be the whole history entry. */
    const splitBy = (ls: AccrualLine[]) =>
      new Map(ls.map((l) => [l.month, `${Math.round(Number(l.ots) || 0)}/${Math.round(Number(l.arr) || 0)}`]));
    const beforeSplit = splitBy(before);
    const afterSplit = splitBy(lines);
    const recut = [...months].filter(
      (m) => !moved.includes(m) && (beforeSplit.get(m) ?? "0/0") !== (afterSplit.get(m) ?? "0/0")
    );
    const bits: string[] = [];
    if (moved.length)
      bits.push(
        `${moved.length} month${moved.length === 1 ? "" : "s"} changed (${moved.sort().join(", ")})`
      );
    if (recut.length)
      bits.push(
        `one-time and recurring re-split for ${recut.length} month${recut.length === 1 ? "" : "s"} (${recut.sort().join(", ")})`
      );
    if (wasTotal !== nowTotal)
      bits.push(`total ${formatMoney(wasTotal)} to ${formatMoney(nowTotal)}`);
    if (Math.round(savedPlan?.contractValue || 0) !== contractValue)
      bits.push(
        `contract value ${formatMoney(Math.round(savedPlan?.contractValue || 0))} to ${formatMoney(contractValue)}`
      );
    return bits.length ? `Schedule edited: ${bits.join("; ")}.` : "Schedule edited.";
  }

  /** Accept on the popup: append the next version (item 18) and close. */
  async function commitPendingSave() {
    const pending = pendingSave;
    setPendingSave(null);
    if (!pending || !savedPlan) return;
    setBusy(true);
    try {
      const res = await fetch("/api/revenue-accruals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: "deviate",
          opportunityId: savedPlan.opportunityId,
          contractValue: pending.contractValue,
          lines: pending.lines.map((l) => ({
            month: l.month,
            ...(l.ots === undefined && l.arr === undefined
              ? { amount: l.amount }
              : { ots: l.ots ?? 0, arr: l.arr ?? 0 }),
          })),
          reason: autoReason(pending.lines, pending.contractValue),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        toast(data?.error || "That didn't save.", "error");
        return;
      }
      if (data.state) onSaved?.(data.state as RevenueAccrualsState);
      toast("Saved. A deviation has been logged.");
      router.refresh();
      onClose();
    } catch {
      toast("That didn't save.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function savePlan() {
    const deal = dealById.get(editing.opportunityId);
    if (!deal) {
      toast("Pick an opportunity first.", "error");
      return;
    }
    /* `amount` IS THE TOTAL, always. The store, the report, the frozen sheet
       and the month-on-month gap all read it; a split only ever says how that
       total was arrived at. Each half rides along when somebody filled it in
       and is simply absent when nobody did, which is what keeps every plan
       written before today reading exactly as it did. */
    const lines = planRows(editing)
      .map((l) => ({
        month: l.month,
        amount: Math.round(Number(rowTotal(l)) || 0),
        ...(l.ots ? { ots: Math.round(Number(l.ots) || 0) } : {}),
        ...(l.arr ? { arr: Math.round(Number(l.arr) || 0) } : {}),
      }))
      .filter((l) => l.month);
    if (!lines.length) {
      toast("Add at least one month, or press Spread evenly.", "error");
      return;
    }
    /**
     * ITEM 12 — "Revenue Accrual total should not exceed Total Contract
     * Value."
     *
     * Refused, not rounded down and not warned about: a schedule that accrues
     * more than the contract is worth is wrong in a way only the person
     * typing it can fix, and every total downstream — the report, the frozen
     * monthly sheet, the goal it feeds — would carry the error silently.
     * Equal is fine; over is not.
     */
    const contractValue = Math.round(Number(editing.contractValue) || 0);
    const scheduled = lines.reduce((sum, l) => sum + l.amount, 0);
    if (contractValue > 0 && scheduled > contractValue) {
      toast(
        `The schedule adds up to ${formatMoney(scheduled)}, which is more than the contract value of ${formatMoney(contractValue)}. Take ${formatMoney(scheduled - contractValue)} off before saving.`,
        "error"
      );
      return;
    }
    /**
     * ITEMS 17 AND 18 — EVERY CHANGE IS A DEVIATION.
     *
     * Manoj's sheet, item 17: "Remove 'Deviate' button from Accrual plan
     * scheduler. Any change should be treated as deviation. If the user
     * changes anything and clicks on Save, a pop should appear which says
     * 'Changes made to this revenue accrual schedule will be made current and
     * Deviation will be logged'. Provide an option for 'Accept' or 'Cancel'."
     * And item 18: "All changes made by the user to the Revenue Schedule
     * should be logged as a latest up-version."
     *
     * This reverses the rule the dialog was built on. Deviating used to be a
     * deliberate second act, so that the deviation count on his tab counted
     * decisions rather than keystrokes; Manoj wants the opposite, and the
     * confirm is what keeps it from counting keystrokes: nothing is appended
     * until somebody presses Accept.
     *
     * A FIRST SAVE IS NOT A DEVIATION. There is nothing to deviate FROM until
     * a version exists, so the first write still goes through `save` and
     * becomes version 1.
     */
    if (currentVersion && changedFromCurrent(lines, contractValue)) {
      setPendingSave({ lines, contractValue });
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
            contractValue: Math.round(Number(editing.contractValue) || 0),
            /* The date these months were chosen against. If somebody moves it
               later, the plan is flagged rather than quietly going wrong. */
            ...(deal.estSignDate ? { signDateAtPlan: deal.estSignDate } : {}),
            lines,
            note: editing.note,
          },
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        toast(data?.error || "That didn't save.", "error");
        return;
      }
      if (data.state) onSaved?.(data.state as RevenueAccrualsState);
      toast("Accrual plan saved.");
      /* THE BAND ON THE DEAL PAGE AND THE TABLE IN THE MODULE ARE BOTH SERVER
         RENDERED, so the months only move on screen once the server has been
         asked again. This is why a save here never has to navigate anywhere:
         the screen behind the dialog refreshes under it. */
      router.refresh();
      onClose();
    } catch {
      toast("That didn't save.", "error");
    } finally {
      setBusy(false);
    }
  }

  /* The months ON SCREEN are the plan. A row parked beyond the visible count
     is remembered, not counted, or the total would argue with the table. */
  const editingRows = planRows(editing);
  /* The footer totals the TOTAL column, whichever way each month got there. */
  const editingTotal = editingRows.reduce(
    (s, l) => s + (Number(rowTotal(l)) || 0),
    0
  );
  const editingValue = Number(editing.contractValue) || 0;

  /* THE COLUMNS ON SCREEN. Four normally, six while deviating, and the width
     falls out of the count so the header and the body cannot drift apart. */
  const monthColumns: readonly string[] = deviating
    ? [...MONTH_COLUMNS, ...DEVIATION_COLUMNS]
    : MONTH_COLUMNS;
  const monthColWidth = colWidth(monthColumns.length);

  /**
   * THE SAME SCHEDULER, IN A CARD INSTEAD OF A DIALOG.
   *
   * Manoj, Sep 3: "you provide the start month, and then number of months,
   * depending on that you get a calendar, right? Like month-on-month rows, and
   * in each row you get the OTS and ARR and total... that entire thing should
   * come here as well" — meaning inside the deal's Revenue Accrual card.
   *
   * WHY A PROP AND NOT A SECOND COMPONENT. Suren, Sep 1, having looked at two
   * accrual screens side by side: "I don't want a different screen. It has to
   * be consistent... both the screens have to be the same." A copy of this
   * form in the deal card would be that second screen again, and it would
   * drift on the first change either one gets. So this is the SAME component,
   * rendered without the modal chrome: every rule below — the even spread,
   * removing and adding months, the contract-value cap, the deviation confirm,
   * the version history — is the one implementation, once.
   */
  const body = (
    <>
      {/* THE DEAL IS A DROPDOWN, IN THIS SAME DIALOG (Anir, Aug 27:
          "maybe just make it a dropdown... you choose the deal, and then
          the other stuff shows up. It should be one pop-up").

          It used to be a separate full-height dialog listing all
          seventy-one open deals as 59px rows — a screen you had to get
          through before the screen you wanted. The picker is searchable,
          so a long list costs nothing, and the plan fields below wait
          until there is something to plan.

          ON A DEAL'S OWN PAGE there is nothing to pick: the caller hands over
          an empty `pickable` and the deal is already chosen, so the field
          shows which deal is being planned and offers no way to wander off it.
          Same field, same screen, one row in the menu. */}
      <div className="shrink-0">
      {/* NO "WHICH DEAL" ON THE DEAL'S OWN PAGE. Inline, the question is
          already answered by the page around it, and a picker offering one
          option is a control that cannot do anything. */}
      {!inline && (
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
            if (!v) return;
            /* A DIFFERENT DEAL IS A DIFFERENT RECORD. Carrying a half-typed
               deviation across would post one deal's revised months against
               another deal's plan. */
            stopDeviating();
            setJustDeviated(null);
            setEditing(buildDraft(v));
          }}
          options={[
            { value: "", label: "Pick a deal…", color: "#8E98A8" },
            ...pickable.map((d) => ({
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
            ...(editing.opportunityId &&
            !pickable.some((d) => d.id === editing.opportunityId)
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
      )}
      </div>

      {/* THE MIDDLE IS THE ONLY THING THAT SCROLLS. The frame is pinned above,
          the footer is pinned below, and everything a person is working on
          moves inside this box. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
      {!editing.opportunityId ? (
        /* THE DIALOG OPENS AT ITS WORKING SIZE (Anir, Aug 27: "why is
           the pop-up so small? It looks bad, but once I pick a deal, it
           looks good. Keep the size" — the third screenshot, the filled
           form, is the size he kept). The placeholder holds the height
           the form will occupy, so picking a deal fills the space
           instead of doubling the dialog under your cursor. */
        <p className="mt-4 flex h-[calc(100%-1rem)] min-h-[240px] items-center justify-center rounded-xl border border-dashed border-border-light bg-surface/40 px-4 py-6 text-center text-[12.5px] text-text-secondary">
          {pickable.length === 0
            ? "Every open deal already has a plan. Nothing left to do here."
            : "Pick a deal above and its months appear here."}
        </p>
      ) : (
        <>
          <p className="mt-4 text-[12.5px] text-text-secondary">
            {deviating ? (
              <>
                The months on the left are what version{" "}
                <b className="text-text-primary">{currentVersion?.version}</b>{" "}
                says and they are not being edited. Put the new figures in the
                two revised columns and say why. Saving keeps this version and
                adds the next one beside it.
              </>
            ) : (
              <>
                Spread the contract value across the months you expect it to
                land. Nothing here reschedules itself later: if the close date
                passes, the plan is flagged and you come back and change it.
              </>
            )}
          </p>
          {/* THE THREE FIELDS ARE THE PLANNED SIDE, so a deviation cannot
              touch them: "the planned figures stay visible and unedited so the
              person can see what they are changing from". Moving the start
              month or the count while deviating would slide the very schedule
              the revised columns are being measured against. */}
          {/* ITEM 10's TOGGLE. Only when there is another currency to show:
              on a dollar deal there is nothing to switch between, and a
              control with one meaningful position is noise. It changes what
              you READ, never what is saved — every box below stays the dollar
              figure the person typed. */}
          {hasLocal && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-[12px] font-semibold text-text-secondary">
                Show amounts in
              </span>
              <div
                role="group"
                aria-label="Currency to read the schedule in"
                className="inline-flex items-center gap-0.5 rounded-full bg-surface p-0.5"
              >
                {/* THE SYMBOL RIDES WITH THE CODE, same as the switcher on the
                    deal (Anir, Sep 3: "you have to put the currency icon,
                    whatever is called there, as well"). The column below reads
                    $30 or €30; the control that swaps them shows the same mark
                    rather than making you translate three letters. */}
                {[
                  { key: false, label: "USD", mark: "$" },
                  { key: true, label: dealCurrency, mark: currencyMeta(dealCurrency).symbol.trim() },
                ].map((o) => (
                  <button
                    key={o.label}
                    type="button"
                    aria-pressed={showLocal === o.key}
                    onClick={() => setShowLocal(o.key)}
                    className={cn(
                      "cursor-pointer rounded-full px-2.5 py-1 text-[12px] font-semibold transition-all",
                      showLocal === o.key
                        ? "bg-white text-text-primary shadow-sm"
                        : "text-text-secondary hover:text-text-primary"
                    )}
                  >
                    <span className="mr-1 text-text-tertiary">{o.mark}</span>
                    {o.label}
                  </button>
                ))}
              </div>
              {/* HONEST WHEN IT CANNOT CONVERT, never a stale figure dressed
                  as a fresh one. The dollars still read correctly. */}
              {showLocal && fxReady === "loading" && (
                <span className="text-[11.5px] text-text-tertiary">Getting the rate.</span>
              )}
              {showLocal && fxReady === "failed" && (
                <span className="text-[11.5px] text-text-tertiary">
                  No rate for that day, so these stay in dollars.
                </span>
              )}
            </div>
          )}
          <div className="mt-3 grid grid-cols-3 gap-3">
            <Field label="Contract value (USD)">
              <Input
                value={editing.contractValue}
                inputMode="numeric"
                disabled={deviating}
                className={deviating ? "opacity-60" : undefined}
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
                disabled={deviating}
                className={deviating ? "opacity-60" : undefined}
                onChange={(e) => editFormula({ startMonth: e.target.value })}
              />
            </Field>
            {/* ITEM 9 — "System should provide a suggested accrual schedule
                based on number of months but provide an option to edit (a
                drop-down maybe?)"

                The suggestion already existed: pick a number and the contract
                value spreads evenly across that many months from the first
                one, and every amount stays editable afterwards. What was
                missing is his drop-down — the count was a bare numeric box, so
                the common terms were something you had to know rather than
                something the form offered.

                The list is the terms a contract is actually written in, and
                "Other" keeps the box, because a 7-month schedule is nobody's
                dropdown option and still has to be typeable. */}
            <Field label="Number of months">
              {/* ONE BOX, NOT TWO. This was a dropdown of the usual terms plus
                  an "Other…" option that revealed a second box beside it, so a
                  4-month schedule read "Other…  4" — two controls arguing over
                  one number, and the dropdown showing a word instead of the
                  answer. The suggestions are worth keeping (Manoj's item 9),
                  so they moved into the box's own list: click the box and the
                  usual terms are there, or type 4 and it is 4. */}
              <input
                type="number"
                min={1}
                max={600}
                list="accrual-term-suggestions"
                value={editing.months}
                disabled={deviating}
                aria-label="Number of months"
                className={cn(
                  "h-10 w-full rounded-lg border border-border-light bg-white px-2.5 text-[13px] tnum outline-none focus:border-blue-primary disabled:opacity-60",
                  deviating && "opacity-60"
                )}
                onChange={(e) =>
                  editFormula({ months: e.target.value.replace(/[^0-9]/g, "") })
                }
              />
              <datalist id="accrual-term-suggestions">
                {SUGGESTED_TERMS.map((n) => (
                  <option key={n} value={String(n)} />
                ))}
              </datalist>
            </Field>
          </div>
          {/* The table moves on its own now, so this stopped being the way to
              fill it in and became the way BACK: it lets go of every month
              somebody typed and re-splits the contract value clean.

              IT IS NOT OFFERED WHILE DEVIATING, because re-splitting would
              rewrite the planned side a deviation is being measured against.
              The row keeps its height either way so the table below does not
              jump up the moment the columns appear. */}
          <div className="mt-2 flex min-h-[30px] flex-wrap items-center gap-x-3 gap-y-1">
            {deviating ? (
              <span className="text-[12px] text-text-secondary">
                Leave a month blank to carry it forward exactly as it is. Type
                0 in both boxes to say that month now brings nothing.
              </span>
            ) : (
              <>
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
                  Type a total to hold that month, or fill in OTS and ARR and
                  the total adds itself up. The rest share what is left.
                </span>
              </>
            )}
          </div>

          {(deviating ? deviateRows.length : editingRows.length) > 0 && (
            /* THE SCROLL BOX ENDS ON A ROW, NOT THROUGH ONE. The header used
               to sit inside the scrolling element, so its height ate into the
               budget and a twelve-month plan was cut off across the middle of
               April. Header outside, body inside, and the cap is exactly six
               rows of `h-11`, 264px, so the seventh is either fully there or
               fully below the fold.

               THE COLUMNS ARE THE SAME TABLE GAINING A PAIR (Suren, Sep 1:
               "there should be another column that shows up against all of
               this"). Both tables are `table-fixed` on a width derived from
               the column count, so the header keeps sitting over its own
               column when the deviation pair appears. */
            <div className="mt-3 overflow-hidden rounded-lg border border-border-light">
              <table className="w-full table-fixed text-left">
                <thead className="bg-surface">
                  <tr className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary [&>th]:px-3 [&>th]:py-2">
                    {monthColumns.map((label, i) => (
                      <th
                        key={label}
                        style={{ width: monthColWidth }}
                        className={cn(
                          /* The revised pair is a group, so it is fenced off
                             from the planned figures rather than reading as
                             two more of them. */
                          i === MONTH_COLUMNS.length &&
                            "border-l border-border-light",
                          i >= MONTH_COLUMNS.length && "text-[#6D28D9] dark:text-[#C4B5FD]"
                        )}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
              </table>
              <div className="max-h-[264px] overflow-y-auto border-t border-border-light">
                <table className="w-full table-fixed text-left">
                  <tbody className="divide-y divide-border-light">
                    {deviating
                      ? /* DEVIATING: the planned figures are frozen text, not
                           boxes, because they are what is being changed FROM.
                           The row keeps its `h-11` so the table is the same
                           height it was a moment ago. */
                        deviateRows.map((line) => {
                          const r = revisedOf(line.month);
                          return (
                            <tr key={line.month} className="h-11">
                              <td
                                style={{ width: monthColWidth }}
                                className="px-3 py-1.5 text-[13px] font-semibold text-text-primary"
                              >
                                {monthLabel(line.month)}
                              </td>
                              {(["ots", "arr"] as const).map((field) => (
                                <td
                                  key={field}
                                  style={{ width: monthColWidth }}
                                  className="px-3 py-1.5 text-[13px] tnum text-text-secondary"
                                >
                                  {line[field] === undefined
                                    ? /* A month that never carried a split has
                                         no one-time or recurring figure to
                                         show, and printing $0 would claim it
                                         did. */
                                      "Not split"
                                    : exactUsd(line[field] as number)}
                                </td>
                              ))}
                              <td
                                style={{ width: monthColWidth }}
                                className="px-3 py-1.5 text-[13px] tnum font-semibold text-text-primary"
                              >
                                {readMoney(line.amount)}
                              </td>
                              {(["ots", "arr"] as const).map((field, k) => (
                                <td
                                  key={`revised-${field}`}
                                  style={{ width: monthColWidth }}
                                  className={cn(
                                    "px-3 py-1.5",
                                    k === 0 && "border-l border-border-light"
                                  )}
                                >
                                  <input
                                    value={r[field]}
                                    placeholder="0"
                                    inputMode="numeric"
                                    aria-label={`Revised ${field === "ots" ? "OTS" : "ARR"} for ${monthLabel(line.month)}`}
                                    onChange={(e) =>
                                      editRevised(
                                        line.month,
                                        field,
                                        e.target.value.replace(/[^0-9]/g, "")
                                      )
                                    }
                                    className={cn(
                                      "h-8 w-full rounded-md border px-2 text-[13px] tnum outline-none focus:border-[#A78BFA]",
                                      /* A revised figure is somebody's own
                                         number, so it wears the same held look
                                         a typed total wears on the planned
                                         side, in the deviation's own colour,
                                         which is the colour of the "User
                                         deviated" chip this will produce. */
                                      r[field]
                                        ? "border-[#A78BFA] bg-[rgba(139,92,246,0.10)] font-semibold text-text-primary"
                                        : "border-border-light"
                                    )}
                                  />
                                </td>
                              ))}
                            </tr>
                          );
                        })
                      : editingRows.map((line, i) => {
                      const split = isSplit(line);
                      return (
                        <tr key={line.month || i} className="group/row h-11">
                          <td
                            style={{ width: monthColWidth }}
                            className="px-3 py-1.5 text-[13px] font-semibold text-text-primary"
                          >
                            <span className="flex items-center justify-between gap-2">
                              {monthLabel(line.month)}
                              {/* TAKE THIS MONTH OUT. Never offered on the last
                                  one standing — a schedule with no months is
                                  not a schedule, and Save already refuses it,
                                  so the control should not walk you into it. */}
                              {!deviating && editingRows.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => setPendingDrop(line.month)}
                                  aria-label={`Remove ${monthLabel(line.month)} from the schedule`}
                                  title="Remove this month. Its share goes back to the others."
                                  /* ALWAYS THERE, QUIETLY. Hover-only would
                                     be tidier and would not exist at all on a
                                     touch screen, and a control nobody can
                                     find is the same as a control that is not
                                     built. */
                                  className="cursor-pointer rounded p-0.5 text-text-tertiary/60 transition-colors hover:text-[color:#DC2626] focus-visible:text-[color:#DC2626]"
                                >
                                  <X size={13} strokeWidth={2.4} />
                                </button>
                              )}
                            </span>
                          </td>
                          {/* THE TWO HALVES PEOPLE FILL IN. Same box and same
                              digits-only keystroke filter the amount has always
                              had; the only difference is that filling either one
                              takes the total out of your hands. */}
                          {(["ots", "arr"] as const).map((field) => (
                            <td
                              key={field}
                              style={{ width: monthColWidth }}
                              className="px-3 py-1.5"
                            >
                              <input
                                value={line[field] ?? ""}
                                placeholder="0"
                                inputMode="numeric"
                                aria-label={`${field === "ots" ? "OTS" : "ARR"} for ${monthLabel(line.month)}`}
                                onChange={(e) =>
                                  editSplit(
                                    i,
                                    field,
                                    e.target.value.replace(/[^0-9]/g, "")
                                  )
                                }
                                className={cn(
                                  "h-8 w-full rounded-md border px-2 text-[13px] tnum outline-none focus:border-blue-subtle",
                                  /* A filled-in half is somebody's own number,
                                     so it wears the held look a typed total has
                                     always worn. */
                                  line[field]
                                    ? "border-blue-subtle bg-blue-light/40 font-semibold text-text-primary"
                                    : "border-border-light"
                                )}
                              />
                            </td>
                          ))}
                          <td style={{ width: monthColWidth }} className="px-3 py-1.5">
                            <input
                              value={rowTotal(line)}
                              placeholder="0"
                              inputMode="numeric"
                              readOnly={split}
                              tabIndex={split ? -1 : undefined}
                              aria-label={`Total for ${monthLabel(line.month)}`}
                              onChange={(e) =>
                                editMonth(i, e.target.value.replace(/[^0-9]/g, ""))
                              }
                              className={cn(
                                "h-8 w-full rounded-md border px-2 text-[13px] tnum outline-none focus:border-blue-subtle",
                                split
                                  ? /* Once the split is filled in the total is
                                       arithmetic, not a field, so it reads as a
                                       number on the row instead of a box that
                                       lies about being typeable. */
                                    "cursor-default border-transparent bg-surface font-semibold text-text-primary"
                                  : line.pinned
                                    ? /* A locked month is the one number on the
                                         table that is not the app's arithmetic,
                                         so it says so rather than looking
                                         identical to a share. */
                                      "border-blue-subtle bg-blue-light/40 font-semibold text-text-primary"
                                    : "border-border-light"
                              )}
                            />
                          </td>
                        </tr>
                      );
                    })}
                    {/* ADDING A MONTH IS A ROW OF THIS TABLE (Anir, Sep 3:
                        "it should just be a normal plus sign that's already in
                        a row, maybe with the table"). It used to be a label
                        reading "Add a month" and a bare month picker floating
                        under the table, which read as a stray control rather
                        than the next line of the schedule.

                        The plus takes the month after the last row, which is
                        what adding one nearly always means. The picker stays
                        for the other case and sits in the same row: the month
                        somebody wants may be years outside the generated span,
                        and no number of clicks on a plus should be the way to
                        reach it. */}
                    {!deviating && (
                      <tr className="h-11">
                        <td className="px-3" colSpan={monthColumns.length}>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => addMonth(nextMonthAfterLast())}
                              title="Add the month after the last one"
                              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-[12.5px] font-semibold text-blue-primary transition-colors hover:bg-blue-light/50"
                            >
                              <Plus size={14} strokeWidth={2.6} />
                              Add month
                            </button>
                            <input
                              type="month"
                              value={addingMonth}
                              aria-label="Add a specific month to the schedule"
                              title="Or pick any month"
                              onChange={(e) => {
                                setAddingMonth(e.target.value);
                                if (e.target.value) addMonth(e.target.value);
                              }}
                              className="h-7 rounded-md border border-transparent bg-transparent px-1 text-[12px] text-text-tertiary outline-none transition-colors hover:border-border-light focus:border-blue-primary focus:text-text-primary"
                            />
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {deviating ? (
            <>
              {/* THE REVISED TOTAL IS ARITHMETIC, SO IT IS REPORTED AND NOT
                  TYPED. buildVersionComparison does the subtraction once, so
                  this strip and any other reading of the same two versions
                  cannot disagree about what moved. */}
              <div className="mt-3 grid grid-cols-3 gap-3 rounded-lg border border-border-light bg-surface/50 px-3 py-2.5">
                <div>
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                    Version {currentVersion?.version} says
                  </span>
                  <b className="mt-0.5 block text-[15px] tnum text-text-primary">
                    {formatMoney(comparison.plannedTotal)}
                  </b>
                </div>
                <div>
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                    Revised total
                  </span>
                  <b className="mt-0.5 block text-[15px] tnum text-[#6D28D9] dark:text-[#C4B5FD]">
                    {formatMoney(comparison.revisedTotal)}
                  </b>
                </div>
                <div>
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                    Difference
                  </span>
                  <b
                    className="mt-0.5 block text-[15px] tnum"
                    style={{
                      color:
                        comparison.varianceTotal === 0
                          ? undefined
                          : comparison.varianceTotal > 0
                            ? "#16A34A"
                            : ACCRUAL_AMBER,
                    }}
                  >
                    {comparison.varianceTotal > 0 ? "+" : ""}
                    {formatMoney(comparison.varianceTotal)}
                  </b>
                </div>
              </div>

              {/* WHY, AND IT IS NOT OPTIONAL. The API refuses a deviation
                  without one, so the form asks for it in the same words a
                  person would: the reason is what the next meeting opens
                  with. */}
              <div className="mt-3">
                <Field
                  label="Why is this deviating"
                  required
                  hint="This sits on the record for good. Anyone reading the history later sees this line and nothing else about the change."
                >
                  <Textarea
                    ref={reasonRef}
                    rows={2}
                    value={reason}
                    maxLength={500}
                    placeholder="Client pushed the signature to November, so the first two months move back."
                    aria-label="Why is this deviating"
                    className="resize-none text-[13.5px]"
                    onChange={(e) => setReason(e.target.value)}
                  />
                </Field>
              </div>
            </>
          ) : (
            <>
            {/* WHAT WAS TAKEN OUT, AND THE WAY BACK. Removing has to be
                undoable in the same breath: without this the only way to
                recover December is to reset the month count, which throws away
                every figure typed since. */}
            {/* PICK A MONTH THE SUGGESTION DID NOT OFFER (item 9's other
                half). A month box rather than a list, because the month he
                wants may be years outside the generated span. */}
            {droppedRows.length > 0 && !deviating && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[12px] text-text-tertiary">
                  Taken out:
                </span>
                {droppedRows.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => restoreMonth(m)}
                    title={`Put ${monthLabel(m)} back into the schedule`}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-border-light px-2 py-0.5 text-[11.5px] font-semibold text-text-secondary transition-colors hover:border-blue-primary hover:text-blue-primary"
                  >
                    <Plus size={11} strokeWidth={2.6} />
                    {monthLabel(m)}
                  </button>
                ))}
              </div>
            )}
            <p className="mt-2 text-[12.5px]">
              The months add up to{" "}
              <b className="tnum text-text-primary">{formatMoney(editingTotal)}</b>
              {/* ITEM 10 — the same figure in the deal's own money, beside the
                  dollars rather than instead of them. Both at once is the
                  honest shape: the schedule IS dollars, and this is what that
                  comes to in the currency the contract was written in. */}
              {showLocal && hasLocal && fxReady === "ready" && (
                <span className="text-text-secondary">
                  {" "}
                  ({readMoney(editingTotal)})
                </span>
              )}
              {editingValue > 0 && Math.abs(editingTotal - editingValue) > 1 && (
                <span className="font-semibold" style={{ color: ACCRUAL_AMBER }}>
                  {" "}
                  — that is {formatMoney(Math.abs(editingTotal - editingValue))}{" "}
                  {editingTotal > editingValue ? "more" : "less"} than the contract
                  value. Saving is allowed; the plan will be flagged.
                </span>
              )}
            </p>
            </>
          )}

          {/* EVERY VERSION OF THIS RECORD, NEWEST FIRST.

              Suren, Sep 1: "If I go into the actual individual record here,
              you will have the editing screen. There will be one more table
              about all the previous deviations for this record. That will have
              all the versions that got deviated, and those versions will show
              up."

              IT LIVES HERE AND NOT ON A SCREEN OF ITS OWN, which is the same
              instruction that put the planner in this dialog in the first
              place: "I don't want a different screen. It has to be
              consistent." It is always open rather than folded away, because
              he asked to SEE the versions, and it has its own scroll cap so a
              record with a long history cannot push the buttons off the
              bottom. */}
          {savedPlan && history.length > 0 && (
            <section className="mt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-[13px] font-semibold text-text-primary">
                  Previous deviations
                </h3>
                {/* THE VERSION AND THE STATUS, WHERE A PERSON CAN SEE THEM
                    ("every time you see an accrual record, the record has a
                    version number and a status"). The chips are the app's own,
                    not a second set painted here. */}
                {record && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {/* ITEM 20 — "Have the Deviations tab in Revenue Accrual
                        Scheduler page as well."

                        The scheduler is this dialog: the standalone plan PAGE
                        was retired on Sep 1 ("I don't want a different screen.
                        It has to be consistent") and its route redirects here.
                        A tab strip inside a dialog would be a screen inside a
                        screen, so what "as well" means in practice is that the
                        record's deviations read the SAME here as they do on
                        the tab — same status word, same count. They now do:
                        this chip is the tab's Accrual status, from the same
                        `tabAccrualStatus`, so the two can never disagree about
                        whether a record is Deviated. */}
                    <span
                      className="whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold"
                      style={{
                        background: `${TAB_STATUS_COLOR[tabAccrualStatus(record)]}18`,
                        color: TAB_STATUS_COLOR[tabAccrualStatus(record)],
                      }}
                    >
                      {tabAccrualStatus(record)}
                    </span>
                    <AccrualStatusChip
                      status={record.status}
                      version={record.version}
                      size="sm"
                    />
                    <AccrualOriginChip
                      origin={record.origin}
                      showOriginal
                      size="sm"
                    />
                  </div>
                )}
              </div>
              <p className="mt-1 text-[12px] text-text-secondary">
                {history.length === 1
                  ? "Nobody has deviated this record yet. Version 1 is the plan as it was first written."
                  : `${record?.deviationCount ?? history.length - 1} deviation${
                      (record?.deviationCount ?? history.length - 1) === 1 ? "" : "s"
                    } across ${history.length} versions. Every report reads the newest one that has figures in it.`}
              </p>
              <div className="mt-2 overflow-hidden rounded-lg border border-border-light">
                <div className="max-h-[176px] overflow-y-auto">
                  <table className="w-full table-fixed text-left">
                    <thead className="sticky top-0 z-[1] bg-surface">
                      <tr className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary [&>th]:px-3 [&>th]:py-2">
                        <th style={{ width: "13%" }}>Version</th>
                        <th style={{ width: "30%" }}>Status</th>
                        <th style={{ width: "17%" }}>Changed by</th>
                        <th style={{ width: "14%" }}>When</th>
                        <th style={{ width: "14%" }}>Total</th>
                        <th style={{ width: "12%" }}>Why</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-light">
                      {history.map((row) => (
                        <tr key={row.version} className="align-top">
                          <td className="px-3 py-2">
                            <span className="text-[13px] font-semibold tnum text-text-primary">
                              v{row.version}
                            </span>
                            {row.current && (
                              /* THE ONE A PERSON IS ACTUALLY EDITING. Blue is
                                 this app's identity colour, so marking the
                                 current row with it says "you are here"
                                 without spending a status colour on it. */
                              <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-blue-light px-1.5 py-0.5 text-[10px] font-semibold text-blue-primary">
                                <CircleDot size={9} strokeWidth={2.6} />
                                Current
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap items-center gap-1">
                              <AccrualStatusChip status={row.status} size="sm" />
                              <AccrualOriginChip
                                origin={row.origin}
                                showOriginal
                                size="sm"
                              />
                            </div>
                          </td>
                          <td className="px-3 py-2 text-[12.5px] text-text-secondary">
                            {row.by || "Unknown"}
                          </td>
                          <td className="px-3 py-2 text-[12.5px] tnum text-text-secondary">
                            {new Date(row.at).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </td>
                          <td className="px-3 py-2 text-[12.5px] tnum font-semibold text-text-primary">
                            {formatMoney(row.total)}
                          </td>
                          <td className="px-3 py-2 text-[12.5px] text-text-secondary">
                            {/* THE FULL REASON IS THE POINT, so the cell shows
                                what fits and the hover carries the rest rather
                                than the column swallowing the sentence. */}
                            {row.reason ? (
                              <Tooltip label={row.reason}>
                                <span className="line-clamp-2 cursor-pointer">
                                  {row.reason}
                                </span>
                              </Tooltip>
                            ) : row.origin === "system" ? (
                              "The signing date passed unsigned."
                            ) : (
                              "The plan as first written."
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}
        </>
      )}
      </div>

      {/* THE BUTTONS ARE PINNED TO THE BOTTOM of a dialog whose height does not
          move, so they sit in the same place in every state of the form. */}
      <div className="mt-4 flex shrink-0 items-center gap-2 border-t border-border-light pt-3">
        {/* A DELETE STANDS APART FROM THE THING THAT SAVES, on the left, red,
            and it asks the caller first. Nothing passes it today; see the prop
            above for why. It is not offered mid-deviation: finish the change
            or step out of it. */}
        {onDelete && editing.opportunityId && !deviating ? (
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[color:rgba(220,38,38,0.35)] px-3.5 py-2 text-[13px] font-semibold text-[color:#DC2626] transition-colors hover:bg-[rgba(220,38,38,0.08)]"
          >
            <Trash2 size={14} strokeWidth={2.2} /> Delete plan
          </button>
        ) : null}
        <span className="flex-1" />
        {deviating ? (
          <>
            <button
              type="button"
              onClick={stopDeviating}
              className="rounded-lg border border-border-light px-3.5 py-2 text-[13px] font-semibold text-text-secondary transition-colors hover:bg-surface"
            >
              Stop deviating
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={saveDeviation}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#6D28D9] px-4 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              <UserPen size={14} strokeWidth={2.2} />
              Save deviation
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border-light px-3.5 py-2 text-[13px] font-semibold text-text-secondary transition-colors hover:bg-surface"
            >
              Cancel
            </button>
            {/* NO DEVIATE BUTTON (Manoj's change sheet, item 17: "Remove
                'Deviate' button from Accrual plan scheduler. Any change should
                be treated as deviation").

                It used to sit here, beside Save, on Suren's Sep 1 instruction,
                because a deviation was a deliberate second act. It is not one
                any more: Save is the only button, and any save that actually
                changes the schedule asks first and then logs the deviation
                itself. See savePlan().

                THE GATE IS UNCHANGED. This dialog is only mounted for somebody
                who may write — the module checks canWrite, a deal page checks
                mayPlan, and the API asks again. */}
            <button
              type="button"
              disabled={busy || !editing.opportunityId}
              onClick={savePlan}
              className="rounded-lg bg-blue-primary px-4 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              Save plan
            </button>
          </>
        )}
      </div>

      {/* ITEM 17's POPUP, in his words exactly. Accept and Cancel, nothing
          else: no reason box, because his sheet does not ask for one — the
          reason is composed from what moved (see autoReason). Cancel leaves
          the dialog open on the edited figures, so nothing typed is lost. */}
      <ConfirmDialog
        open={pendingDrop !== null}
        onClose={() => setPendingDrop(null)}
        onConfirm={() => {
          if (pendingDrop) dropMonth(pendingDrop);
          setPendingDrop(null);
        }}
        title={pendingDrop ? `Remove ${monthLabel(pendingDrop)}?` : "Remove this month?"}
        body="Its share goes back to the other months, so every figure you have not typed by hand will change. You can put the month back from 'Taken out' underneath."
        confirmLabel="Remove"
      />
      <ConfirmDialog
        open={pendingSave !== null}
        onClose={() => setPendingSave(null)}
        onConfirm={() => void commitPendingSave()}
        title="Save these changes?"
        body="Changes made to this revenue accrual schedule will be made current and Deviation will be logged."
        /* "Accept" is his word; the dialog's own cancel button already
           reads "Cancel", which is the other one. */
        confirmLabel="Accept"
        busy={busy}
      />
    </>
  );

  if (inline) return <div className="flex flex-col">{body}</div>;
  return (
    <Modal
      open
      onClose={onClose}
      title={
        editing.opportunityId
          ? `Accrual plan · ${dealById.get(editing.opportunityId)?.name ?? "deal"}`
          : "Plan a deal"
      }
      size="workflow"
      dialogClassName="!h-[min(760px,calc(100vh-3rem))]"
      bodyClassName="flex flex-col"
    >
      {body}
    </Modal>
  );
}
