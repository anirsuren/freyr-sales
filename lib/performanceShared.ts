/**
 * PERFORMANCE MANAGEMENT — shared shapes and math (Suren, Aug 11 voice notes
 * + goals.xlsx).
 *
 * The model, in his words:
 * - A GOAL MASTER kept "in one place, not hard-coded": goal types, primary
 *   goals, and subgoals ("Booked revenue" → Growth Accounts / Focused Account
 *   AMR / Focused Account EUA). Subgoals carry GOAL OWNERS (can be several,
 *   e.g. Rukmini) and the people responsible, each with a target.
 * - From the master, some primary goals are PICKED as org goals — only those
 *   appear on Org performance ("I may have some goals I don't want to track").
 * - The platform does exactly one calculation: accumulate actuals. "Every
 *   person's count will become group count, and all groups' count will become
 *   organization count." Targets below the top are pacing, not policed.
 * - Verified is a manual yes/no at every level; he decides when.
 *
 * His sheet also carries ratio goals (Win/Loss %, Average Deal Size) that a
 * running total would misstate — those track the LATEST reported value
 * instead (`measure: "level"`). Everything else is a running total.
 *
 * This file is pure data + math so both the server store and the client
 * screens can use it. Nothing here touches the database or the data mode.
 */

import {
  BASE_CURRENCY,
  convert,
  fmtMoney,
  type CurrencyCode,
  type CurrencyRates,
} from "./currency";

export type GoalUnit = "currency" | "count" | "percent";

/** Running total (sum of actuals) vs latest reported value (ratios, averages). */
export type GoalMeasure = "total" | "level";

export type SubgoalPerson = {
  name: string;
  target: number;
  verified: boolean;
  /** "group" when a department assignment put them here, so taking that
   *  department off the slice can tell them from a hand-picked person. */
  assignedBy?: string;
};

export type Subgoal = {
  id: string;
  name: string;
  target: number;
  /** Goal owners — "you can add multiple goal owners here" (e.g. Rukmini). */
  owners: string[];
  verified: boolean;
  people: SubgoalPerson[];
  /**
   * Departments carrying this slice (Anir, Aug 15: "for these sub-goals,
   * should I be able to add a group too? Doesn't it make sense for that to be
   * there?"). It does: a subgoal is a goal with a narrower scope, and without
   * this "the EU team owns this half" could only be said by listing names.
   * Same shape and same rules as a goal's, exclusions included.
   */
  groupAssignments?: GoalGroupAssignment[];
};

/** A goal attached straight to a person from the Goal Master (Suren, Aug 12:
 *  "goal is attached at the org level, goal is attached at the person level"
 *  — never at the department; a department is just its members added up). */
export type GoalAssignment = {
  person: string;
  target: number;
  verified: boolean;
  assignedBy: string;
  assignedAt: string;
};

/**
 * A GOAL GIVEN TO A GROUP.
 *
 * Suren wanted a goal to be assignable at all three altitudes, not only to a
 * person (Anir, Aug 15: "assigning goals to organization, to group, and people
 * is not there. There's only assignment at the people level"). Organization was
 * already `pickedForOrg` and person was already `assignments`; this is the
 * middle one that was missing.
 *
 * It carries a target of its own AND leaves the group's people carrying theirs,
 * because both readings are true at once (Anir: "I think it can be both") and
 * that is exactly how a subgoal already behaves: the group holds the number,
 * the people hold their share, and the UI reconciles the two without forcing
 * them to match.
 *
 * ACTUALS are never entered here. Suren's rule stands: "each person's count
 * becomes their group's count, and the groups add up to the organization.
 * That's the only math." A group's achievement is always its people's, summed.
 */
export type GoalGroupAssignment = {
  groupId: string;
  target: number;
  verified: boolean;
  assignedBy: string;
  assignedAt: string;
  /**
   * People who are in the group but NOT on this goal (Suren, via Anir, Aug 15:
   * "not all the users in the group need to have the same goal... you also
   * have the ability to delete that guy"). Handing a goal to a department
   * attaches everyone in it; this is the exception list, so taking one person
   * off sticks instead of being undone the next time the group is saved. They
   * stay in the group — this is about one goal.
   */
  excludedPeople?: string[];
};

export type PrimaryGoal = {
  id: string;
  name: string;
  /** One of the goal types from the master list (editable, not hard-coded). */
  type: string;
  unit: GoalUnit;
  /** Money goals only: the currency the TARGET is stated in. A €1M target is
   *  not a $1M target, so the goal carries its own. */
  currency?: CurrencyCode;
  measure: GoalMeasure;
  year: number;
  /** The organization target — the big number from the top. 0 = not set yet. */
  target: number;
  /** Picked for the goal plan → shows on Org performance. */
  pickedForOrg: boolean;
  verified: boolean;
  subgoals: Subgoal[];
  /**
   * THE SCHEDULE, SET BY WHOEVER OWNS THE GOAL — never by the app.
   *
   * Anir, Aug 16: "Who the fuck is saying 'must be at 375K'? Who's saying it?
   * It's not you. It shouldn't be you... shouldn't that be something that
   * whoever makes the goal has in the goal? What if it's like this amount by
   * this month or this amount by this month?"
   *
   * Each milestone is a CUMULATIVE figure the goal should have reached by that
   * date — "$300K by 30 Sep, $700K by 31 Dec". Absent means nobody has set a
   * schedule, and the app then says nothing about pacing rather than inventing
   * a straight line and calling a goal lagging against a number nobody agreed.
   */
  milestones?: GoalMilestone[];
  /** Person-level attaches from the Goal Master. */
  assignments?: GoalAssignment[];
  /** Group-level attaches from the Goal Master. */
  groupAssignments?: GoalGroupAssignment[];
  /** COMPOSITE goal: its number is only the sum of these goals, and nobody
   *  logs on it directly (Suren, Aug 13: "people enter only the sub-level").
   *  Booked Revenue = New Business + Existing Business + Renewals. */
  componentGoalIds?: string[];
  /** Cadences this goal may be measured at. Missing = all four. The Goal
   *  Master decides: "you can't get RFPs on a weekly basis" — so an RFP goal
   *  simply does not allow weekly. Yearly is always allowed. */
  cadences?: Cadence[];
  createdBy: string;
  createdAt: string;
};

export type GoalMilestone = {
  /** ISO day this figure is due by. */
  date: string;
  /** Cumulative target by that date, in the goal's own unit. */
  amount: number;
};

/**
 * The figure the goal was supposed to have reached by now, from its own
 * schedule. Null when nobody set one — which is the honest answer, not zero
 * and not a twelfth of the target per month.
 */
export function milestoneByNow(
  goal: Pick<PrimaryGoal, "milestones">,
  now = new Date()
): GoalMilestone | null {
  /**
   * An ISO day is a DAY, not an instant. Date.parse("2026-07-31") is UTC
   * midnight, so west of Greenwich a milestone came due — and was labelled —
   * a day early. Read the parts and build the local end of that day, which is
   * what "reach $300K by 31 July" actually means.
   */
  const endOfDay = (iso: string): number => {
    const [y, mo, d] = iso.split("-").map(Number);
    if (!y || !mo || !d) return NaN;
    return new Date(y, mo - 1, d, 23, 59, 59, 999).getTime();
  };
  const t = now.getTime();
  const due = (goal.milestones ?? [])
    .filter((m) => {
      const d = endOfDay(m.date);
      return !Number.isNaN(d) && d <= t;
    })
    .sort((a, b) => endOfDay(a.date) - endOfDay(b.date));
  return due.length ? due[due.length - 1] : null;
}

export type Cadence = "weekly" | "monthly" | "quarterly" | "yearly";
export const ALL_CADENCES: Cadence[] = [
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
];

export function goalCadences(goal: Pick<PrimaryGoal, "cadences">): Cadence[] {
  const set = new Set(goal.cadences ?? ALL_CADENCES);
  set.add("yearly");
  return ALL_CADENCES.filter((c) => set.has(c));
}

export function isComposite(
  goal: Pick<PrimaryGoal, "componentGoalIds">
): boolean {
  return (goal.componentGoalIds?.length ?? 0) > 0;
}

/**
 * THE THREE THINGS A CLAIM CAN BE (Anir, Aug 19: "you told me that there's no
 * status for being sent back. Can you fix that").
 *
 *   reported  — logged, waiting on the group owner
 *   sent_back — the owner rejected it, waiting on the person who made it
 *   verified  — signed off and locked, and the only one that counts
 *
 * Sent back used to be "reported plus a note", so a rejected claim and one
 * nobody had opened were indistinguishable to every query in the app: the
 * owner's queue listed both, the pill said "waiting" for both, and only a
 * note buried in the row told them apart.
 *
 * A legacy entry with no status was entered by a manager and counts.
 */
export type EntryStatus = "reported" | "sent_back" | "verified";

export function entryStatus(a: Pick<PerfActual, "status">): EntryStatus {
  return a.status ?? "verified";
}

/** Not signed off yet, whichever side it is sitting with — the question every
 *  "how much is still waiting" sum is really asking. */
export function isPending(a: Pick<PerfActual, "status">): boolean {
  return entryStatus(a) !== "verified";
}

/** One vocabulary for the three states, so a claim reads the same wherever it
 *  is printed — a row, a tooltip, a spreadsheet. */
export const ENTRY_STATUS_LABEL: Record<EntryStatus, string> = {
  reported: "Waiting to be verified",
  sent_back: "Sent back",
  verified: "Verified",
};

export function entryStatusLabel(a: Pick<PerfActual, "status">): string {
  return ENTRY_STATUS_LABEL[entryStatus(a)];
}

export type PerfGroup = {
  id: string;
  name: string;
  head: string;
  members: string[];
  createdBy: string;
  createdAt: string;
};

export type ActualEvidence = { name: string; url: string };

export type PerfActual = {
  id: string;
  goalId: string;
  /** Null when the primary goal has no subgoals yet. */
  subgoalId: string | null;
  person: string;
  amount: number;
  /** ISO date (day precision) the result belongs to. */
  date: string;
  /** What this was actually signed in. Absent = the workspace currency, which
   *  is what every entry before Aug 16 was. Never rewritten by a conversion. */
  currency?: CurrencyCode;
  note?: string;
  /** Which customer this came from. Free text historically, now the account
   *  name chosen from the real list — same string every time, so a number can
   *  be traced back to the company that paid it. */
  customer?: string;
  /** The account record behind that name, when it is one of ours. */
  customerId?: string;
  /** The specific engagement on that account (Anir, Aug 15: "I choose a
   *  customer and then maybe I choose a deal"), and the label shown for it. */
  dealId?: string;
  dealLabel?: string;
  /**
   * The opportunity this number came out of (Suren, Aug 16: "Ananth has
   * achieved 500K, but that 500K came from what opportunities, what leads — we
   * need to know").
   *
   * Optional on purpose, and it always will be: he was explicit that "not all
   * goals can be connected to deals and opportunities, some goals may not be".
   * A meetings-held or a headcount goal has no deal behind it, and the line
   * item level simply says so rather than demanding one.
   */
  opportunityId?: string;
  /** The master activity this number came FROM (a pilot, a contract) when it
   *  was logged through an activity prompt. Optional forever — plenty of
   *  results have no activity behind them. Feeds the future activity→goal
   *  flow report; nothing is stamped retroactively. */
  activityId?: string;
  /** The proof: signed contract, SOW, opportunity summary (Suren, Aug 13:
   *  "we need evidence"). */
  evidence?: ActualEvidence[];
  /** reported = waiting for the group owner; verified = checked and LOCKED.
   *  Absent on entries from before this existed — those were entered by
   *  managers directly and count as verified. */
  status?: EntryStatus;
  verifiedBy?: string;
  verifiedAt?: string;
  /** Set when a group owner sends a claim back with feedback. */
  managerNote?: string;
  /**
   * WHO sent it back, and when (Anir, Aug 20: "I can't see who sent it back.
   * I can see the reason, though"). A rejection landing on a rep's row with a
   * note and no name is an instruction from nobody — there is no one to go
   * ask about it. Cleared on verify, restamped on every new rejection.
   */
  sentBackBy?: string;
  sentBackAt?: string;
  /**
   * When the claimant fixed a sent-back claim and put it back up.
   *
   * Sending back and never-been-looked-at were the same stored state, so a
   * claim the owner had rejected still sat in that owner's queue as "waiting
   * for your verification" — the queue mixed what was waiting on the reader
   * with what was waiting on somebody else (Anir, Aug 19). This is the third
   * position: rejected, then answered, and waiting on the owner again. The
   * rejection note stays put so the timeline can still show it happened.
   */
  resubmittedAt?: string;
  addedBy: string;
  addedAt: string;
};

export type PerformanceState = {
  /** The goal-type master list. Seeded from Suren's sheet, extendable. */
  types: string[];
  goals: PrimaryGoal[];
  groups: PerfGroup[];
  actuals: PerfActual[];
  /**
   * Units of each currency that one US dollar buys, set by an admin. Absent
   * for a currency means "no rate on file", and anything in it is shown as
   * recorded rather than converted at a guess. See lib/currency.ts.
   */
  rates?: CurrencyRates;
};

/** The goal types exactly as they appear in Suren's goals.xlsx (Aug 11). */
export const DEFAULT_GOAL_TYPES = [
  "Financial and Revenue Performance",
  "Lead Generation and Outreach",
  "Sales Activity & Engagement",
  "Proposal & Deal Execution",
] as const;

export const EMPTY_PERFORMANCE: PerformanceState = {
  types: [...DEFAULT_GOAL_TYPES],
  goals: [],
  groups: [],
  actuals: [],
};

/* ------------------------------------------------------------------ math */

type ActualFilter = {
  subgoalId?: string | null;
  person?: string;
};

/**
 * The one calculation. Running-total goals sum their actuals; level goals
 * (ratios, averages) report the latest entry instead — summing a win rate
 * would be a lie.
 */
/**
 * ONE GOAL'S MONEY, IN ONE CURRENCY.
 *
 * The totals were `total += a.amount` with no idea what those amounts were
 * denominated in, so a EUR 500,000 result and a USD 500,000 result on the same
 * goal added up to "€1M" and the goal declared itself 100% met. That is not
 * hypothetical: settling a Met deal stamps the DEAL's currency onto the claim,
 * so one euro deal against a dollar goal is all it takes.
 *
 * An entry with no code is in the goal's own money, as it always was. A
 * foreign entry converts at the admin's rate. With no rate on file there is
 * nothing honest to convert with, so it counts as recorded — exactly today's
 * behaviour, and money never vanishes out of a total.
 */
export function inGoalCurrency(
  entry: Pick<PerfActual, "amount" | "currency">,
  goalCurrency: CurrencyCode | undefined,
  rates: CurrencyRates | undefined
): number {
  const to = goalCurrency ?? BASE_CURRENCY;
  const from = entry.currency ?? to;
  if (from === to) return entry.amount;
  const converted = convert(entry.amount, from, to, rates ?? { [BASE_CURRENCY]: 1 });
  /**
   * NO RATE MEANS NO NUMBER, NEVER A SILENT 1:1 (found by the Aug 22 sweep,
   * proved end to end: ₹100,000 logged against a $1,000,000 goal with no INR
   * rate on file read "$100K · 10% met" on Org performance — an 83x
   * overstatement of about US$1,200, and it survived sign-off because the
   * verifier saw "$100K" too).
   *
   * Returning the raw figure was the one place in the app that guessed. The
   * opportunity form has always refused to ("No EUR rate set yet — an admin
   * adds it on the Performance page; until then this deal has no USD value"),
   * and lib/currency's own doctrine is that an inexact conversion is not a
   * conversion. Performance now agrees: the entry stays on the list in the
   * currency it was signed in, and contributes nothing to a total it cannot
   * honestly join until an admin enters the rate.
   *
   * Nothing on screen moves today — every goal, deal and actual in the
   * workspace is USD, and USD→USD returns above this line.
   */
  return converted.exact ? converted.value : 0;
}

export function actualValue(
  actuals: PerfActual[],
  goal: Pick<PrimaryGoal, "id" | "measure" | "componentGoalIds" | "currency">,
  /** `rates` rides in the options so a caller holding the state can hand over
   *  the admin's FX table without every call growing placeholder arguments. */
  filter: ActualFilter & { rates?: CurrencyRates } = {},
  period?: PeriodKey,
  now = new Date()
): number {
  let total = 0;
  let latest: PerfActual | null = null;
  /**
   * A COMPOSITE IS ITS COMPONENTS (bug, Aug 15). Nothing can be logged on a
   * composite goal directly — the log form refuses it — so matching only its
   * own id made "Booked Revenue (Contract Value Signed)" read $0 while its own
   * drill-down, which uses goalFamilyActuals, showed the $250K verified on
   * Renewals. The row and the drill-down under it disagreed about the same
   * money. Plain goals have no components, so nothing else moves.
   */
  const family = new Set([goal.id, ...(goal.componentGoalIds ?? [])]);
  for (const a of actuals) {
    if (!family.has(a.goalId)) continue;
    if (filter.subgoalId !== undefined && a.subgoalId !== filter.subgoalId)
      continue;
    if (filter.person && a.person !== filter.person) continue;
    if (period && !inPeriod(a.date, period, now)) continue;
    if (goal.measure === "level") {
      if (
        !latest ||
        Date.parse(a.date) > Date.parse(latest.date) ||
        (a.date === latest.date && a.addedAt > latest.addedAt)
      ) {
        latest = a;
      }
    } else {
      total += inGoalCurrency(a, goal.currency, filter.rates);
    }
  }
  return goal.measure === "level" ? (latest?.amount ?? 0) : total;
}

/**
 * Has anybody logged anything here yet? Verification is leadership signing
 * off on a number somebody reported, so with no entries there is literally
 * nothing to sign off (Anir, Aug 15: "there's nothing to verify here, right?
 * Why would you need that thing there?").
 *
 * Deliberately counts ENTRIES, not the total: a level goal (a ratio, an
 * average) can legitimately report zero, and that zero is still a claim
 * somebody made and leadership can confirm.
 */
export function hasActuals(
  actuals: PerfActual[],
  filter: { goalId: string; subgoalId?: string | null; person?: string }
): boolean {
  return actuals.some(
    (a) =>
      a.goalId === filter.goalId &&
      (filter.subgoalId === undefined || a.subgoalId === filter.subgoalId) &&
      (!filter.person || a.person === filter.person)
  );
}

/** The distinct people who actually logged numbers on a goal (for goals that
 *  have no subgoal assignments yet). */
export function contributors(
  actuals: PerfActual[],
  goalId: string
): string[] {
  const set = new Set<string>();
  for (const a of actuals) if (a.goalId === goalId) set.add(a.person);
  return [...set].sort((a, b) => a.localeCompare(b));
}

export function pctMet(actual: number, target: number): number {
  if (!target || target <= 0) return 0;
  return (actual / target) * 100;
}

/** How much of the goal's year has passed (0..1). */
/**
 * HOW MUCH OF THE **FISCAL** YEAR IS GONE (bug, Aug 15).
 *
 * This measured January to December while the rest of the module runs on
 * Freyr's April-to-March year — the drill-down has always listed April first.
 * On 15 Aug 2026 it therefore said 62% of the year was gone when the fiscal
 * year was 37% through, so every goal was judged against four and a half
 * months it had not been given yet: pace verdicts read "lagging" early, and
 * "must be at" asked for $621K of a $1M target instead of $373K.
 *
 * Anir, Aug 15: "if you're counting the year starting, like the contract
 * starting from January, that doesn't make any sense."
 *
 * FY2026 = 1 Apr 2026 → 31 Mar 2027, which is what FY_START_MONTH already
 * encodes for the period columns.
 */
export function yearElapsed(year: number, now = new Date()): number {
  const start = new Date(year, FY_START_MONTH, 1).getTime();
  const end = new Date(year + 1, FY_START_MONTH, 1).getTime();
  const frac = (now.getTime() - start) / (end - start);
  return Math.min(1, Math.max(0, frac));
}

export type Pace =
  | "met"
  | "ahead"
  | "ontrack"
  | "lagging"
  | "unset"
  /** A target exists but nobody said when any of it is due. */
  | "unscheduled";

/**
 * His Q2 story, as math: "I'm supposed to at least get 50% of my target; I am
 * not there, so we are still lagging." Running totals compare achieved
 * against where the calendar says you should be; level goals compare the
 * latest value straight against the target. No target yet → nothing to judge.
 */
export function paceVerdict(
  actual: number,
  target: number,
  year: number,
  measure: GoalMeasure = "total",
  now = new Date(),
  /**
   * The goal's own schedule. WITHOUT ONE THERE IS NO VERDICT (Anir, Aug 16:
   * "Who the fuck is saying 'must be at 375K'? ... It shouldn't be you").
   * Calling a goal lagging against a line the app drew itself is the app
   * inventing the standard it then judges against.
   */
  milestone: GoalMilestone | null = null
): Pace {
  if (!target || target <= 0) return "unset";
  if (actual >= target) return "met";
  const share = pctMet(actual, target) / 100;
  if (measure === "level") {
    return share >= 0.85 ? "ontrack" : "lagging";
  }
  if (!milestone || milestone.amount <= 0) return "unscheduled";
  const ratio = actual / milestone.amount;
  if (ratio >= 1.05) return "ahead";
  if (ratio >= 0.85) return "ontrack";
  return "lagging";
}

/* --------------------------------------------------------------- periods */

export type PeriodKey = "week" | "month" | "quarter" | "year";

export const PERIODS: { value: PeriodKey; label: string }[] = [
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "quarter", label: "This quarter" },
  { value: "year", label: "This year" },
];

function startOfPeriod(period: PeriodKey, now = new Date()): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === "week") {
    // Weeks start on Monday.
    const day = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - day);
    return d;
  }
  if (period === "month") return new Date(d.getFullYear(), d.getMonth(), 1);
  if (period === "quarter")
    return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1);
  return new Date(d.getFullYear(), 0, 1);
}

export function inPeriod(
  dateIso: string,
  period: PeriodKey,
  now = new Date()
): boolean {
  const t = Date.parse(dateIso);
  if (Number.isNaN(t)) return false;
  return t >= startOfPeriod(period, now).getTime() && t <= now.getTime();
}

/* ------------------------------------------------------------ formatting */

/** $100M / $2.4M / $850K / $12,500 for money; 1,200 for counts; 45% flat. */
/**
 * THE READING LENS: format a recorded amount in whatever currency the reader
 * asked for. Non-money units ignore all of it. With no rate on file the amount
 * comes back in its OWN currency with its own symbol — the caller has not been
 * lied to, it just is not converted.
 */
export function fmtIn(
  unit: GoalUnit,
  value: number,
  opts: {
    /** What the number was recorded in. */
    from?: CurrencyCode;
    /** What the reader wants to see. */
    to?: CurrencyCode;
    rates?: CurrencyRates;
  } = {}
): string {
  if (unit !== "currency") return fmtAmount(unit, value);
  const from = opts.from ?? BASE_CURRENCY;
  const to = opts.to ?? BASE_CURRENCY;
  const c = convert(value, from, to, opts.rates ?? { [BASE_CURRENCY]: 1 });
  return fmtMoney(c.value, c.code);
}

export function fmtAmount(
  unit: GoalUnit,
  value: number,
  /** Money only. Omitted keeps the workspace currency, as it always was. */
  code?: CurrencyCode
): string {
  /**
   * A CURRENCY CODE MEANS MONEY, WHATEVER THE GOAL SAYS (Anir, Aug 20: "I
   * just realized there's no currency anywhere... Literally everywhere where
   * that number is, it has to be there").
   *
   * A result logged in USD printed as a bare "120,000" because the GOAL it
   * hung under had been created with unit=count — the goal's filing decided
   * how the money was drawn, and the money lost its symbol. Nothing ever
   * attaches a currency code to a headcount, so a code present is proof this
   * value is money and it is rendered as money. Callers that pass no code are
   * untouched: a count goal still counts, a percent goal still shows a %.
   */
  if (code) return fmtMoney(value, code);
  if (unit === "count") return Math.round(value).toLocaleString("en-US");
  if (unit === "percent") {
    const r = Math.round(value * 10) / 10;
    return `${Number.isInteger(r) ? r.toFixed(0) : r}%`;
  }
  return fmtMoney(value, BASE_CURRENCY);
}

function trim1(n: number): string {
  const r = n >= 100 ? Math.round(n) : Math.round(n * 10) / 10;
  return String(r);
}

/**
 * Targets get typed as people talk: "100M", "2.5m", "750k", "1,200", "45".
 * Returns null when it isn't a number.
 */
export function parseAmountInput(text: string): number | null {
  const raw = text.trim().replace(/[$,%\s]/g, "").replace(/,/g, "").toLowerCase();
  if (!raw) return null;
  // Shorthand people actually type, spelled out rather than guessed at (Anir,
  // Aug 15: "if I enter 10m, it should know it's 10 million... you can either
  // do that or just straight up let people only type in a number"). It is a
  // parser, not a model: every accepted form is listed here, and anything
  // else returns null so the field can say it did not understand instead of
  // saving a number nobody typed.
  //
  //   1000 · 1,000 · $1,000 · 1.5k · 40m · 40mm · 40mn · 2b · 2bn
  //   1.5 thousand · 40 million · 2 billion
  const m = raw.match(/^(\d+(?:\.\d+)?)(k|thousand|m|mm|mn|million|b|bn|billion)?$/);
  if (!m) return null;
  const base = parseFloat(m[1]);
  if (!Number.isFinite(base)) return null;
  const suffix = m[2] ?? "";
  const mult =
    suffix === "b" || suffix === "bn" || suffix === "billion"
      ? 1e9
      : suffix === "m" || suffix === "mm" || suffix === "mn" || suffix === "million"
        ? 1e6
        : suffix === "k" || suffix === "thousand"
          ? 1e3
          : 1;
  return base * mult;
}

/** Every person the module already knows — for pickers and suggestions. */
export function knownPeople(state: PerformanceState, extra?: string): string[] {
  const set = new Set<string>();
  for (const g of state.groups) {
    if (g.head.trim()) set.add(g.head.trim());
    for (const m of g.members) if (m.trim()) set.add(m.trim());
  }
  for (const goal of state.goals) {
    for (const s of goal.subgoals) {
      for (const o of s.owners) if (o.trim()) set.add(o.trim());
      for (const p of s.people) if (p.name.trim()) set.add(p.name.trim());
    }
    for (const a of goal.assignments ?? []) {
      if (a.person.trim()) set.add(a.person.trim());
    }
  }
  if (extra?.trim()) set.add(extra.trim());
  return [...set].sort((a, b) => a.localeCompare(b));
}


/**
 * WHICH GROUP COUNTS A PERSON, PER GOAL.
 *
 * Anir, Aug 16: "He can be in two groups, but the goals have to be different,
 * not the same goal. Two groups cannot have same person within same goal."
 *
 * A person may belong to several groups, but on any ONE goal their results
 * count through exactly one of them — otherwise the same money appears under
 * every group they are in and the rows stop adding up to the organization
 * (his $250K read as $500K).
 *
 * Precedence: the goal's own group assignments first, in the order they were
 * made (respecting each assignment's excludedPeople); then the remaining
 * workspace groups in creation order, so the map is total and deterministic
 * even for goals nobody has formally assigned to a group.
 */
export function goalGroupAttribution(
  state: Pick<PerformanceState, "groups">,
  goal: Pick<PrimaryGoal, "groupAssignments">
): Map<string, string> {
  const map = new Map<string, string>();
  /**
   * MEMBERS ONLY — the head is not implicitly one (Suren, Aug 16: "the group
   * owner doesn't have to carry a target. Only the member is carrying the
   * target... but they can put themselves as a member"). An owner who wants
   * their own numbers in the group joins its roster like anyone else; owning
   * it only grants running it. Verification and visibility still come from
   * being head — this is about counting.
   */
  const claim = (g: PerfGroup, excluded?: string[]) => {
    const ex = new Set((excluded ?? []).map((n) => n.trim().toLowerCase()));
    for (const n of new Set(g.members.map((m) => m.trim()).filter(Boolean))) {
      const key = n.toLowerCase();
      if (ex.has(key)) continue;
      if (!map.has(key)) map.set(key, g.id);
    }
  };
  for (const a of goal.groupAssignments ?? []) {
    const g = state.groups.find((x) => x.id === a.groupId);
    if (g) claim(g, a.excludedPeople);
  }
  for (const g of state.groups) claim(g);
  return map;
}

/** The members of one group that THIS goal counts through it. */
export function attributedMembers(
  state: Pick<PerformanceState, "groups">,
  goal: Pick<PrimaryGoal, "groupAssignments">,
  group: PerfGroup
): string[] {
  const attribution = goalGroupAttribution(state, goal);
  return [...new Set(group.members.map((m) => m.trim()).filter(Boolean))].filter(
    (n) => attribution.get(n.toLowerCase()) === group.id
  );
}

/* ------------------------------------------------------- who sees whom */

/**
 * WHOSE PERFORMANCE YOU MAY OPEN (Anir, Aug 16: asked whether viewing somebody
 * else's data was admin-only, was told no, and answered "Restrict").
 *
 * Until now the People tab listed every name in the workspace to everyone, so
 * any rep could read any colleague's targets and results. Acting on a claim
 * was always gated — verify, unlock and send back need you to own a group that
 * person is in — but reading was not gated at all.
 *
 * - admin: everybody.
 * - anyone else: yourself, plus everyone in the groups you head.
 *
 * This is the ONLY list the picker offers and the only list a `?person=` link
 * is checked against, so both ways in close together.
 */
export function visiblePeople(
  state: PerformanceState,
  me: string,
  role?: string
): string[] {
  if ((role ?? "").trim().toLowerCase() === "admin") {
    return knownPeople(state, me);
  }
  const set = new Set<string>();
  if (me.trim()) set.add(me.trim());
  for (const g of headedGroups(state, me)) {
    if (g.head.trim()) set.add(g.head.trim());
    for (const m of g.members) if (m.trim()) set.add(m.trim());
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** Groups this person heads. */
export function headedGroups(
  state: Pick<PerformanceState, "groups">,
  me: string
): PerfGroup[] {
  const name = me.trim().toLowerCase();
  return state.groups.filter((g) => g.head.trim().toLowerCase() === name);
}

/**
 * The names a signed-in person may see numbers for (Suren, Aug 12: "Rukmini
 * is a user group owner for one group — she should not have access to other
 * groups"). Managers and admins see everyone; a group head sees themself and
 * their members; everyone else sees only themself.
 */
export function visibleNamesFor(
  state: Pick<PerformanceState, "groups">,
  me: string
): Set<string> {
  const names = new Set<string>([me.trim()]);
  for (const g of headedGroups(state, me)) {
    if (g.head.trim()) names.add(g.head.trim());
    for (const m of g.members) if (m.trim()) names.add(m.trim());
  }
  return names;
}

/** One row per goal this person carries — direct assignments plus every
 *  subgoal they are on — with the target that applies to THEM. */
export type PersonGoalRow = {
  goal: PrimaryGoal;
  /** Null for a direct assignment; the subgoal when they sit on one. */
  subgoal: Subgoal | null;
  target: number;
  verified: boolean;
};

export function personGoalRows(
  state: PerformanceState,
  person: string
): PersonGoalRow[] {
  const name = person.trim().toLowerCase();
  const rows: PersonGoalRow[] = [];
  for (const goal of state.goals) {
    for (const a of goal.assignments ?? []) {
      if (a.person.trim().toLowerCase() === name) {
        rows.push({ goal, subgoal: null, target: a.target, verified: a.verified });
      }
    }
    for (const sub of goal.subgoals) {
      for (const p of sub.people) {
        if (p.name.trim().toLowerCase() === name) {
          rows.push({ goal, subgoal: sub, target: p.target, verified: p.verified });
        }
      }
    }
  }
  return rows;
}

/* ----------------------------------------------- composites and verification */

/** Actuals belonging to a goal, INCLUDING its components when composite. */
export function goalFamilyActuals(
  state: Pick<PerformanceState, "actuals">,
  goal: Pick<PrimaryGoal, "id" | "componentGoalIds">
): PerfActual[] {
  const ids = new Set([goal.id, ...(goal.componentGoalIds ?? [])]);
  return state.actuals.filter((a) => ids.has(a.goalId));
}

export type ValueFilter = {
  person?: string;
  people?: Set<string>;
  /** [startMs, endMs) window; omit for all time. */
  range?: [number, number];
  /** Count only verified entries (the number that rolls up). */
  verifiedOnly?: boolean;
  /** Count only waiting entries (the pending amount). */
  reportedOnly?: boolean;
  /** Count only claims a group owner has REFUSED — the red slice of pending. */
  sentBackOnly?: boolean;
  componentGoalId?: string;
};

/**
 * THE rollup. Composite goals sum their components; every level (week, month,
 * quarter, half, year, group, person) is this one function with a different
 * filter. Verified is what counts; reported is shown as pending.
 */
export function familyValue(
  state: Pick<PerformanceState, "actuals"> & Partial<Pick<PerformanceState, "rates">>,
  goal: Pick<PrimaryGoal, "id" | "componentGoalIds" | "measure" | "currency">,
  filter: ValueFilter = {}
): number {
  /**
   * A RATIO IS NEVER A SUM (found in mock, Aug 20: Win/Loss Ratio read "713%
   * met", and its drill would have added up every monthly win rate into a
   * bar).
   *
   * `measure: "level"` means the goal reports its latest reading — a win rate,
   * an average deal size. actualValue has always known that; this function did
   * not, so every rail, every period bar and every verdict built on it summed
   * percentages. Whatever the filter selects, a level goal answers with the
   * LAST of them, not the total.
   */
  const level = goal.measure === "level";
  let latest: PerfActual | null = null;
  let total = 0;
  for (const a of goalFamilyActuals(state, goal)) {
    if (filter.componentGoalId && a.goalId !== filter.componentGoalId) continue;
    if (filter.person && a.person !== filter.person) continue;
    if (filter.people && !filter.people.has(a.person)) continue;
    if (filter.range) {
      const t = Date.parse(a.date);
      if (Number.isNaN(t) || t < filter.range[0] || t >= filter.range[1]) continue;
    }
    const status = entryStatus(a);
    if (filter.verifiedOnly && status !== "verified") continue;
    // "Waiting" money is anything not signed off — a claim sent back is still
    // claimed, still unverified, and still has to show up in the pending total
    // rather than vanishing from both sides of the sum.
    if (filter.reportedOnly && status === "verified") continue;
    if (filter.sentBackOnly && status !== "sent_back") continue;
    if (level) {
      if (
        !latest ||
        Date.parse(a.date) > Date.parse(latest.date) ||
        (a.date === latest.date && a.addedAt > latest.addedAt)
      ) {
        latest = a;
      }
      continue;
    }
    total += inGoalCurrency(a, goal.currency, state.rates);
  }
  return level ? (latest?.amount ?? 0) : total;
}

/**
 * THE VERIFIED FIGURE A VERDICT IS JUDGED ON.
 *
 * Not simply familyValue(verifiedOnly): a RATIO goal (win rate, average deal
 * size) reports its latest reading, never a running total, and summing them is
 * meaningless. Judging Win/Loss Ratio on the sum of every verified entry
 * printed "713% met" over a goal whose own caption read "44% of 45%" (found in
 * mock, Aug 20). Same rule actualValue has always followed for `measure:
 * "level"`, applied to the verified half — a total sums, a level is the last
 * word on it.
 */
export function verifiedValue(
  state: Pick<PerformanceState, "actuals"> & Partial<Pick<PerformanceState, "rates">>,
  goal: Pick<PrimaryGoal, "id" | "componentGoalIds" | "measure" | "currency">
): number {
  /* familyValue handles the ratio rule itself now; this name stays because
     "the verified figure a verdict is judged on" is worth saying out loud at
     every call site. */
  return familyValue(state, goal, { verifiedOnly: true });
}

/**
 * WHO SET THIS GOAL, WHEN THAT IS A PERSON.
 *
 * The goals that came off Suren's sheet carry provenance strings, not names —
 * "Suren's goal sheet", "Suren (Aug 12 spec)", "Sample data". Printing those
 * under a goal read as a person who does not exist, and said nothing useful
 * about a goal that has simply always been there (Anir, Aug 20: "all of the
 * default ones that were there before, you can just leave them as is. You
 * don't have to say that they were made by anyone... the new ones, you just
 * say 'set by whoever', and then you put the profile picture").
 *
 * Null means "this is one of the defaults" — say nothing.
 */
/**
 * WHEN A GOAL WAS SET, in the plainest words (Anir, Aug 23: "it would be
 * helpful to see when and who created the goal").
 *
 * The name alone answered half the question — the Org row has said "set by
 * Anir Suren" since Aug 19, but never when, so an old target and one set this
 * morning read identically. Month name spelled out for the same reason every
 * date field in the app spells it: 08/09 is two different days depending on
 * which office is reading it.
 */
/**
 * A MOMENT, NOT A DAY (Anir, Aug 23: "wherever I say the date, I want to know
 * the time too — look at the entire app").
 *
 * "August 23, 2026" is where a record STARTED to be true; two deals created
 * eight hours apart read identically, and on the day something happened the
 * date alone cannot tell you whether it was before or after the call you are
 * about to walk into. Stamped values — created, logged, verified, sent back —
 * carry the clock. Chosen values that are genuinely a day and nothing more —
 * an est. sign date, a milestone due date — deliberately do not: there is no
 * time to tell, and inventing midnight would be a fact nobody entered.
 */
export function stampedAt(iso?: string | null): string | null {
  const raw = (iso ?? "").trim();
  if (!raw) return null;
  const t = new Date(raw);
  if (Number.isNaN(t.getTime())) return null;
  const day = t.toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  /* Only a date came in — a bare yyyy-mm-dd carries no clock, so saying one
     would be inventing it. */
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return day;
  const time = t.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${day} at ${time}`;
}

export function goalCreatedOn(createdAt?: string): string | null {
  return stampedAt(createdAt);
}

/**
 * WHEN A RESULT HAPPENED, AND WHEN IT WAS PUT IN (Anir, Aug 23: "like I said
 * bro, everywhere I have the date I need the fucking time too").
 *
 * A logged result carries two different moments and only one of them has a
 * clock. `date` is the day the money landed — a day the person picked, with
 * no time in it, so inventing one would be putting a fact on the record that
 * nobody entered. `addedAt` is when they typed it, and that is stamped to the
 * minute. Rows printed the bare "2026-08-19" and neither read as English nor
 * said when anything was actually done.
 *
 * So: the day it happened, spelled out, plus the clock from the moment it was
 * entered — "August 19, 2026 · logged 5:48 PM". Where there is no entry stamp
 * the day stands alone rather than borrowing a time from somewhere else.
 */
export function resultWhen(entry: {
  date?: string;
  addedAt?: string;
}): string {
  const day = stampedAt(entry.date) ?? entry.date ?? "";
  const stamped = entry.addedAt ? new Date(entry.addedAt) : null;
  if (!stamped || Number.isNaN(stamped.getTime())) return day;
  const time = stamped.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${day} · logged ${time}`;
}

export function goalAuthor(createdBy?: string): string | null {
  const name = (createdBy ?? "").trim();
  if (!name) return null;
  /* A bracketed note or a possessive document is a source, not a colleague. */
  if (/\(|\)|'s |’s |^sample data$/i.test(name)) return null;
  if (/sheet|spec|import|seed|sample|system/i.test(name)) return null;
  return name;
}

/** Entries a given person is allowed to verify: they head a group the entry's
 *  person belongs to (Suren, Aug 13: "whoever has been identified as a group
 *  owner is the only person who can verify it"). */
/**
 * THE COLOUR OF A CLAIM'S STATUS, from the one place it is defined.
 *
 * Every performance surface used to retype these as hex, which is how the same
 * sent-back money ended up red on the chart and pale blue in the panel below it
 * (Anir, Aug 20). The tokens live in globals.css; this is the only mapping from
 * status to token, so nothing downstream has to remember which red.
 */
export const ENTRY_COLOR: Record<EntryStatus, string> = {
  verified: "var(--entry-verified)",
  sent_back: "var(--entry-sent-back)",
  reported: "var(--entry-waiting)",
};

/** The darker ink of the same three, for text and pills on a tinted ground. */
export const ENTRY_INK: Record<EntryStatus, string> = {
  verified: "var(--entry-verified-ink)",
  sent_back: "var(--entry-sent-back-ink)",
  reported: "var(--entry-waiting)",
};

export function entryColor(entry: Pick<PerfActual, "status">): string {
  return ENTRY_COLOR[entryStatus(entry)];
}

export function canVerifyEntry(
  state: Pick<PerformanceState, "groups">,
  me: string,
  entryPerson: string
): boolean {
  const mine = headedGroups(state, me);
  const who = entryPerson.trim().toLowerCase();
  return mine.some(
    (g) =>
      g.head.trim().toLowerCase() === who ||
      g.members.some((m) => m.trim().toLowerCase() === who)
  );
}

/** The queue a group owner sees: reported entries from their people. */
export function verificationQueue(
  state: Pick<PerformanceState, "groups" | "actuals">,
  me: string
): PerfActual[] {
  return state.actuals
    .filter(
      (a) =>
        // Exactly "reported": a claim you sent back is waiting on the person,
        // not on you, so it is out of this queue until they answer it. The
        // queue means one thing — these are waiting on me.
        entryStatus(a) === "reported" && canVerifyEntry(state, me, a.person)
    )
    .sort((a, b) => (a.addedAt < b.addedAt ? 1 : -1));
}

/** Sent back and not yet answered — the ball is with the person who claimed
 *  it. Changing anything moves it back to `reported`, waiting on the owner. */
export function awaitingTheirFix(entry: Pick<PerfActual, "status">): boolean {
  return entryStatus(entry) === "sent_back";
}

/* -------------------------------------------------- fiscal calendar (Apr–Mar) */

/** Freyr's financial year runs April to March (Suren, Aug 13). fy 2026 means
 *  FY 2026–27: Apr 1 2026 up to Apr 1 2027. */
export const FY_START_MONTH = 3; // April, 0-indexed

export function fiscalYearOf(dateIso: string, now = new Date()): number {
  const t = Number.isNaN(Date.parse(dateIso)) ? now : new Date(dateIso);
  return t.getMonth() >= FY_START_MONTH ? t.getFullYear() : t.getFullYear() - 1;
}

export function currentFiscalYear(now = new Date()): number {
  return now.getMonth() >= FY_START_MONTH ? now.getFullYear() : now.getFullYear() - 1;
}

export function fiscalLabel(fy: number): string {
  return `FY ${fy}, ${String(fy + 1).slice(2)}`;
}

export type FiscalLevel = "year" | "half" | "quarter" | "month" | "week";

/** [startMs, endMs) for a fiscal slice. index: half 0–1, quarter 0–3,
 *  month 0–11 counted from April. */
export function fiscalRange(
  fy: number,
  level: Exclude<FiscalLevel, "week"> = "year",
  index = 0
): [number, number] {
  const start = (monthsFromApril: number) =>
    new Date(fy, FY_START_MONTH + monthsFromApril, 1).getTime();
  if (level === "year") return [start(0), start(12)];
  if (level === "half") return [start(index * 6), start(index * 6 + 6)];
  if (level === "quarter") return [start(index * 3), start(index * 3 + 3)];
  return [start(index), start(index + 1)];
}

/** Monday-based weeks overlapping a fiscal month, clipped to the month. */
export function fiscalWeeks(
  fy: number,
  monthIndex: number
): { label: string; range: [number, number] }[] {
  const [monthStart, monthEnd] = fiscalRange(fy, "month", monthIndex);
  const out: { label: string; range: [number, number] }[] = [];
  const cursor = new Date(monthStart);
  cursor.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7));
  while (cursor.getTime() < monthEnd) {
    const weekStart = cursor.getTime();
    const weekEndDate = new Date(cursor);
    weekEndDate.setDate(weekEndDate.getDate() + 7);
    const weekEnd = weekEndDate.getTime();
    const from = new Date(Math.max(weekStart, monthStart));
    const to = new Date(Math.min(weekEnd, monthEnd) - 1);
    const fmt = (d: Date) =>
      d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    out.push({
      label: `Week ${fmt(from)}. ${fmt(to)}`,
      range: [Math.max(weekStart, monthStart), Math.min(weekEnd, monthEnd)],
    });
    cursor.setDate(cursor.getDate() + 7);
  }
  return out;
}

/** The month names of a fiscal year in order, April first. */
export function fiscalMonthLabels(fy: number): string[] {
  return Array.from({ length: 12 }, (_, i) =>
    new Date(fy, FY_START_MONTH + i, 1).toLocaleDateString("en-US", {
      month: "long",
    })
  );
}

/**
 * THE SAME SCREEN, POINTED AT FEWER PEOPLE (Suren, Aug 15: Group and People
 * performance should read exactly like Org performance).
 *
 * Rather than build two more copies of that page and let them drift, this
 * narrows the DATA and lets the Org view render it unchanged. Every number on
 * that screen is computed from `state`, so a state describing one group — its
 * goals, its people's targets, its people's logged numbers — produces the
 * group's version of the same tiles, charts and table for free.
 *
 * What changes, and why:
 * - actuals: only what these people logged, so "Actual" is theirs, not the
 *   company's.
 * - target: the sum of THEIR personal targets on that goal, not the annual
 *   org target, which nobody in a group of three is expected to carry alone.
 * - subgoal people: trimmed to the scope, so a drill-down does not expose a
 *   colleague from another group.
 * - a goal survives only if someone in scope actually carries it.
 */
export function scopeStateToPeople(
  state: PerformanceState,
  people: string[],
  /**
   * The group being looked at, when there is one. A goal handed straight to
   * this group belongs on its screen even if not one of its people has been
   * given a personal share yet, and the group's own target is the number to
   * show (Suren, via Anir on Aug 15). Absent — People performance — nothing
   * changes.
   */
  groupId?: string
): PerformanceState {
  const names = new Set(people.map((p) => p.trim().toLowerCase()));
  const mine = (n: string) => names.has(n.trim().toLowerCase());

  const goals = state.goals
    .map((goal) => {
      const assignments = (goal.assignments ?? []).filter((a) => mine(a.person));
      const subgoals = goal.subgoals
        .map((s) => ({ ...s, people: s.people.filter((p) => mine(p.name)) }))
        .filter((s) => s.people.length > 0);
      const groupAssignment = groupId
        ? (goal.groupAssignments ?? []).find((a) => a.groupId === groupId)
        : undefined;
      if (
        assignments.length === 0 &&
        subgoals.length === 0 &&
        !groupAssignment
      )
        return null;
      // Their share of it: direct assignments plus their slice of any subgoal.
      // A group target, when the department has been given one, is the number
      // for this screen instead — the people's shares are then a split of it
      // rather than a separate total.
      const peopleShare =
        assignments.reduce((sum, a) => sum + (a.target || 0), 0) +
        subgoals.reduce(
          (sum, s) => sum + s.people.reduce((n, p) => n + (p.target || 0), 0),
          0
        );
      const target =
        groupAssignment && groupAssignment.target > 0
          ? groupAssignment.target
          : peopleShare;
      const scoped: PrimaryGoal = {
        ...goal,
        assignments,
        subgoals,
        target,
        /* The schedule is the ORG's promise about the ORG's target. Scoped
           to one person the target became their share, but the milestones
           rode along untouched — so a rep carrying $300K was judged against
           "must be at $250K by September", the org's line, and read as
           behind from the day they were assigned (Aug 23 audit). A share has
           no schedule of its own; the pace verdict stays honest by saying
           nothing rather than judging against somebody else's calendar. */
        milestones: undefined,
        // Verified at this altitude means every person in scope is signed off,
        // not the leadership flag that belongs to the org row.
        verified:
          assignments.every((a) => a.verified) &&
          subgoals.every((s) => s.people.every((p) => p.verified)) &&
          assignments.length + subgoals.length > 0,
      };
      return scoped;
    })
    .filter((g): g is PrimaryGoal => g !== null);

  return {
    types: state.types,
    goals,
    groups: state.groups,
    actuals: state.actuals.filter((a) => mine(a.person)),
    /* Same as the API's scopeState (Aug 23 audit): the rates ride along, or
       Group and People count converted money as zero. */
    rates: state.rates,
  };
}
