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
};

export type PrimaryGoal = {
  id: string;
  name: string;
  /** One of the goal types from the master list (editable, not hard-coded). */
  type: string;
  unit: GoalUnit;
  measure: GoalMeasure;
  year: number;
  /** The organization target — the big number from the top. 0 = not set yet. */
  target: number;
  /** Picked for the goal plan → shows on Org performance. */
  pickedForOrg: boolean;
  verified: boolean;
  subgoals: Subgoal[];
  createdBy: string;
  createdAt: string;
};

export type PerfGroup = {
  id: string;
  name: string;
  head: string;
  members: string[];
  createdBy: string;
  createdAt: string;
};

export type PerfActual = {
  id: string;
  goalId: string;
  /** Null when the primary goal has no subgoals yet. */
  subgoalId: string | null;
  person: string;
  amount: number;
  /** ISO date (day precision) the result belongs to. */
  date: string;
  note?: string;
  addedBy: string;
  addedAt: string;
};

export type PerformanceState = {
  /** The goal-type master list. Seeded from Suren's sheet, extendable. */
  types: string[];
  goals: PrimaryGoal[];
  groups: PerfGroup[];
  actuals: PerfActual[];
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
  goal: Pick<PrimaryGoal, "id" | "measure">,
  filter: ActualFilter = {},
  period?: PeriodKey,
  now = new Date()
): number {
  let total = 0;
  let latest: PerfActual | null = null;
  for (const a of actuals) {
    if (a.goalId !== goal.id) continue;
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
export function yearElapsed(year: number, now = new Date()): number {
  const start = new Date(year, 0, 1).getTime();
  const end = new Date(year + 1, 0, 1).getTime();
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
export function fmtAmount(unit: GoalUnit, value: number): string {
  if (unit === "count") return Math.round(value).toLocaleString("en-US");
  if (unit === "percent") {
    const r = Math.round(value * 10) / 10;
    return `${Number.isInteger(r) ? r.toFixed(0) : r}%`;
  }
  const v = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (v >= 1e9) return `${sign}$${trim1(v / 1e9)}B`;
  if (v >= 1e6) return `${sign}$${trim1(v / 1e6)}M`;
  if (v >= 1e3) return `${sign}$${trim1(v / 1e3)}K`;
  return `${sign}$${Math.round(v).toLocaleString("en-US")}`;
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
  const m = raw.match(/^(\d+(?:\.\d+)?)([kmb])?$/);
  if (!m) return null;
  const base = parseFloat(m[1]);
  if (!Number.isFinite(base)) return null;
  const mult = m[2] === "b" ? 1e9 : m[2] === "m" ? 1e6 : m[2] === "k" ? 1e3 : 1;
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
  }
  if (extra?.trim()) set.add(extra.trim());
  return [...set].sort((a, b) => a.localeCompare(b));
}
