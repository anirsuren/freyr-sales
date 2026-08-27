/**
 * REVENUE ACCRUALS — the month-by-month plan for money that has not landed yet
 * (Suren, Aug 25 call).
 *
 * Why it exists, in his words: "as a salesperson, accrual numbers you need to
 * give the calendar, because I don't want you guys to maintain an Excel sheet.
 * At the opportunity level itself you give them a simple formula: this is the
 * contract value." And it is a module of its own, not a tab: "you need to
 * create one more thing called sales revenue accruals — that's one more
 * module, created outside, because you can see one report across it, because
 * you cannot go from opportunity to opportunity."
 *
 * THREE RULES THAT ARE NOT NEGOTIABLE, all his:
 *
 * 1. NOTHING AUTO-PUSHES. The first instinct in the room was to roll a missed
 *    month forward by one. Manoj killed it: "if you keep pushing it, then I'm
 *    off the hook — you will never catch hold of me." Suren agreed: "the
 *    system should not adjust it, the user should come and adjust it."
 *
 * 2. A MISSED MONTH IS FLAGGED, NOT DELETED. "It's not removing — you can
 *    invalidate, that's all I'm trying to say, but there has to be a flag
 *    which says it is not validating… and you go and fix it."
 *
 * 3. THE GAP IS THE REPORT. "Right now we are taking July's sheet, and by July
 *    end we are freezing; on August 1st we are developing another sheet, then
 *    comparing these two, then seeing how many opportunities we thought will
 *    close in July are not closed in July and are now spilling into August…
 *    you need to say this is a gap, and where did the gap come from. You need
 *    to be able to see month-on-month gaps."
 *
 * So: a plan per opportunity, a frozen snapshot per month, and a deviation
 * report that reads one against the other. Client-safe types and pure
 * functions only — the store is lib/revenueAccruals.ts.
 */

/** One month of planned revenue. `month` is an ISO year-month, "2026-04". */
export type AccrualLine = {
  month: string;
  amount: number;
};

export type AccrualPlan = {
  id: string;
  /** The deal this plan belongs to. One plan per opportunity, ever. */
  opportunityId: string;
  /** Denormalised so a renamed or deleted deal cannot blank the report. */
  opportunityName: string;
  customer: string;
  customerId?: string;
  /** "Revenue accruals can also be looked at from an offering point of view." */
  offeringId?: string;
  offeringLabel?: string;
  /** What the whole plan is spreading. Usually the deal's value. */
  contractValue: number;
  /**
   * THE DEAL'S ESTIMATED SIGN DATE AT THE MOMENT THIS PLAN WAS SAVED.
   *
   * Suren, Aug 26: "you have to bring the date called contract sign date...
   * that estimated contract sign date is there in the deal opportunity... if
   * somebody comes in and changes the contract sign date, then his whole plan
   * is wrong. You have to say that the plan has to be redone."
   *
   * A plan is a set of months chosen for a sign date. Without recording which
   * date it was built against, a later change to that date is invisible and
   * the months quietly become fiction.
   */
  signDateAtPlan?: string;
  lines: AccrualLine[];
  note?: string;
  updatedBy: string;
  updatedAt: string;
};

/**
 * THE FROZEN SHEET. One per month, taken on or after the first of the month,
 * holding what every plan said at that moment. This is the "July sheet" he
 * compares August against, and it is why the deviation report can name which
 * opportunity moved rather than only that a total changed.
 */
export type AccrualSnapshot = {
  /** The month it froze, "2026-07". One snapshot per month, never two. */
  id: string;
  takenAt: string;
  takenBy: string;
  rows: {
    opportunityId: string;
    opportunityName: string;
    customer: string;
    byMonth: Record<string, number>;
  }[];
};

export type RevenueAccrualsState = {
  plans: AccrualPlan[];
  snapshots: AccrualSnapshot[];
};

export const EMPTY_ACCRUALS: RevenueAccrualsState = { plans: [], snapshots: [] };

/* ------------------------------------------------------------- month math */

/** "2026-04" for a Date or an ISO day. */
export function monthKey(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** "Apr 2026" — the way a month is written everywhere else in the app. */
export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** N months starting at `from`, inclusive. */
export function monthsFrom(from: string, count: number): string[] {
  const [y, m] = from.split("-").map(Number);
  if (!y || !m || count < 1) return [];
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const d = new Date(Date.UTC(y, m - 1 + i, 1));
    out.push(monthKey(d));
  }
  return out;
}

/** Is `a` strictly before `b`? Both "YYYY-MM". String order is date order. */
export function monthBefore(a: string, b: string): boolean {
  return !!a && !!b && a < b;
}

/**
 * THE SIMPLE FORMULA he asked for: "at the opportunity level itself you give
 * them a simple formula — this is the contract value." An even spread across
 * the months, with the rounding remainder landing on the LAST month so the
 * lines always add back to exactly the contract value. A plan whose rows do
 * not sum to the deal is the thing that makes people go back to Excel.
 */
export function spreadEvenly(
  contractValue: number,
  startMonth: string,
  months: number
): AccrualLine[] {
  const keys = monthsFrom(startMonth, months);
  if (!keys.length || !Number.isFinite(contractValue)) return [];
  const per = Math.floor(contractValue / keys.length);
  return keys.map((month, i) => ({
    month,
    amount: i === keys.length - 1 ? contractValue - per * (keys.length - 1) : per,
  }));
}

export function planTotal(plan: Pick<AccrualPlan, "lines">): number {
  return plan.lines.reduce((s, l) => s + (l.amount || 0), 0);
}

/* --------------------------------------------------------------- verdicts */

export type PlanProblem =
  /** The deal's estimated close month is behind us and it is still open, so
   *  every month on this plan is now a guess nobody has revisited. */
  | "close_date_passed"
  /** The lines do not add up to the contract value they claim to spread. */
  | "does_not_add_up"
  /** Money planned into months that have already gone by, on an open deal. */
  | "past_months_unbooked"
  /** The deal's estimated sign date has moved since this plan was built, so
   *  the months were chosen against a date that no longer applies. */
  | "sign_date_changed";

export type PlanVerdict = {
  problems: PlanProblem[];
  /** Any problem at all means the plan is flagged. It is never deleted and
   *  never silently moved (rules 1 and 2 above). */
  invalid: boolean;
  /** Planned money sitting in months that have already passed. */
  strandedAmount: number;
  headline: string;
};

/**
 * Judge one plan. `estSignDate` and `status` come from the opportunity, so the
 * flag can never go stale the way a stored boolean would: the moment the month
 * turns over, the same plan reads as invalid without anybody writing to it.
 */
export function judgePlan(
  plan: AccrualPlan,
  deal: { estSignDate?: string; status?: string } | undefined,
  now = new Date()
): PlanVerdict {
  const thisMonth = monthKey(now);
  const problems: PlanProblem[] = [];
  const closed = deal?.status === "Won" || deal?.status === "Lost";

  const stranded = plan.lines
    .filter((l) => monthBefore(l.month, thisMonth))
    .reduce((s, l) => s + (l.amount || 0), 0);

  if (!closed && deal?.estSignDate) {
    const closeMonth = monthKey(deal.estSignDate);
    if (closeMonth && monthBefore(closeMonth, thisMonth)) {
      problems.push("close_date_passed");
    }
  }
  /* THE DATE MOVED UNDER THE PLAN. Compared by MONTH: a plan spreads months,
     so a sign date sliding from the 3rd to the 20th of the same month changes
     nothing about it, and flagging that would train people to ignore the
     flag. */
  if (!closed && plan.signDateAtPlan && deal?.estSignDate) {
    const then = monthKey(plan.signDateAtPlan);
    const now_ = monthKey(deal.estSignDate);
    if (then && now_ && then !== now_) problems.push("sign_date_changed");
  }
  if (!closed && stranded > 0) problems.push("past_months_unbooked");
  if (
    plan.contractValue > 0 &&
    Math.abs(planTotal(plan) - plan.contractValue) > 1
  ) {
    problems.push("does_not_add_up");
  }

  const headline = problems.includes("sign_date_changed")
    ? "The deal's estimated sign date has moved since this plan was made — the months need re-planning."
    : problems.includes("close_date_passed")
    ? "The estimated close month has passed and this deal is still open — these numbers need re-planning."
    : problems.includes("past_months_unbooked")
      ? "Money is planned into months that have already gone by."
      : problems.includes("does_not_add_up")
        ? "The months do not add up to the contract value."
        : "On plan.";

  return {
    problems,
    invalid: problems.length > 0,
    strandedAmount: stranded,
    headline,
  };
}

/* ------------------------------------------------------------- deviation */

export type MonthDeviation = {
  month: string;
  /** What the frozen sheet said this month would bring. */
  was: number;
  /** What the plans say today. */
  now: number;
  delta: number;
};

export type DealDeviation = {
  opportunityId: string;
  opportunityName: string;
  customer: string;
  was: number;
  now: number;
  delta: number;
  /** Which months moved, so "where did the gap come from" has an answer. */
  months: MonthDeviation[];
  /**
   * HOW MUCH ACTUALLY MOVED, which is not the same as how much the total
   * changed. A deal that slipped $300K from August into September has a net
   * delta of ZERO — and it is the single case Suren named: "how many
   * opportunities we thought will close in July are not closed in July and are
   * now spilling into August". Ranking on the net would have buried it at the
   * bottom of the list under deals that merely got bigger.
   */
  movement: number;
  /** True when money moved between months without the total changing. */
  slipped: boolean;
};

export type DeviationReport = {
  /** The snapshot being compared against, or null when none was ever taken. */
  againstMonth: string | null;
  takenAt: string | null;
  byMonth: MonthDeviation[];
  byDeal: DealDeviation[];
  totalWas: number;
  totalNow: number;
  totalDelta: number;
};

/**
 * "COMPARING THESE TWO, THEN SEEING HOW MANY OPPORTUNITIES WE THOUGHT WILL
 * CLOSE IN JULY ARE NOT CLOSED IN JULY AND ARE NOW SPILLING INTO AUGUST."
 *
 * Current plans versus the most recent frozen sheet, per month AND per deal.
 * Per deal is the half that makes the meeting useful: a total that fell by
 * $2M tells you nothing you can act on, four named deals that slipped tells
 * you exactly who to ask.
 */
export function buildDeviation(
  plans: AccrualPlan[],
  snapshot: AccrualSnapshot | null
): DeviationReport {
  const nowByDeal = new Map<string, AccrualPlan>();
  for (const p of plans) nowByDeal.set(p.opportunityId, p);

  const wasByDeal = new Map<string, AccrualSnapshot["rows"][number]>();
  for (const r of snapshot?.rows ?? []) wasByDeal.set(r.opportunityId, r);

  const months = new Set<string>();
  for (const p of plans) for (const l of p.lines) months.add(l.month);
  for (const r of snapshot?.rows ?? []) {
    for (const m of Object.keys(r.byMonth)) months.add(m);
  }
  const monthList = [...months].sort();

  const byMonth: MonthDeviation[] = monthList.map((month) => {
    const now = plans.reduce(
      (s, p) => s + (p.lines.find((l) => l.month === month)?.amount ?? 0),
      0
    );
    const was = (snapshot?.rows ?? []).reduce(
      (s, r) => s + (r.byMonth[month] ?? 0),
      0
    );
    return { month, was, now, delta: now - was };
  });

  const dealIds = new Set([...nowByDeal.keys(), ...wasByDeal.keys()]);
  const byDeal: DealDeviation[] = [...dealIds]
    .map((id) => {
      const plan = nowByDeal.get(id);
      const was = wasByDeal.get(id);
      const nowTotal = plan ? planTotal(plan) : 0;
      const wasTotal = was
        ? Object.values(was.byMonth).reduce((s, v) => s + v, 0)
        : 0;
      const monthRows = monthList
        .map((month) => {
          const n = plan?.lines.find((l) => l.month === month)?.amount ?? 0;
          const w = was?.byMonth[month] ?? 0;
          return { month, was: w, now: n, delta: n - w };
        })
        .filter((m) => m.delta !== 0);
      /* Half the sum of the month swings: a $300K slip shows as -300K in one
         month and +300K in the next, and that is one $300K movement, not
         $600K of it. */
      const swing =
        monthRows.reduce((s, m) => s + Math.abs(m.delta), 0) / 2;
      const delta = nowTotal - wasTotal;
      return {
        opportunityId: id,
        opportunityName: plan?.opportunityName ?? was?.opportunityName ?? id,
        customer: plan?.customer ?? was?.customer ?? "",
        was: wasTotal,
        now: nowTotal,
        delta,
        months: monthRows,
        movement: Math.max(Math.abs(delta), swing),
        slipped: delta === 0 && monthRows.length > 0,
      };
    })
    /* Only what actually moved — a deviation report listing every unchanged
       deal is the Excel sheet it replaces. */
    .filter((d) => d.delta !== 0 || d.months.length > 0)
    .sort((a, b) => b.movement - a.movement);

  const totalNow = byMonth.reduce((s, m) => s + m.now, 0);
  const totalWas = byMonth.reduce((s, m) => s + m.was, 0);

  return {
    againstMonth: snapshot?.id ?? null,
    takenAt: snapshot?.takenAt ?? null,
    byMonth: byMonth.filter((m) => m.now !== 0 || m.was !== 0),
    byDeal,
    totalWas,
    totalNow,
    totalDelta: totalNow - totalWas,
  };
}
