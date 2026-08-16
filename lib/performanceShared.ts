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

/** A legacy entry with no status was entered by a manager and counts. */
export function entryStatus(a: Pick<PerfActual, "status">): "reported" | "verified" {
  return a.status ?? "verified";
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
  /** The proof: signed contract, SOW, opportunity summary (Suren, Aug 13:
   *  "we need evidence"). */
  evidence?: ActualEvidence[];
  /** reported = waiting for the group owner; verified = checked and LOCKED.
   *  Absent on entries from before this existed — those were entered by
   *  managers directly and count as verified. */
  status?: "reported" | "verified";
  verifiedBy?: string;
  verifiedAt?: string;
  /** Set when a group owner sends a claim back with feedback. */
  managerNote?: string;
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
export function actualValue(
  actuals: PerfActual[],
  goal: Pick<PrimaryGoal, "id" | "measure" | "componentGoalIds">,
  filter: ActualFilter = {},
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
      total += a.amount;
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

export type Pace = "met" | "ahead" | "ontrack" | "lagging" | "unset";

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
  now = new Date()
): Pace {
  if (!target || target <= 0) return "unset";
  if (actual >= target) return "met";
  const share = pctMet(actual, target) / 100;
  if (measure === "level") {
    return share >= 0.85 ? "ontrack" : "lagging";
  }
  const elapsed = yearElapsed(year, now);
  if (elapsed < 0.02) return "ontrack";
  const ratio = share / elapsed;
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
  code: CurrencyCode = BASE_CURRENCY
): string {
  if (unit === "count") return Math.round(value).toLocaleString("en-US");
  if (unit === "percent") {
    const r = Math.round(value * 10) / 10;
    return `${Number.isInteger(r) ? r.toFixed(0) : r}%`;
  }
  return fmtMoney(value, code);
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


/* ------------------------------------------------------- who sees whom */

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
  componentGoalId?: string;
};

/**
 * THE rollup. Composite goals sum their components; every level (week, month,
 * quarter, half, year, group, person) is this one function with a different
 * filter. Verified is what counts; reported is shown as pending.
 */
export function familyValue(
  state: Pick<PerformanceState, "actuals">,
  goal: Pick<PrimaryGoal, "id" | "componentGoalIds" | "measure">,
  filter: ValueFilter = {}
): number {
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
    if (filter.reportedOnly && status !== "reported") continue;
    total += a.amount;
  }
  return total;
}

/** Entries a given person is allowed to verify: they head a group the entry's
 *  person belongs to (Suren, Aug 13: "whoever has been identified as a group
 *  owner is the only person who can verify it"). */
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
      (a) => entryStatus(a) === "reported" && canVerifyEntry(state, me, a.person)
    )
    .sort((a, b) => (a.addedAt < b.addedAt ? 1 : -1));
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
  return `FY ${fy}–${String(fy + 1).slice(2)}`;
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
      label: `Week ${fmt(from)} – ${fmt(to)}`,
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
  };
}
