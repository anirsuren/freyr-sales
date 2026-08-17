import type { CurrencyCode } from "./currency";

/**
 * OPPORTUNITIES — the deal line items behind a number.
 *
 * Suren, Aug 16: "we need to have a module called opportunity… every
 * opportunity should have an opportunity id, opportunity name… that opportunity
 * should be connected to a customer, we already have offerings, that means for
 * every opportunity there could be multiple offerings… that opportunity can
 * have a value, there is a status, there is a confidence level."
 *
 * And the reason it exists at all: "Ananth has achieved 500K, but that 500K
 * came from what opportunities, what leads — we need to know." A goal number is
 * only trustworthy if you can open it and see the deals it is made of.
 *
 * The field list is his own pipeline sheet (GRI GRR Pipeline and Target list,
 * "Current Pipeline"), not an invention: level, client, offering, ARR/OTS,
 * estimated sign date, total contract value, status, confidence %, next steps,
 * opportunity id.
 *
 * Client-safe: types and pure helpers only, no storage. Same split as
 * performanceShared.
 */

/** Where the deal sits in the funnel. Suren's sheet uses exactly these. */
export const OPPORTUNITY_LEVELS = [
  "Pipeline",
  "Go get",
  "High confidence",
  /** Nobody has pitched yet — an intention with a client, an offering and a
   *  target quarter (the workbook's Future Pipeline sheet). The deal starts
   *  when someone flips this to Pipeline and fills in the money. */
  "Future",
] as const;
export type OpportunityLevel = (typeof OPPORTUNITY_LEVELS)[number];

/**
 * The working status. His sheet carries these plus blanks; blank means nobody
 * has set one yet, which is why the field is nullable rather than defaulted —
 * a guessed status on a real deal is worse than no status.
 */
export const OPPORTUNITY_STATUSES = [
  "Qualify",
  "Propose",
  "Submitted to client",
  "Under review",
  "On hold",
  "Won",
  "Lost",
] as const;
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

/** Recurring licence revenue, or one-time services. */
export const REVENUE_TYPES = ["ARR", "OTS"] as const;
export type RevenueType = (typeof REVENUE_TYPES)[number];

/**
 * ONE OFFERING INSIDE AN OPPORTUNITY.
 *
 * Suren, Aug 16: "for one opportunity, that could be multiple offerings…
 * offering 1, offering 2, offering 3, there'll be multiple records… under
 * opportunity, offering 1 value, offering 2 value, offering 3 value, all the
 * values together will become the total opportunity value."
 *
 * And each row carries its own working state, not just a number: "within that
 * opportunity, this offering has a better status and confidence level, more.
 * For each offering, you can set all these."
 *
 * His own sheet is already shaped this way — every row is one client, one
 * offering, one value, its own status, confidence and sign date. What it never
 * had was a column saying which rows belonged to the same deal.
 */
export type OpportunityLine = {
  id: string;
  /** From the catalogue when it is in there. */
  offeringId?: string;
  /** Free text for an offering that is not in the catalogue yet. */
  offeringLabel?: string;
  revenueType?: RevenueType;
  /** ALWAYS USD — totals, weighting and goals run on this number only
   *  (Suren, Aug 17: "every connection is only in USD"). */
  value: number;
  /** What the client actually pays, in their own money (Suren: "an Indian
   *  company will not pay in USD — people should be able to feed the Indian
   *  currency and the USD currency also"). Display-side, never summed. */
  localValue?: number;
  localCurrency?: CurrencyCode;
  status?: OpportunityStatus;
  /** 0-100. */
  confidence?: number;
  /** ISO day. */
  estSignDate?: string;
  nextSteps?: string;
};

export type OpportunityActivity = {
  id: string;
  /** Master activity id — lead, pilot, contract, or a custom one. */
  activity: string;
  status: "initiated" | "under_progress" | "completed";
  /** Whose activity this is — the credited person. */
  person: string;
  note?: string;
  /** ISO day it was logged/updated. */
  date: string;
  /** Suren, Aug 17 call: "give the status, and state the start date and end
   *  date for that particular activity." ISO days. */
  startDate?: string;
  endDate?: string;
};

export type Opportunity = {
  id: string;
  /** Freyr's own reference, e.g. DO_0026765. Optional: most rows lack one. */
  externalId?: string;
  name: string;
  /** The account. Name is stored too so a deleted account cannot blank it. */
  customerId?: string;
  customer: string;
  /** MANY offerings per opportunity (Suren: "there could be multiple
   *  offerings… you should be able to connect multiple offerings"). */
  offeringIds: string[];
  /** Free-text offerings that are not in the catalogue yet, kept verbatim so
   *  importing his sheet never silently drops what it said. */
  offeringLabels: string[];
  /**
   * The offering rows. When there are any they are the source of truth for the
   * money: `value` is their sum and is never typed by hand (Anir, Aug 16:
   * "opportunity value is the total value, but then each offering has its own
   * opportunity value"). An opportunity with no rows keeps working exactly as
   * it did, with a single typed value.
   */
  lines?: OpportunityLine[];
  level: OpportunityLevel;
  status?: OpportunityStatus;
  revenueType?: RevenueType;
  value: number;
  currency?: CurrencyCode;
  /** 0-100. */
  confidence?: number;
  /** ISO day. */
  estSignDate?: string;
  owner?: string;
  nextSteps?: string;
  /**
   * Which goals this deal is expected to feed.
   *
   * Without it, "must be at" can only straight-line a target across twelve
   * months, which flags a goal red for being exactly on plan when its deals
   * are not due until November (Anir, Aug 16: "it doesn't make any sense").
   * With it, the pacing line becomes the deals that were supposed to have
   * signed by today.
   */
  goalIds?: string[];
  /**
   * SALES ACTIVITIES ON THE DEAL (Suren, Aug 17 answers: "you should have an
   * activity at the opportunity level… the data entry should be in the
   * opportunity page"). Each one wears the master's vocabulary; its status
   * against the master's counts-from threshold is what offers the goal count.
   */
  activities?: OpportunityActivity[];
  /** Future-level deals only: when the first pitch is planned (ISO day) and
   *  the sheet's target quarter, e.g. "Q2" or "2027". */
  targetPitchDate?: string;
  targetQuarter?: string;
  createdAt: string;
  updatedAt: string;
};

export type OpportunitiesState = { opportunities: Opportunity[] };

export const EMPTY_OPPORTUNITIES: OpportunitiesState = { opportunities: [] };

export function normalizeLevel(raw: unknown): OpportunityLevel {
  const s = String(raw ?? "").trim().toLowerCase();
  const hit = OPPORTUNITY_LEVELS.find((l) => l.toLowerCase() === s);
  return hit ?? "Pipeline";
}

export function normalizeStatus(raw: unknown): OpportunityStatus | undefined {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return undefined;
  // The sheet carries "Submited to client" with one t.
  if (s.startsWith("submit")) return "Submitted to client";
  return OPPORTUNITY_STATUSES.find((x) => x.toLowerCase() === s);
}

export function normalizeRevenueType(raw: unknown): RevenueType | undefined {
  const s = String(raw ?? "").trim().toUpperCase();
  return REVENUE_TYPES.find((x) => x === s);
}

/**
 * Confidence as a percent. His sheet stores 0.25 meaning 25%, and a hand-typed
 * value will be 25 meaning the same thing — so anything at or under 1 is read
 * as a fraction. 1 itself is ambiguous and reads as 100%, which is the safer
 * of the two: a deal marked certain should not display as 1%.
 */
export function normalizeConfidence(raw: unknown): number | undefined {
  if (raw === null || raw === undefined || raw === "") return undefined;
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(/[%\s]/g, ""));
  if (!Number.isFinite(n) || n < 0) return undefined;
  const pct = n <= 1 ? n * 100 : n;
  return Math.min(100, Math.round(pct));
}

/** The offering rows, always an array so callers never guard for undefined. */
export function lines(o: Opportunity): OpportunityLine[] {
  return o.lines ?? [];
}

/**
 * THE TOTAL IS THE SUM OF THE ROWS. No override: Anir was asked whether a
 * discounted bundle should be able to disagree with its parts and the answer
 * was that nobody ever discounts a bundle here, so the sum is simply the
 * number. An opportunity with no rows keeps its own typed value.
 */
export function opportunityValue(o: Opportunity): number {
  const l = lines(o);
  return l.length ? l.reduce((sum, x) => sum + (x.value || 0), 0) : o.value;
}

/** What one row is worth once its own confidence is applied. */
export function lineWeighted(line: OpportunityLine): number {
  return line.confidence === undefined ? 0 : (line.value * line.confidence) / 100;
}

/**
 * Value weighted by confidence — the "probability-adjusted" number.
 *
 * With rows it is the sum of each row weighted by ITS OWN confidence, because
 * that is the point of per-row confidence: a $500K row at 90% and a $100K row
 * at 10% is not the same bet as $600K at some blended number.
 */
export function weightedValue(o: Opportunity): number {
  const l = lines(o);
  if (l.length) return l.reduce((sum, x) => sum + lineWeighted(x), 0);
  return o.confidence === undefined ? 0 : (o.value * o.confidence) / 100;
}

/**
 * The confidence to SHOW on a parent with rows: what the weighted total is as
 * a share of the total. Derived rather than typed, so the number on the row
 * can never contradict the rows underneath it. Undefined when no row has a
 * confidence at all, which reads as "nobody has said yet".
 */
export function opportunityConfidence(o: Opportunity): number | undefined {
  const l = lines(o);
  if (!l.length) return o.confidence;
  if (!l.some((x) => x.confidence !== undefined)) return undefined;
  const total = opportunityValue(o);
  if (total <= 0) return undefined;
  return Math.round((weightedValue(o) / total) * 100);
}

/**
 * THE SHEET'S SHORTHAND, RESOLVED TO REAL OFFERINGS.
 *
 * Suren's pipeline writes "GRI", "RTQ", "Agent-VIA" — how the team says them,
 * not what the catalogue calls them. Left as free text those rows are strings
 * that happen to look like offerings: no colour, no icon, no link back to the
 * offering they are actually selling, which defeats the whole "offering →
 * opportunity → activity" chain this module exists to close.
 *
 * Only unambiguous ones are mapped. "Customized solution- Standards IA (TBD)"
 * says TBD on its face and stays free text rather than being filed under a
 * guess.
 */
const OFFERING_ALIASES: Record<string, string> = {
  gri: "regulatory intelligence services",
  "ri report": "regulatory intelligence services",
  "dashboards (market, competitive intel)": "regulatory intelligence services",
  rtq: "freya.rtq",
  "agent-via": "agent.via",
  "ai agents": "freya.agents",
};

/** The catalogue offering a sheet label means, or nothing when it is a guess. */
export function resolveOfferingLabel(
  label: string,
  catalogue: { id: string; name: string }[]
): string | undefined {
  const raw = label.trim().toLowerCase();
  if (!raw) return undefined;
  const target = OFFERING_ALIASES[raw] ?? raw;
  return catalogue.find((o) => o.name.trim().toLowerCase() === target)?.id;
}

/** What to call a row in a list: its catalogue name, or what was typed. */
export function lineLabel(
  line: OpportunityLine,
  offeringName: (id: string) => string | undefined
): string {
  const named = line.offeringId ? offeringName(line.offeringId) : undefined;
  return named || line.offeringLabel || "Untitled offering";
}

/** Every offering this opportunity touches, catalogue ids and free text alike. */
export function offeringCount(o: Opportunity): number {
  return o.offeringIds.length + o.offeringLabels.length;
}

/** ISO day inside [start, end). Same contract as the performance ranges. */
export function inDayRange(day: string | undefined, range: [number, number]): boolean {
  if (!day) return false;
  const t = Date.parse(day);
  return !Number.isNaN(t) && t >= range[0] && t < range[1];
}

/**
 * WHERE A GOAL SHOULD BE BY TODAY.
 *
 * Anir, Aug 16: "does that make any sense" — no, it did not. "Must be at" was
 * the target straight-lined across twelve months, so a goal whose deals are
 * all dated November read as lagging every day until November and then landed.
 * That made the pill meaningless: nearly everything was red in H1 and green in
 * Q4, so nobody looked at it.
 *
 * The pipeline already knows better. Every opportunity carries an estimated
 * sign date, so the honest pacing line is the deals that were SUPPOSED to have
 * signed by now — nothing else.
 *
 * Falls back to the straight line only when a goal has no dated deals behind
 * it, which is the case Suren named: "not all goals can be connected to deals
 * and opportunities, some goals may not be." A meetings-held goal has no
 * pipeline, so a calendar share is the best available reference — and the
 * basis is returned so the UI can say which one it used rather than passing
 * off a guess as a schedule.
 */
export function expectedByNow(
  goalId: string,
  target: number,
  opportunities: Opportunity[],
  elapsedFraction: number,
  now = new Date()
): { expected: number; basis: "pipeline" | "calendar"; dueCount: number } {
  const today = now.getTime();
  const mine = opportunities.filter((o) => (o.goalIds ?? []).includes(goalId));
  const dated = mine.filter((o) => {
    if (!o.estSignDate) return false;
    const t = Date.parse(o.estSignDate);
    return !Number.isNaN(t);
  });
  if (dated.length === 0) {
    return {
      expected: target * elapsedFraction,
      basis: "calendar",
      dueCount: 0,
    };
  }
  const due = dated.filter((o) => Date.parse(o.estSignDate!) <= today);
  return {
    expected: due.reduce((sum, o) => sum + o.value, 0),
    basis: "pipeline",
    dueCount: due.length,
  };
}
