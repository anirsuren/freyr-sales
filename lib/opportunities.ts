import { isCurrencyCode, type CurrencyCode } from "./currency";
import type {
  OpportunityActivity,
  OpportunityGoalLink,
} from "./opportunitiesShared";
import { getDataMode } from "./dataMode";
import { SEED_OPPORTUNITIES } from "./pipelineSeed";
import {
  EMPTY_OPPORTUNITIES,
  normalizeConfidence,
  normalizeLevel,
  normalizeRevenueType,
  normalizeStatus,
  type Opportunity,
  type OpportunityLine,
  type OpportunitiesState,
} from "./opportunitiesShared";

/**
 * OPPORTUNITIES — storage and operations.
 *
 * Same shape as the performance store: one row in offering_catalog_state, mock
 * and real in separate rows so a mock edit can never touch a live deal. See
 * lib/opportunitiesShared.ts for why this module exists and where the field
 * list comes from.
 */

const ROW_ID = "opportunities";

function activeRowId(): string {
  try {
    return getDataMode() === "mock" ? `${ROW_ID}:mock` : ROW_ID;
  } catch {
    return ROW_ID;
  }
}

function hasDatabase(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function client() {
  // Lazy require so the SDK never rides into a client bundle via this module.
  return require("@supabase/supabase-js").createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function strList(v: unknown, max: number): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    const s = str(item, max);
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

/** ISO day, or nothing. A half-parsed date is worse than an absent one. */
function day(v: unknown): string | undefined {
  const s = str(v, 40);
  if (!s) return undefined;
  const t = Date.parse(s);
  if (Number.isNaN(t)) return undefined;
  return new Date(t).toISOString().slice(0, 10);
}

function uid(): string {
  return `opp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * THE OFFERING ROWS. A row with neither an offering nor a value is a blank
 * someone added and never filled, so it is dropped rather than saved as an
 * empty line that shows up as "Untitled offering · $0" forever.
 */
function normalizeLines(raw: unknown): OpportunityLine[] {
  if (!Array.isArray(raw)) return [];
  const out: OpportunityLine[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const offeringId = str(r.offeringId, 60) || undefined;
    const offeringLabel = str(r.offeringLabel, 160) || undefined;
    const value = num(r.value);
    if (!offeringId && !offeringLabel && value === 0) continue;
    const localValue = num(r.localValue);
    const localCurrency = isCurrencyCode(r.localCurrency)
      ? ((r.localCurrency as string).toUpperCase() as CurrencyCode)
      : undefined;
    out.push({
      id: str(r.id, 60) || `line-${out.length}-${Math.random().toString(36).slice(2, 7)}`,
      offeringId,
      offeringLabel,
      revenueType: normalizeRevenueType(r.revenueType),
      value,
      localValue: localValue > 0 && localCurrency ? localValue : undefined,
      localCurrency: localValue > 0 && localCurrency ? localCurrency : undefined,
      status: normalizeStatus(r.status),
      confidence: normalizeConfidence(r.confidence),
      estSignDate: day(r.estSignDate),
      nextSteps: str(r.nextSteps, 600) || undefined,
    });
  }
  return out;
}

function normalizeGoalLinks(raw: unknown): OpportunityGoalLink[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: OpportunityGoalLink[] = [];
  for (const item of raw.slice(0, 50)) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const goalId = str(r.goalId, 60);
    if (!goalId) continue;
    const value =
      typeof r.value === "number" && Number.isFinite(r.value) && r.value >= 0
        ? r.value
        : undefined;
    out.push({
      id:
        str(r.id, 60) ||
        `gl-${out.length}-${Math.random().toString(36).slice(2, 7)}`,
      goalId,
      person: str(r.person, 120) || undefined,
      value,
      met: r.met === true,
      metAt: day(r.metAt),
      actualId: str(r.actualId, 60) || undefined,
    });
  }
  return out.length ? out : undefined;
}

const ACTIVITY_STATUSES = ["initiated", "under_progress", "completed"] as const;

function normalizeActivities(raw: unknown): OpportunityActivity[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: OpportunityActivity[] = [];
  for (const item of raw.slice(0, 100)) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const activity = str(r.activity, 60);
    if (!activity) continue;
    const status = (ACTIVITY_STATUSES as readonly string[]).includes(
      String(r.status ?? "")
    )
      ? (String(r.status) as OpportunityActivity["status"])
      : "initiated";
    out.push({
      id: str(r.id, 60) || `act-${out.length}-${Math.random().toString(36).slice(2, 7)}`,
      activity,
      status,
      person: str(r.person, 120),
      note: str(r.note, 400) || undefined,
      date: day(r.date) ?? new Date().toISOString().slice(0, 10),
      startDate: day(r.startDate),
      endDate: day(r.endDate),
    });
  }
  return out.length ? out : undefined;
}

function normalizeOne(raw: unknown): Opportunity | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = str(r.name, 200);
  const customer = str(r.customer, 200);
  // A line item with neither a name nor an account is not a deal, it is noise.
  if (!name && !customer) return null;
  const currency = isCurrencyCode(r.currency) ? (r.currency as CurrencyCode) : undefined;
  const now = new Date().toISOString();
  const rows = normalizeLines(r.lines);
  // The rows ARE the money once there are any, so the stored total is written
  // from them and can never drift away from what is listed underneath it.
  const total = rows.length
    ? rows.reduce((sum, x) => sum + x.value, 0)
    : num(r.value);
  // The offering columns stay in step with the rows, so search, the heat map
  // and every "which offerings does this cover" reader keep working unchanged.
  const idsFromRows = rows
    .map((x) => x.offeringId)
    .filter((x): x is string => Boolean(x));
  const labelsFromRows = rows
    .map((x) => x.offeringLabel)
    .filter((x): x is string => Boolean(x));
  return {
    id: str(r.id, 60) || uid(),
    externalId: str(r.externalId, 60) || undefined,
    name: name || customer,
    customerId: str(r.customerId, 60) || undefined,
    customer,
    offeringIds: rows.length
      ? [...new Set(idsFromRows)]
      : strList(r.offeringIds, 60),
    offeringLabels: rows.length
      ? [...new Set(labelsFromRows)]
      : strList(r.offeringLabels, 160),
    lines: rows.length ? rows : undefined,
    level: normalizeLevel(r.level),
    status: normalizeStatus(r.status),
    revenueType: normalizeRevenueType(r.revenueType),
    value: total,
    currency,
    confidence: normalizeConfidence(r.confidence),
    estSignDate: day(r.estSignDate),
    owner: str(r.owner, 120) || undefined,
    nextSteps: str(r.nextSteps, 600) || undefined,
    // The goal table is the source of truth once it exists: goalIds derive
    // from its rows so pacing keeps reading the field it always has.
    ...(() => {
      const goalLinks = normalizeGoalLinks(r.goalLinks);
      return {
        goalLinks,
        goalIds: goalLinks
          ? [...new Set(goalLinks.map((l) => l.goalId))]
          : strList(r.goalIds, 60),
      };
    })(),
    activities: normalizeActivities(r.activities),
    targetPitchDate: day(r.targetPitchDate),
    targetQuarter: str(r.targetQuarter, 40) || undefined,
    createdAt: str(r.createdAt, 40) || now,
    updatedAt: str(r.updatedAt, 40) || now,
  };
}

function normalize(raw: unknown): OpportunitiesState {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    opportunities: Array.isArray(r.opportunities)
      ? r.opportunities
          .map(normalizeOne)
          .filter((o): o is Opportunity => o !== null)
      : [],
  };
}

async function readRow(): Promise<OpportunitiesState> {
  if (!hasDatabase()) return structuredClone(EMPTY_OPPORTUNITIES);
  const { data, error } = await client()
    .from("offering_catalog_state")
    .select("catalog")
    .eq("id", activeRowId())
    .maybeSingle();
  if (error) throw new Error(error.message);
  return normalize(data?.catalog);
}

async function writeRow(state: OpportunitiesState): Promise<void> {
  const { error } = await client()
    .from("offering_catalog_state")
    .upsert({
      id: activeRowId(),
      catalog: state,
      updated_at: new Date().toISOString(),
    });
  if (error) throw new Error(error.message);
}

/**
 * MOCK SHOWS THE REAL PIPELINE (Anir, Aug 16: "prolly dont want to use the
 * data its not real — maybe in mock mode u can add it").
 *
 * Suren's sheet, transcribed, so the module is full the moment you open it in
 * Mock instead of showing an empty table. Ids are derived from the row, not
 * random, so the same deal keeps the same id across reloads and anything that
 * points at one keeps pointing at it.
 *
 * Real mode never touches this: it reads the live store and starts empty.
 */
/**
 * THE SHEET IS ALREADY OFFERING-LEVEL. WHICH ROWS ARE THE SAME DEAL?
 *
 * Anir, Aug 16, asked to work it out from the data rather than guess: "figure
 * it out. I'm pretty sure you can just use your brain."
 *
 * So, what the 76 rows actually say. Eleven accounts appear twice, and they
 * split cleanly into two shapes:
 *
 *   Novartis     GRI $500K 10% 15 Nov ARR  +  GRI $100K 10% 15 Nov OTS
 *   AstraZeneca  GRI $300K 25% Feb   ARR  +  GRI $100K 25% Feb   OTS
 *   Philips      GRI  $40K 25% 15 Nov ARR  +  GRI  $10K 25% 15 Nov OTS
 *
 * versus
 *
 *   GSK       AI Agents $180K 99% Feb 2027  +  Agent-VIA $150K, no date
 *   Indivior  GRI        $50K 10% 15 Nov    +  Agent-VIA $150K, no date
 *   Opella    GRI        $14K 50% 15 Aug    +  Agent-VIA $150K, no date
 *
 * Aug 16 the same-account-same-offering pairs were merged into multi-row
 * deals. Suren reversed that on the Aug 17 call: every sheet row is its own
 * opportunity, one offering each ("if somebody writes a proposal against
 * multiple opportunities, they can do that").
 */
function seededMock(): OpportunitiesState {
  const now = "2026-08-16T00:00:00.000Z";
  // ONE ROW = ONE OPPORTUNITY (Suren, Aug 17 call: "don't do multiple
  // offerings on an opportunity — make it one offering on an opportunity…
  // we should not even complicate this"). The Aug-16 grouping of ARR+OTS
  // pairs is UNDONE here, on his direction: the seed is his sheet, verbatim,
  // 76 rows = 76 opportunities. Pairs that share an account and offering are
  // told apart by their revenue type in the name.
  const opportunities: Opportunity[] = [];
  const dupKey = new Map<string, number>();
  for (const r of SEED_OPPORTUNITIES) {
    const key = `${r.customer.trim().toLowerCase()}::${(r.offering ?? "").trim().toLowerCase()}`;
    dupKey.set(key, (dupKey.get(key) ?? 0) + 1);
  }
  let n = 0;
  for (const r of SEED_OPPORTUNITIES) {
    n += 1;
    const key = `${r.customer.trim().toLowerCase()}::${(r.offering ?? "").trim().toLowerCase()}`;
    const needsSuffix = (dupKey.get(key) ?? 0) > 1 && r.revenueType;
    const baseName = r.offering ? `${r.offering}. ${r.customer}` : r.customer;
    const line: OpportunityLine = {
      id: `seed-line-${n}-1`,
      offeringLabel: r.offering || undefined,
      revenueType: normalizeRevenueType(r.revenueType),
      value: r.value ?? 0,
      status: normalizeStatus(r.status),
      confidence: normalizeConfidence(r.confidence),
      estSignDate: r.estSignDate ?? undefined,
      nextSteps: r.nextSteps ?? undefined,
    };
    opportunities.push({
      id: `seed-opp-${n}`,
      externalId: r.externalId ?? undefined,
      name: needsSuffix ? `${baseName} (${r.revenueType})` : baseName,
      customer: r.customer,
      offeringIds: [],
      offeringLabels: r.offering ? [r.offering] : [],
      lines: [line],
      level: normalizeLevel(r.level),
      status: normalizeStatus(r.status),
      revenueType: normalizeRevenueType(r.revenueType),
      value: r.value ?? 0,
      confidence: normalizeConfidence(r.confidence),
      estSignDate: r.estSignDate ?? undefined,
      owner: undefined,
      nextSteps: r.nextSteps ?? undefined,
      goalIds: [],
      // EVERY MOCK PAGE LOOKS WORKED-IN (Anir, Aug 19: "Why is there nothing
      // here in Mock-mode? same for every other page") — most sample deals
      // carry an activity or two, by the same mock people the performance
      // pages use. Deterministic from the row number, like everything mock.
      activities:
        n % 5 === 4
          ? undefined
          : [
              {
                id: `seed-act-${n}-1`,
                activity: (["lead", "opportunity", "pilot", "contract", "delivery"] as const)[n % 5],
                status: (["initiated", "under_progress", "completed"] as const)[n % 3],
                person: ["Audrey Kingsley", "Daniel Foster", "Grace Lockwood", "Hannah Schmidt"][n % 4],
                date: `2026-0${(n % 6) + 2}-${String((n % 27) + 1).padStart(2, "0")}`,
                ...(n % 3 === 0
                  ? { note: ["Demo done, security review next", "Waiting on their legal", "Second market added to scope"][n % 3 === 0 ? (n / 3) % 3 | 0 : 0] }
                  : {}),
              },
              ...(n % 4 === 0
                ? [
                    {
                      id: `seed-act-${n}-2`,
                      activity: "lead" as const,
                      status: "completed" as const,
                      person: ["Clara Middleton", "Gordon Ashby"][n % 2],
                      date: `2026-01-${String((n % 25) + 1).padStart(2, "0")}`,
                    },
                  ]
                : []),
            ],
      createdAt: now,
      updatedAt: now,
    });
  }
  return { opportunities };
}

export async function readOpportunities(): Promise<OpportunitiesState> {
  if (getDataMode() === "mock") return seededMock();
  return readRow().catch(() => structuredClone(EMPTY_OPPORTUNITIES));
}

/* ------------------------------------------------------------------- ops */

export type OpportunityInput = {
  externalId?: string;
  name?: string;
  customer?: string;
  customerId?: string;
  offeringIds?: string[];
  offeringLabels?: string[];
  /** The offering rows, raw. normalizeLines is what decides their shape. */
  lines?: unknown[];
  level?: string;
  status?: string;
  revenueType?: string;
  value?: number;
  currency?: string;
  confidence?: number;
  estSignDate?: string;
  owner?: string;
  nextSteps?: string;
  goalIds?: string[];
  goalLinks?: unknown[];
  activities?: unknown[];
};

/** The next system-assigned deal number (Suren, Aug 18: "every time somebody
 *  creates an opportunity, you need to create an opportunity ID —
 *  automatically"). Counts only our own OPP-NNNN ids, so imported CRM numbers
 *  (DO_0026765) neither collide with nor advance the sequence. */
function nextOpportunityId(existing: Opportunity[]): string {
  let max = 0;
  for (const o of existing) {
    const m = /^OPP-(\d+)$/.exec(o.externalId ?? "");
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `OPP-${String(max + 1).padStart(4, "0")}`;
}

export async function addOpportunity(input: OpportunityInput): Promise<Opportunity> {
  const customer = str(input.customer, 200);
  const name = str(input.name, 200);
  if (!customer) throw new Error("Say which customer this opportunity is with.");
  if (!name) throw new Error("Give the opportunity a name.");
  const state = await readRow();
  const now = new Date().toISOString();
  const created = normalizeOne({
    ...input,
    id: uid(),
    name,
    customer,
    createdAt: now,
    updatedAt: now,
  });
  if (!created) throw new Error("That opportunity could not be saved.");
  if (!created.externalId) {
    created.externalId = nextOpportunityId(state.opportunities);
  }
  state.opportunities.push(created);
  await writeRow(state);
  return created;
}

export async function updateOpportunity(
  id: string,
  patch: OpportunityInput
): Promise<Opportunity> {
  const state = await readRow();
  const idx = state.opportunities.findIndex((o) => o.id === id);
  if (idx === -1) throw new Error("That opportunity no longer exists.");
  const merged = normalizeOne({
    ...state.opportunities[idx],
    // Only fields actually sent overwrite: a form that posts three fields must
    // not blank the other twelve.
    ...Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined)
    ),
    id,
    createdAt: state.opportunities[idx].createdAt,
    updatedAt: new Date().toISOString(),
  });
  if (!merged) throw new Error("That opportunity could not be saved.");
  state.opportunities[idx] = merged;
  await writeRow(state);
  return merged;
}

export async function removeOpportunity(id: string): Promise<void> {
  const state = await readRow();
  const next = state.opportunities.filter((o) => o.id !== id);
  if (next.length === state.opportunities.length) {
    throw new Error("That opportunity no longer exists.");
  }
  state.opportunities = next;
  await writeRow(state);
}

/** Replace the whole list. Used by the mock seeder, never by the UI. */
export async function replaceOpportunities(list: unknown[]): Promise<number> {
  const state: OpportunitiesState = {
    opportunities: list
      .map(normalizeOne)
      .filter((o): o is Opportunity => o !== null),
  };
  await writeRow(state);
  return state.opportunities.length;
}
