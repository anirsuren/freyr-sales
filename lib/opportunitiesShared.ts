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

/**
 * Where the deal sits in the funnel. Suren's sheet uses exactly these.
 *
 * THERE IS NO "FUTURE" ANY MORE (Suren, Sep 1: "I don't want future and
 * current pipeline. All this goes away", and again: "we don't have the concept
 * of future in any of your contracting conversations, right? No, no, just
 * pipeline. We have high confidence, go-get pipeline. ok fine take the word
 * future off").
 *
 * It was the workbook's Future Pipeline sheet: an intention with a client, an
 * offering and a target quarter, kept out of the funnel until somebody pitched
 * it. Carrying it as a fourth level meant every reader in the app had to
 * remember to exclude it from a total, and a deal could be 99% certain and
 * still be filed under a word that means "not yet". The 23 deals that were at
 * Future are Pipeline now; nothing about them changed except the word.
 *
 * WHEN THE MONEY LANDS IS STILL A REAL QUESTION and it still has a real
 * answer: the estimated sign date. It was never this field's job.
 */
export const OPPORTUNITY_LEVELS = [
  "Pipeline",
  "Go get",
  "High confidence",
] as const;
export type OpportunityLevel = (typeof OPPORTUNITY_LEVELS)[number];

/**
 * REVENUE TYPE IS NO LONGER PICKED — IT IS READ OFF THE CONFIDENCE BAR
 * (Suren, Aug 25 call).
 *
 * The problem in his words: "the meetings that we're having with Sudhir and
 * the sales team, people are not understanding that difference between go get
 * and high confidence and the confidence level percentage — so they're saying
 * if I'm saying already 80%, that's high confidence, right? So to avoid that
 * confusion can we club these two."
 *
 * And the rule, also his: "0 to 80 you can play around whatever you want to
 * play around. The moment you say 95 that I will treat it as high confidence.
 * If you say 99 it is go get. 100 is just one step there, 99 I'm there, so
 * that means it's go get." Manoj: "99 means paperwork is pending." Suren:
 * "yeah, whatever the definition of go get is, 99, I'm okay with that."
 *
 * So the person sets ONE number and the label follows. Two fields that could
 * disagree became one that cannot.
 *
 * AND NOW THE BAR IS THE WHOLE ANSWER. There used to be a `futureRevenue`
 * flag here that overrode the bar and returned "Future", on the reasoning that
 * WHEN the money lands is a different question from how likely it is: "I might
 * sign today but this revenue will come in a year and a half or two years."
 * Suren retired the word on Sep 1 ("just pipeline. We have high confidence,
 * go-get pipeline"), so the flag has nothing left to return and the parameter
 * is gone rather than accepted and ignored. When the money lands is the
 * estimated sign date's job and always was.
 */
export const CONFIDENCE_GO_GET = 99;
export const CONFIDENCE_HIGH = 95;

export function revenueTypeFromConfidence(
  confidence: number | undefined
): OpportunityLevel {
  const c = typeof confidence === "number" && Number.isFinite(confidence) ? confidence : 0;
  if (c >= CONFIDENCE_GO_GET) return "Go get";
  if (c >= CONFIDENCE_HIGH) return "High confidence";
  return "Pipeline";
}

/**
 * THE REVENUE TYPE TO SHOW FOR A DEAL THAT ALREADY EXISTS.
 *
 * Derived from the confidence whenever there IS one, so a row can never read
 * "High confidence · 25%" — which is the exact contradiction Suren asked to
 * remove: "people are not understanding that difference between go get and
 * high confidence and the confidence level percentage."
 *
 * WHEN NOBODY HAS SET A CONFIDENCE, the stored word stands. 76 of the live
 * rows came from his own workbook, where the level was a column and the
 * confidence often was not; rewriting those to "Pipeline" would be inventing
 * a verdict from an empty cell rather than reading one. A deal with no
 * confidence keeps whatever it was imported as until somebody moves the bar.
 *
 * THE FUTURE SHORT-CIRCUIT IS GONE with the level itself (Suren, Sep 1). It
 * used to return before the bar was even read, which is why a Future deal
 * could sit at 99% and still not read as Go get. Now every deal is judged the
 * one way.
 */
export function effectiveRevenueType(deal: {
  level: OpportunityLevel;
  confidence?: number;
  lines?: { confidence?: number }[];
}): OpportunityLevel {
  /* One offering per opportunity since Aug 17, so the row's own confidence is
     the deal's when it carries one. */
  const rowConfidence = (deal.lines ?? []).find(
    (l) => typeof l.confidence === "number"
  )?.confidence;
  const confidence = rowConfidence ?? deal.confidence;
  if (typeof confidence !== "number") return deal.level;
  return revenueTypeFromConfidence(confidence);
}

/** The sentence under the bar, so nobody has to remember the two numbers. */
export function revenueTypeRule(level: OpportunityLevel): string {
  if (level === "Go get") return `${CONFIDENCE_GO_GET}% and up — paperwork is the only thing left`;
  if (level === "High confidence") return `${CONFIDENCE_HIGH}% to ${CONFIDENCE_GO_GET - 1}%`;
  return `Under ${CONFIDENCE_HIGH}%`;
}

/**
 * The working status. His sheet carries these plus blanks; blank means nobody
 * has set one yet, which is why the field is nullable rather than defaulted —
 * a guessed status on a real deal is worse than no status.
 */
export const OPPORTUNITY_STATUSES = [
  "Qualify",
  /** Suren, Aug 18: "if they're doing customer demos and pilots, they're
   *  actually in a pilot mode, and then proposed mode" — so it sits between
   *  Qualify and Propose, matching the KonnectCo flow the team follows. */
  "Pilot",
  "Propose",
  "Submitted to client",
  /**
   * "CREATE CONTRACT" IS NOT A STATUS ANY MORE (Manoj's change sheet, item 7:
   * "Remove 'Create Contract' from 'Opportunity Status'").
   *
   * It was one, on Suren's Aug 25 instruction: "you can have one more status
   * here — submitted to client, and after that, create contract… so there you
   * close the thing." Manoj reverses that, and item 8 says what replaces it:
   * "Remove 'Open in Pipeline' and have 'Convert to Contract' instead." So the
   * hand-off is now an ACTION a person takes on the deal, not a place the deal
   * parks in.
   *
   * `lib/contracts.ts` and the Contracts module still work: the queue of deals
   * waiting for a contract now reads "Submitted to client with nothing
   * drafted", which is the same set of deals one status earlier.
   */
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
 * WHERE THE MONEY COMES FROM, WHICH IS NOT THE SAME AS HOW IT RECURS.
 *
 * Suren, Aug 31, reading an opportunity: "opportunity is missing one thing,
 * what type of opportunity... is it an ARR thing, it also says that new
 * business, existing business, renewal, all of that comes along."
 *
 * ARR/OTS is the SHAPE of the revenue — does it repeat or is it one shot.
 * This is its ORIGIN — is this a name we have never sold to, more work on an
 * account we already have, or the same work signed again. A renewal can be
 * ARR and so can new business, so folding them into one list would have made
 * both unanswerable.
 */
export const DEAL_TYPES = [
  "New business",
  "Existing business",
  "Renewal",
] as const;
export type DealType = (typeof DEAL_TYPES)[number];

export function normalizeDealType(raw: unknown): DealType | undefined {
  const s = String(raw ?? "").trim().toLowerCase();
  return DEAL_TYPES.find((x) => x.toLowerCase() === s);
}

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

/**
 * ONE ROW OF THE DEAL'S GOAL TABLE (Suren, Aug 18 call: "let them assign that
 * goal, and then let them assign the value for the goal, and then they may
 * say met. The moment they say met, you take this value and add it against
 * [the goal], and also put the person name… let it be manual right now").
 */
export type OpportunityGoalLink = {
  id: string;
  /** A goal from the Goal Master. */
  goalId: string;
  /** Whose credit the number is. */
  person?: string;
  /** The number that counts once met — money for currency goals. */
  value?: number;
  met?: boolean;
  /** ISO day Met was saved. */
  metAt?: string;
  /** The performance entry written when Met landed — the double-count guard,
   *  and the handle to withdraw it while it is still unverified. */
  actualId?: string;
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
  /** New business / Existing business / Renewal. Suren, Aug 31. */
  dealType?: DealType;
  value: number;
  /**
   * THE MONEY BELOW IS IN THIS CURRENCY (Suren, Sep 1: "the entire reporting
   * dashboards, everything should be in USD. It's only within the
   * opportunities where we will capture the local currency").
   *
   * `value`, `estimatedAcv` and `estimatedTcv` hold THE NUMBER THE PERSON
   * TYPED, in whatever this says. An Indian deal signed for 40,000,000 is
   * stored as 40000000 with currency INR, not as its dollar equivalent, so
   * the figure on the screen is always the figure on the contract.
   *
   * ABSENT MEANS US DOLLARS. Every deal in the book predates this field and
   * every one of them is in dollars, so an empty currency has to keep reading
   * correctly rather than becoming a question. Nothing is migrated and no
   * stored number moves.
   *
   * THE DOLLAR FIGURE IS NEVER STORED HERE. It is worked out for display from
   * the rate on the deal's sign date (lib/currency's rateFor) each time it is
   * shown. Writing it down would freeze one day's rate into the record and
   * then quietly disagree with the same sum done anywhere else.
   */
  currency?: CurrencyCode;
  /**
   * WHAT THE DEAL IS WORTH, THE TWO WAYS SUREN READS IT (his Aug 30 sheet:
   * the summary carries "# of Opportunities", "$ Estimated ACV" and
   * "$ Estimated TCV", and nothing else).
   *
   * TCV is the whole signed number; ACV is one year of it. A three-year deal
   * at 300k total is 300k TCV and 100k ACV, and which one you are looking at
   * changes every total on the page — so they are two fields, not one number
   * with a divisor guessed from a contract length nobody entered.
   *
   * BOTH ARE TYPED AND BOTH START EMPTY. Anir, Aug 30: "he'll add them, but
   * add the ability to add it, we don't have it now." Nothing derives them
   * from `value`: a deal whose ACV nobody has entered reads as blank
   * everywhere, never as $0, because a zero is a claim that the deal is
   * worth nothing and an empty cell is the truth (it has not been said yet).
   *
   * `value` is untouched and still drives goals, weighting and contracts.
   */
  estimatedAcv?: number;
  estimatedTcv?: number;
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
  /** The goal table rows. When present, `goalIds` is derived from them so the
   *  pacing line keeps reading the same field it always has. */
  goalLinks?: OpportunityGoalLink[];
  /**
   * SALES ACTIVITIES ON THE DEAL (Suren, Aug 17 answers: "you should have an
   * activity at the opportunity level… the data entry should be in the
   * opportunity page"). Each one wears the master's vocabulary; its status
   * against the master's counts-from threshold is what offers the goal count.
   */
  activities?: OpportunityActivity[];
  /** When the first pitch is planned (ISO day) and the sheet's target quarter,
   *  e.g. "Q2" or "2027". Came in with the workbook's Future Pipeline sheet
   *  and stays now that the Future level is gone: the 23 deals that carried
   *  these are still the deals nobody has pitched yet, and throwing the dates
   *  away to tidy up after a renamed field would lose something real. */
  targetPitchDate?: string;
  targetQuarter?: string;
  createdAt: string;
  updatedAt: string;
};

export type OpportunitiesState = { opportunities: Opportunity[] };

export const EMPTY_OPPORTUNITIES: OpportunitiesState = { opportunities: [] };

export function normalizeLevel(raw: unknown): OpportunityLevel {
  const s = String(raw ?? "").trim().toLowerCase();
  /**
   * "FUTURE" IS STILL A WORD THAT ARRIVES HERE, AND IT MUST NOT BLANK A DEAL.
   *
   * The level was retired on Sep 1 and the 23 live records were moved to
   * Pipeline, but the word outlives the field: Suren's workbook has a Future
   * Pipeline sheet, an Excel re-import would carry it, and so would any
   * backup taken before today. Named rather than left to the fallback below,
   * because the fallback is a catch-all for junk and this is a known value
   * with a known answer — if somebody ever tightens that fallback into a
   * rejection, an old import must still land on Pipeline and not on nothing.
   */
  if (s === "future") return "Pipeline";
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
  /**
   * A DECIDED DEAL IS NOT A BET (found Aug 20: GRI — Kimberly Clark, won, sat
   * in the pipeline weighted at 25% — $125K of a $500K deal that is already
   * signed. The forecast was discounting closed business by $375K and calling
   * it probability).
   *
   * Confidence answers "how likely is this to land". Once it has landed the
   * question is over: a won deal is worth all of it, a lost one is worth
   * nothing, and the stale percentage somebody typed while it was still open
   * has no say. Everything still in flight is weighted exactly as before.
   */
  if (o.status === "Won") return opportunityValue(o);
  if (o.status === "Lost") return 0;
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


/**
 * THE TWO SUMMARY NUMBERS, OR NOTHING.
 *
 * Undefined is a real answer here and must survive all the way to the screen:
 * "nobody has said yet" and "worth zero" are different facts, and only one of
 * them is true of a deal Suren has not got to. Callers sum with `?? 0` but
 * must count how many were present before they show a total (see
 * `sumEstimates`).
 */
export function estimatedAcvOf(deal: Pick<Opportunity, "estimatedAcv">): number | undefined {
  const n = deal.estimatedAcv;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

/**
 * THE DEAL'S VALUE IS ITS TCV (Anir, Aug 30: "that value existed for all the
 * things... this value is TCV, that's all").
 *
 * It always was — the column this app imported from Suren's sheet is called
 * total contract value, and every one of the 79 live deals carries one. Asking
 * anybody to retype it into a second box was asking them to copy a number
 * across the same screen, and until they did, a summary standing on 79 real
 * deals read "nobody has entered one yet".
 *
 * So TCV falls back to the value, and the typed field stays as an override for
 * a deal whose contract total genuinely differs from what the pipeline carries.
 * ACV has no such source and is typed or absent, which is the honest state:
 * nothing in the record says how many years a deal runs.
 */
export function estimatedTcvOf(
  deal: Pick<Opportunity, "estimatedTcv" | "value" | "lines">
): number | undefined {
  const typed = deal.estimatedTcv;
  if (typeof typed === "number" && Number.isFinite(typed)) return typed;
  const fromValue = opportunityValue(deal as Opportunity);
  return Number.isFinite(fromValue) && fromValue > 0 ? fromValue : undefined;
}

/** Which of the two a view is showing. One at a time — Suren, Aug 30: "he can
 *  only select one, either ACV or TC." */
export type EstimateMeasure = "acv" | "tcv";

export function estimateOf(
  deal: Pick<Opportunity, "estimatedAcv" | "estimatedTcv" | "value" | "lines">,
  measure: EstimateMeasure
): number | undefined {
  return measure === "acv" ? estimatedAcvOf(deal) : estimatedTcvOf(deal);
}

/**
 * A TOTAL THAT KNOWS WHAT IT IS MISSING.
 *
 * Returns the sum AND how many deals actually carried the number, so a tile
 * can say "across 4 of 79" rather than presenting the sum of four deals as
 * though it were the pipeline. Until Suren fills these in, most of the book
 * has neither, and a confident-looking total over three entered deals is the
 * kind of number that gets repeated in a meeting.
 */
export function sumEstimates(
  deals: Pick<Opportunity, "estimatedAcv" | "estimatedTcv" | "value" | "lines">[],
  measure: EstimateMeasure
): { total: number; entered: number; of: number } {
  let total = 0;
  let entered = 0;
  for (const d of deals) {
    const n = estimateOf(d, measure);
    if (n === undefined) continue;
    total += n;
    entered += 1;
  }
  return { total, entered, of: deals.length };
}

/**
 * WHEN THIS DEAL IS EXPECTED TO SIGN, wherever it happens to be stored.
 *
 * The form writes the date onto the OFFERING ROW; the sheet import wrote it
 * onto the DEAL. Both are real records and both are current, so anything that
 * buckets deals by time has to read both — the summary's period columns read
 * only the deal-level field and every opportunity created inside the app fell
 * out of them, counted in Total and shown under no quarter (found in the
 * browser, Aug 30, by creating one).
 *
 * The row wins when it has one, matching what `effectiveRevenueType` and the
 * confidence readers already do: one offering per opportunity since Aug 17, so
 * the row is the deal.
 */
export function signDateOf(deal: {
  estSignDate?: string;
  lines?: { estSignDate?: string }[];
}): string | undefined {
  const fromRow = (deal.lines ?? []).find((l) => l.estSignDate)?.estSignDate;
  return fromRow ?? deal.estSignDate;
}

/**
 * A COLOUR PER STATUS, IN ONE PLACE (Anir, Sep 3: "where you say 'under
 * review' at the top or whatever else it could be, I think you should have
 * colours for that" and "under review being blue doesn't make any sense").
 *
 * The deal screen painted EVERY status the same blue, so the chip carried a
 * colour that said nothing and actively misled: blue is the app's "in
 * progress" hue, and Lost wore it too. A map already existed inside the
 * offerings module; it lives here now so every screen answers the same way.
 *
 * The reserved colours keep their meanings — green is Won, red is Lost, grey
 * is a deal that has stopped — and nothing else may borrow them. The rest run
 * cool-to-warm along the lifecycle so a column of chips reads as progress.
 */
export const OPPORTUNITY_STATUS_COLOR: Record<string, string> = {
  Qualify: "#0891B2",
  Pilot: "#5E5CE6",
  Propose: "#0071E3",
  "Submitted to client": "#7C3AED",
  "Under review": "#B4318F",
  "On hold": "#8E98A8",
  Won: "#16A34A",
  Lost: "#DC2626",
};

/** The colour for a status, or a neutral for anything unrecognised. */
export function statusColor(status: string | null | undefined): string {
  return OPPORTUNITY_STATUS_COLOR[String(status ?? "")] ?? "#8E98A8";
}
