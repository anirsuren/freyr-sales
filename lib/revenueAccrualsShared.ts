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

/**
 * One month of planned revenue. `month` is an ISO year-month, "2026-04".
 *
 * ONE-TIME AND RECURRING, SPLIT (Suren, Sep 1: "what if we need a separation
 * between month-on-month revenue and one-time revenue? You can make another
 * column: OTS amount in USD, ARR amount in USD... and then you can have a
 * total column, which will come for every month").
 *
 * `amount` REMAINS THE TOTAL and is what every rollup reads — the report, the
 * month-on-month gap, the contract schedule that aliases this type. The two
 * splits are optional and additive: fill them and the total follows; leave
 * them empty and the total is entered directly, exactly as every plan written
 * before today already is. Nothing existing has to be migrated.
 */
export type AccrualLine = {
  month: string;
  amount: number;
  /** One-time revenue in this month. */
  ots?: number;
  /** Recurring revenue in this month. */
  arr?: number;
};

/**
 * WHAT AN ACCRUAL RECORD IS RIGHT NOW. Suren, Sep 1, after working through and
 * discarding several other words: exactly these three, no more.
 *
 *  · ACTIVE AND FILLED — it has accrual numbers and it is the current version.
 *    A user deviation produces another one of these; deviating does not make a
 *    record less current, it makes it newer.
 *  · NON FILLED — nobody has entered numbers. He noted this matters most on Go
 *    get and High confidence deals and matters less on Pipeline, which is a
 *    question of how loudly to say it. This layer reports it the same either
 *    way and leaves the emphasis to the screen.
 *  · INACTIVE — a version the system created because the estimated sign date
 *    passed with no signature, deliberately left blank. "Somebody has to go and
 *    fix it."
 *
 * APPROVAL IS NOT IN HERE ON PURPOSE. He raised it in the same breath ("should
 * the top pay also review it as a process?") and floated an Approved status,
 * then settled on the three above without landing it. Nothing is built for it.
 */
export const ACCRUAL_STATUSES = [
  "Active and Filled",
  "Non Filled",
  "Inactive",
] as const;
export type AccrualStatus = (typeof ACCRUAL_STATUSES)[number];

/**
 * HOW A VERSION CAME TO EXIST. This is the other axis and it is not the status:
 * his sheet carries both, a version number with a status beside it, and a
 * record that was user-deviated is still Active and Filled.
 *
 *  · original — the plan as first written. Every plan saved before versions
 *    existed reads as this, version 1, with no stored data changed.
 *  · user     — somebody pressed Deviate, adjusted the months and gave a reason.
 *  · system   — the sweep found the sign date had passed unsigned and opened a
 *               blank version to force a human back to it.
 */
export const DEVIATION_ORIGINS = ["original", "user", "system"] as const;
export type DeviationOrigin = (typeof DEVIATION_ORIGINS)[number];

/**
 * ONE VERSION OF AN ACCRUAL RECORD.
 *
 * Suren, Sep 1: "The moment you do that, this record from version 1 becomes a
 * new record called version 2, and the record status becomes deviated. Every
 * time you see an accrual record, the record has a version number and a
 * status."
 *
 * SO A DEVIATION APPENDS, IT NEVER OVERWRITES. Version 1 keeps the figures it
 * always had; version 2 holds the revised ones. That is the only reason a
 * variance between them exists to report, and it is the same instinct as the
 * frozen snapshot: this module never loses the number it used to say.
 *
 * THE MONTHS CARRY THE FULL OTS/ARR/TOTAL SHAPE ("the two columns repeat for
 * the deviation, and then they adjust and save"), which is why a version holds
 * AccrualLine and not a bare figure. A deviation may also name months the
 * original plan never had, which is exactly his example: nothing in September,
 * something in October, November and December.
 */
export type AccrualVersion = {
  /** 1-based and contiguous. Version 1 is the plan as first written. */
  version: number;
  origin: DeviationOrigin;
  /** What THIS version says. Empty on a system version, deliberately. */
  lines: AccrualLine[];
  /**
   * WHY. Required on a user deviation and refused without one, because a
   * deviation nobody explained is the number that starts the argument in the
   * meeting. The system does not give a reason; its blankness is the reason.
   */
  reason?: string;
  /** Who made this version. "It also shows who all have deviated." */
  by: string;
  at: string;
  /**
   * SET ONLY BY THE SYSTEM SWEEP, and only ever alongside origin `system`.
   *
   * Suren, Sep 1, asked directly whether a person could mark one inactive:
   * "nobody can make it inactive because people have to enter that information
   * somehow. If they have not filled it, then it's non-filled... if the system
   * makes it inactive, it's primarily because of the dates. They expire."
   *
   * So a human's inaction produces Non Filled and nothing else. There is no
   * user-facing way to set this, and the normaliser drops it from any version
   * that is not the system's own, so a hand-edited row cannot smuggle one in.
   * "Our system just inactivates it, don't even fill." Filling that version
   * clears it, which is the fix he described.
   */
  inactive?: boolean;
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
  /**
   * THE OPERATIVE MONTHS, and its meaning has not changed: this is what every
   * rollup in the app reads — the report, the dashboard, the month-on-month
   * gap, the contract schedule that aliases AccrualLine.
   *
   * With versions in play this mirrors the LAST FILLED version, and the
   * normaliser enforces that the same way it enforces amount = ots + arr. A
   * system version being blank therefore does NOT blank the plan: that is rule
   * 2 above, in his own words, "it's not removing, you can invalidate... but
   * there has to be a flag which says it is not validating and you go and fix
   * it." The flag is the Inactive status. The money stays on the report.
   */
  lines: AccrualLine[];
  /**
   * THE VERSION HISTORY, oldest first, the last one operative.
   *
   * OPTIONAL, AND THAT IS THE WHOLE BACKWARD-COMPATIBILITY STORY. Every plan
   * written before today has no `versions` key and none is written into the
   * database for it. Such a plan reads as a single version 1 of origin
   * `original`, Active and Filled when it has figures and Non Filled when it
   * does not. Nothing is migrated; see planVersions().
   */
  versions?: AccrualVersion[];
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

/* --------------------------------------------------------------- versions */

/**
 * IS THERE A NUMBER IN HERE? "Non filled" is his word for a record nobody has
 * entered accruals against, so a month list of zeroes is not filled: nobody
 * accrues nothing on purpose, and treating typed zeroes as filled would hide
 * the deals the Non Filled flag exists to surface.
 */
export function versionFilled(lines: AccrualLine[]): boolean {
  return lines.some((l) => (l.amount || 0) > 0);
}

/** One version's status. The three words he landed on, and only those. */
export function versionStatus(version: AccrualVersion): AccrualStatus {
  if (version.inactive) return "Inactive";
  return versionFilled(version.lines) ? "Active and Filled" : "Non Filled";
}

export function versionTotal(version: AccrualVersion): number {
  return version.lines.reduce((s, l) => s + (l.amount || 0), 0);
}

/**
 * EVERY VERSION OF A PLAN, OLDEST FIRST, INCLUDING PLANS THAT HAVE NONE.
 *
 * This is where backward compatibility lives, and it is the reason no stored
 * row has to be rewritten. A plan saved before versions existed has no
 * `versions` key, so it reads here as exactly one version: number 1, origin
 * `original`, carrying the months it already had, stamped with the edit it
 * already recorded. Active and Filled when it has figures, Non Filled when it
 * does not, which is what he asked for and what it always effectively was.
 */
export function planVersions(
  plan: Pick<AccrualPlan, "lines" | "versions" | "updatedBy" | "updatedAt">
): AccrualVersion[] {
  const stored = plan.versions ?? [];
  if (stored.length) return [...stored].sort((a, b) => a.version - b.version);
  return [
    {
      version: 1,
      origin: "original",
      lines: plan.lines,
      by: plan.updatedBy,
      at: plan.updatedAt,
    },
  ];
}

/**
 * THE VERSION A PERSON IS ACTUALLY EDITING, and it is not simply the highest
 * number.
 *
 * Suren, Sep 1: "When the user enters, it's always whichever is the latest
 * active version." A system version is Inactive by construction, so the newest
 * version is exactly the wrong answer on a record the sweep has just touched:
 * an edit routed there would land on a version marked expired and blank.
 *
 * This is a named function rather than a line each caller writes because
 * getting it wrong writes to a superseded version, silently. `lines` on the
 * plan mirrors this same version, so the report, the editor and the screen can
 * never be looking at three different sets of months.
 */
export function latestActiveVersion(
  plan: Pick<AccrualPlan, "lines" | "versions" | "updatedBy" | "updatedAt">
): AccrualVersion {
  const all = planVersions(plan);
  for (let i = all.length - 1; i >= 0; i -= 1) {
    if (!all[i].inactive) return all[i];
  }
  /* Version 1 is never the system's, so this is unreachable in practice; it
     is here so a corrupted row degrades to the oldest record rather than
     throwing on a page somebody is trying to read. */
  return all[0];
}

/**
 * ONE MONTH, BEFORE AND AFTER. This is Suren's "another column that shows up
 * against all of this" (Sep 1): the version being deviated FROM on one side,
 * the figures being typed on the other.
 *
 * Either side may be missing, and both cases are real. A month with no
 * `revised` was dropped by the deviation. A month with no `planned` is one the
 * deviation ADDED, which is his own example: "He's not putting anything in
 * September; he puts in October, November, December."
 */
export type VersionMonthRow = {
  month: string;
  planned: AccrualLine | undefined;
  revised: AccrualLine | undefined;
  variance: number;
};

export type VersionComparison = {
  rows: VersionMonthRow[];
  plannedTotal: number;
  revisedTotal: number;
  varianceTotal: number;
};

/**
 * ONE VERSION AGAINST ANOTHER, MONTH BY MONTH.
 *
 * The Deviate form and the record's own history table both need these numbers,
 * and three components each doing their own subtraction is how a page ends up
 * showing a variance that disagrees with its own footer.
 *
 * SCOPE, DELIBERATELY: this compares two versions of ONE record and nothing
 * else. Sizing what deviations cost across a period was raised in the same
 * conversation and put off: "should we complicate this now, or should we leave
 * it for now?... You can do that later, right?... Let's just focus on who
 * deviated." So there is no cross-period impact analysis here, on purpose. The
 * month-on-month snapshot gap further down is a separate, older mechanism and
 * is untouched by any of this.
 */
export function buildVersionComparison(
  from: AccrualLine[],
  to: AccrualLine[]
): VersionComparison {
  const before = new Map(from.map((l) => [l.month, l]));
  const after = new Map(to.map((l) => [l.month, l]));
  const months = [...new Set([...before.keys(), ...after.keys()])].sort();
  const rows: VersionMonthRow[] = months.map((month) => {
    const planned = before.get(month);
    const revised = after.get(month);
    return {
      month,
      planned,
      revised,
      variance: (revised?.amount ?? 0) - (planned?.amount ?? 0),
    };
  });
  const plannedTotal = from.reduce((s, l) => s + (l.amount || 0), 0);
  const revisedTotal = to.reduce((s, l) => s + (l.amount || 0), 0);
  return {
    rows,
    plannedTotal,
    revisedTotal,
    varianceTotal: revisedTotal - plannedTotal,
  };
}

/** One row of the history table on a record's own screen. */
export type VersionHistoryRow = {
  version: number;
  origin: DeviationOrigin;
  status: AccrualStatus;
  lines: AccrualLine[];
  total: number;
  /** Present on a user deviation, which cannot be saved without one. */
  reason?: string;
  by: string;
  at: string;
  /** True on the version a person would be editing (latestActiveVersion). */
  current: boolean;
};

/**
 * EVERY PREVIOUS VERSION OF ONE RECORD, NEWEST FIRST.
 *
 * Suren, Sep 1: "There will be one more table about all the previous
 * deviations for this record. That will have all the versions that got
 * deviated, and those versions will show up." Newest first because the
 * question being asked of this table is always what happened last.
 */
export function buildVersionHistory(
  plan: Pick<AccrualPlan, "lines" | "versions" | "updatedBy" | "updatedAt">
): VersionHistoryRow[] {
  const current = latestActiveVersion(plan).version;
  return planVersions(plan)
    .map((v) => ({
      version: v.version,
      origin: v.origin,
      status: versionStatus(v),
      lines: v.lines,
      total: versionTotal(v),
      ...(v.reason ? { reason: v.reason } : {}),
      by: v.by,
      at: v.at,
      current: v.version === current,
    }))
    .reverse();
}

/** One row of the Deviations tab. */
export type PlanDeviationSummary = {
  opportunityId: string;
  opportunityName: string;
  customer: string;
  /** The number he wants on the row: the latest version of this record. */
  version: number;
  status: AccrualStatus;
  origin: DeviationOrigin;
  /**
   * "The number of deviations shows up." Version 1 is the plan, not a
   * deviation, so this counts everything after it.
   */
  deviationCount: number;
  /** "It also shows who all have deviated." People only, oldest first. */
  deviatedBy: string[];
  /** Whether the system has flagged this record as expired and unsigned. */
  systemDeviated: boolean;
  lastDeviatedAt?: string;
  /** False on a record nobody has ever deviated, so the tab can filter to the
   *  records that belong on it. */
  deviated: boolean;
};

/**
 * ONE RECORD, AS THE DEVIATIONS TAB READS IT.
 *
 * His columns are Opportunity ID, Version no, Status, Owner, number of
 * deviations and a History control. OWNER IS NOT IN HERE and that is not an
 * oversight: the owner belongs to the opportunity and this app already joins
 * deals to plans wherever it shows both. Copying it onto the plan would give
 * it a second, staler home, and the one field this type does denormalise
 * (opportunityName) is denormalised for a stated reason.
 */
export function buildPlanDeviation(
  plan: Pick<
    AccrualPlan,
    | "lines"
    | "versions"
    | "updatedBy"
    | "updatedAt"
    | "opportunityId"
    | "opportunityName"
    | "customer"
  >
): PlanDeviationSummary {
  const all = planVersions(plan);
  const latest = all[all.length - 1];
  const deviations = all.slice(1);
  const people: string[] = [];
  for (const v of deviations) {
    if (v.origin === "user" && v.by && !people.includes(v.by)) people.push(v.by);
  }
  return {
    opportunityId: plan.opportunityId,
    opportunityName: plan.opportunityName,
    customer: plan.customer,
    version: latest.version,
    /* The record's status is the status of its newest version, INCLUDING an
       inactive one: that flag is the whole point of the sweep and hiding it
       behind the latest active version would bury it. Editing still goes to
       latestActiveVersion; reading the state of the record does not. */
    status: versionStatus(latest),
    origin: latest.origin,
    deviationCount: deviations.length,
    deviatedBy: people,
    systemDeviated: deviations.some((v) => v.origin === "system"),
    ...(deviations.length
      ? { lastDeviatedAt: deviations[deviations.length - 1].at }
      : {}),
    deviated: deviations.length > 0,
  };
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
