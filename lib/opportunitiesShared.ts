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

/** Value weighted by confidence — the "probability-adjusted" number. */
export function weightedValue(o: Opportunity): number {
  return o.confidence === undefined ? 0 : (o.value * o.confidence) / 100;
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
