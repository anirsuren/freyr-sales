import { isCurrencyCode, type CurrencyCode } from "./currency";
import { getDataMode } from "./dataMode";
import {
  EMPTY_OPPORTUNITIES,
  normalizeConfidence,
  normalizeLevel,
  normalizeRevenueType,
  normalizeStatus,
  type Opportunity,
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

function normalizeOne(raw: unknown): Opportunity | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = str(r.name, 200);
  const customer = str(r.customer, 200);
  // A line item with neither a name nor an account is not a deal, it is noise.
  if (!name && !customer) return null;
  const currency = isCurrencyCode(r.currency) ? (r.currency as CurrencyCode) : undefined;
  const now = new Date().toISOString();
  return {
    id: str(r.id, 60) || uid(),
    externalId: str(r.externalId, 60) || undefined,
    name: name || customer,
    customerId: str(r.customerId, 60) || undefined,
    customer,
    offeringIds: strList(r.offeringIds, 60),
    offeringLabels: strList(r.offeringLabels, 160),
    level: normalizeLevel(r.level),
    status: normalizeStatus(r.status),
    revenueType: normalizeRevenueType(r.revenueType),
    value: num(r.value),
    currency,
    confidence: normalizeConfidence(r.confidence),
    estSignDate: day(r.estSignDate),
    owner: str(r.owner, 120) || undefined,
    nextSteps: str(r.nextSteps, 600) || undefined,
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

export async function readOpportunities(): Promise<OpportunitiesState> {
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
  level?: string;
  status?: string;
  revenueType?: string;
  value?: number;
  currency?: string;
  confidence?: number;
  estSignDate?: string;
  owner?: string;
  nextSteps?: string;
};

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
