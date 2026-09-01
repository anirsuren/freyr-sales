"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleDot, Coins, Trash2, UserPen } from "lucide-react";
import {
  AccrualOriginChip,
  AccrualStatusChip,
} from "@/components/accruals/AccrualStatusChip";
import { ColorSelect } from "@/components/ui/ColorSelect";
import { Field, Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";
import { Tooltip } from "@/components/ui/Tooltip";
import { useToast } from "@/components/ui/Toast";
import { formatMoney } from "@/lib/pipeline";
import { cn } from "@/lib/utils";
import {
  buildPlanDeviation,
  buildVersionComparison,
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
  return monthsFrom(d.startMonth, count).map((month, i) => {
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
  pickable = [],
  plans = [],
  onClose,
  onSaved,
  onDelete,
}: {
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
      note: existing?.note ?? "",
    };
  }

  /* SEEDED ONCE, ON MOUNT. The caller mounts this while it is open and
     unmounts it when it closes, so the form can never be left showing the
     deal before last. */
  const [editing, setEditing] = useState<Draft>(() => buildDraft(dealId));

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

  function startDeviating() {
    setRevised({});
    setReason("");
    setDeviating(true);
  }

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
    const keys = monthsFrom(next.startMonth, count);
    if (!keys.length) return { ...next, months: String(count) };
    const value = Number(next.contractValue) || 0;

    /* A month is held either because somebody typed its total or because
       somebody filled in its OTS/ARR. A split IS a typed number — it just
       arrived as two — so it claims its share of the contract value the same
       way, and the loose months absorb the rest. */
    const locked = keys.map((_, i) => {
      const l = next.lines[i];
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
      if (locked[i] !== null) return { ...next.lines[i], month };
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
    setEditing(reshape({ ...editing, ...patch }));
  }

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

  return (
    <Modal
      open
      onClose={onClose}
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
      /**
       * THE FRAME DOES NOT MOVE (Anir, Aug 31: "stop changing the dimensions
       * whenever I click on them. It has to stay the same").
       *
       * This dialog now has three states of very different heights: a picker
       * with nothing chosen, a plan, and a plan with the deviation columns and
       * a reason field open beside it. Without a pinned height, pressing
       * Deviate would grow the box and re-centre it under the cursor. So the
       * height is fixed, the middle scrolls, and revealing the revised columns
       * or gaining a version in the history below changes nothing outside.
       *
       * `bodyClassName` makes the body a flex column so the picker stays at
       * the top, the footer stays at the bottom and the form in between FILLS
       * the space instead of leaving dead room under the buttons.
       */
      dialogClassName="!h-[min(760px,calc(100vh-3rem))]"
      bodyClassName="flex flex-col"
    >
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
            <Field label="Number of months">
              <Input
                value={editing.months}
                inputMode="numeric"
                disabled={deviating}
                className={deviating ? "opacity-60" : undefined}
                onChange={(e) =>
                  editFormula({ months: e.target.value.replace(/[^0-9]/g, "") })
                }
              />
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
                                {exactUsd(line.amount)}
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
                        <tr key={line.month || i} className="h-11">
                          <td
                            style={{ width: monthColWidth }}
                            className="px-3 py-1.5 text-[13px] font-semibold text-text-primary"
                          >
                            {monthLabel(line.month)}
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
            <p className="mt-2 text-[12.5px]">
              The months add up to{" "}
              <b className="tnum text-text-primary">{formatMoney(editingTotal)}</b>
              {editingValue > 0 && Math.abs(editingTotal - editingValue) > 1 && (
                <span className="font-semibold" style={{ color: ACCRUAL_AMBER }}>
                  {" "}
                  — that is {formatMoney(Math.abs(editingTotal - editingValue))}{" "}
                  {editingTotal > editingValue ? "more" : "less"} than the contract
                  value. Saving is allowed; the plan will be flagged.
                </span>
              )}
            </p>
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
                  : `${history.length} versions. Every report reads the newest one that has figures in it.`}
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
            {/* DEVIATE SITS BESIDE THE SAVE (Suren, Sep 1: "Beside this
                button, if he's going to change it, he has to put a button
                called Deviate").

                IT IS NOT A SECOND SAVE. Saving writes into the version that is
                already there; this one keeps that version and adds the next
                one. A plan that has never been saved has nothing to branch
                from, so the button says so instead of posting a deviate the
                API would answer 404 to.

                THE GATE IS UNCHANGED AND UNTOUCHED. This whole dialog is only
                mounted for somebody who may write. The module checks canWrite
                before mounting it and a deal page checks mayPlan before
                offering the door, so a view-only account never reaches this
                footer at all, and the API asks the same question again. */}
            {editing.opportunityId ? (
              currentVersion ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={startDeviating}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[color:rgba(109,40,217,0.4)] px-3.5 py-2 text-[13px] font-semibold text-[#6D28D9] transition-colors hover:bg-[rgba(139,92,246,0.10)] disabled:opacity-60 dark:border-[color:rgba(196,181,253,0.42)] dark:text-[#C4B5FD]"
                >
                  <UserPen size={14} strokeWidth={2.2} />
                  Deviate
                </button>
              ) : (
                <Tooltip label="A deviation changes a plan that already exists. Save this one first and the button opens.">
                  <button
                    type="button"
                    disabled
                    className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-border-light px-3.5 py-2 text-[13px] font-semibold text-text-tertiary opacity-70"
                  >
                    <UserPen size={14} strokeWidth={2.2} />
                    Deviate
                  </button>
                </Tooltip>
              )
            ) : null}
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
    </Modal>
  );
}
