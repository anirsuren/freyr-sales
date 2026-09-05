import "server-only";

import { getDataMode } from "./dataMode";
import { mockFillLeads, hasMockFillRows, isStaleFillRow } from "./mockFillLife";
import {
  EMPTY_LEADS,
  LEAD_SOURCES,
  LEAD_STATUSES,
  nextLeadRef,
  type Lead,
  type LeadSource,
  type LeadStatus,
  type LeadsState,
} from "./leadsShared";

/**
 * THE LEADS STORE. Same shape as every other module: one row in
 * offering_catalog_state, jsonb `catalog`, mock and real on separate ids, one
 * write queue, every field named in a normalizer.
 *
 * Why leads exist at all is in leadsShared.ts, in Suren's own words.
 */

const ROW_ID = "leads";

function activeRowId(): string {
  try {
    return getDataMode() === "mock" ? `${ROW_ID}:mock` : ROW_ID;
  } catch {
    return ROW_ID;
  }
}

function hasDatabase(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function client() {
  return require("@supabase/supabase-js").createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function sourceOf(v: unknown): LeadSource {
  return LEAD_SOURCES.includes(v as LeadSource) ? (v as LeadSource) : "Other";
}

function statusOf(v: unknown): LeadStatus {
  return LEAD_STATUSES.includes(v as LeadStatus) ? (v as LeadStatus) : "New";
}

function normalizeLead(v: unknown): Lead | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Partial<Lead>;
  const id = str(r.id, 60);
  const ref = str(r.ref, 20);
  /* A lead with neither a person nor a company is not a lead, it is an empty
     row somebody pressed save on. */
  const name = str(r.name, 120);
  const company = str(r.company, 160);
  if (!id || !ref || (!name && !company)) return null;
  return {
    id,
    ref,
    name,
    company,
    customerId: str(r.customerId, 60) || undefined,
    title: str(r.title, 120) || undefined,
    email: str(r.email, 200) || undefined,
    phone: str(r.phone, 60) || undefined,
    country: str(r.country, 80) || undefined,
    source: sourceOf(r.source),
    interest: str(r.interest, 500) || undefined,
    offeringId: str(r.offeringId, 60) || undefined,
    status: statusOf(r.status),
    owner: str(r.owner, 80) || undefined,
    note: str(r.note, 1000) || undefined,
    createdBy: str(r.createdBy, 80) || "Unknown",
    createdAt: str(r.createdAt, 40) || new Date().toISOString(),
    updatedBy: str(r.updatedBy, 80) || "Unknown",
    updatedAt: str(r.updatedAt, 40) || new Date().toISOString(),
    convertedOpportunityId: str(r.convertedOpportunityId, 60) || undefined,
    convertedAt: str(r.convertedAt, 40) || undefined,
    disqualifiedReason: str(r.disqualifiedReason, 300) || undefined,
  };
}

function normalize(v: unknown): LeadsState {
  if (!v || typeof v !== "object") return structuredClone(EMPTY_LEADS);
  const raw = v as Partial<LeadsState>;
  return {
    leads: (Array.isArray(raw.leads) ? raw.leads : [])
      .map(normalizeLead)
      .filter((l): l is Lead => l !== null),
  };
}

async function readRow(): Promise<LeadsState> {
  if (!hasDatabase()) return structuredClone(EMPTY_LEADS);
  const { data, error } = await client()
    .from("offering_catalog_state")
    .select("catalog")
    .eq("id", activeRowId())
    .maybeSingle();
  if (error) throw new Error(error.message);
  return normalize(data?.catalog);
}

/** The stored row exactly as it is, or null when it has never been written. */
async function readRowRaw(): Promise<unknown | null> {
  if (!hasDatabase()) return null;
  const { data, error } = await client()
    .from("offering_catalog_state")
    .select("catalog")
    .eq("id", activeRowId())
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.catalog ?? null;
}

async function writeRow(state: LeadsState): Promise<void> {
  const { error } = await client()
    .from("offering_catalog_state")
    .upsert({
      id: activeRowId(),
      catalog: state,
      updated_at: new Date().toISOString(),
    });
  if (error) throw new Error(error.message);
}

declare global {
  // eslint-disable-next-line no-var
  var __FREYR_LEADS_WRITE_QUEUE__: Promise<void> | undefined;
}

async function withWrite<T>(fn: () => Promise<T>): Promise<T> {
  const previous = globalThis.__FREYR_LEADS_WRITE_QUEUE__ ?? Promise.resolve();
  let release: () => void = () => undefined;
  globalThis.__FREYR_LEADS_WRITE_QUEUE__ = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
  }
}

function uid(): string {
  return `ld-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/* ---------------------------------------------------------------- samples */

function sampleLeads(): LeadsState {
  const day = (offset: number) => {
    const t = new Date("2026-08-25T10:00:00.000Z");
    t.setDate(t.getDate() + offset);
    return t.toISOString();
  };
  const rows: [string, string, string, LeadSource, LeadStatus, string, number][] = [
    ["Lena Vogt", "Meridian Pharmaceuticals", "Head of Regulatory Ops", "Website", "Qualifying", "Asked for a Freya.Label demo through the site", -2],
    ["Owen Bradley", "Northwind Labs", "VP Regulatory Affairs", "Conference", "Contacted", "Met at DIA, wants the publishing overview", -6],
    ["Priya Nair", "Helix Therapeutics", "Director, RIM", "Referral", "New", "Introduced by Aurora's programme lead", -1],
    ["Tomas Lindqvist", "Baltic Bio", "Regulatory Manager", "Campaign", "Nurturing", "Downloaded the labelling white paper", -21],
    ["Ana Sousa", "Ventura Health", "Head of Submissions", "Inbound email", "Contacted", "Emailed asking about eCTD publishing capacity", -9],
    ["Marco Bianchi", "Adriatic Pharma", "CEO", "Partner", "New", "Passed on by a delivery partner in Milan", 0],
    ["Yuki Tanaka", "Sakura Therapeutics", "Regulatory Lead", "Website", "Qualifying", "Booked a discovery call on the site", -4],
    ["Ruth Okafor", "Lagos BioWorks", "Regulatory Affairs", "Conference", "Disqualified", "No budget this financial year", -30],
  ];
  return {
    leads: rows.map(([name, company, title, source, status, interest, age], i) => ({
      id: `ld-sample-${i + 1}`,
      ref: `LEAD-${String(i + 1).padStart(4, "0")}`,
      name,
      company,
      title,
      source,
      status,
      interest,
      owner: ["Elena Rossi", "Omar Haddad", "Nina Kowalski"][i % 3],
      createdBy: "Elena Rossi",
      createdAt: day(age - 1),
      updatedBy: "Elena Rossi",
      updatedAt: day(age),
      disqualifiedReason:
        status === "Disqualified" ? "No budget this financial year" : undefined,
    })),
  };
}

/* ------------------------------------------------------------------- api */

/**
 * MOCK IS A REAL STORE, NOT A PICTURE OF ONE.
 *
 * Anir, Aug 26: "I don't know why you remove functionality from mock mode. All
 * the same functionality (add, edit etc.) should be on mock mode, but it
 * shouldn't affect real data."
 *
 * It never needed to be read-only: `activeRowId()` has always pointed mock at
 * its OWN row, so a write in mock could never reach real. What made it feel
 * read-only was this function answering with a fresh sample every time, so an
 * edit had nowhere to land and the routes refused writes to match.
 *
 * Now the samples SEED the mock row the first time somebody looks at it, and
 * everything after that is an ordinary read of an ordinary store. Emptying it
 * deliberately stays empty — the seed only fires when the row has never
 * existed, not whenever it happens to be empty.
 */
/**
 * THE 140 GENERATED ACCOUNTS GET leads, ONCE.
 *
 * Anir, Sep 2, on cust-fill-140: every tab read zero, because the samples
 * above only ever covered the hand-named demo cast. The generated long tail
 * now gets its own, and the shape of this matters as much as the rows do:
 *
 *  - APPENDED, never replacing. Whatever is already in the mock row stays,
 *    including anything somebody added in mock themselves.
 *  - ONCE. "i should still be able to add edit and delete shit if i really
 *    want" — a floor that relaid itself on every read would undo a deletion
 *    the moment the page reloaded. The rows are the marker, so once they are
 *    down this never runs again and the store is ordinary from then on.
 *  - INSIDE THE WRITE QUEUE, re-reading there, so a save that landed while
 *    this was waiting its turn is not thrown away.
 *
 * Mock only, twice over: the caller checks the mode and the generator itself
 * answers with nothing outside it.
 */
async function topUpMockFill(): Promise<LeadsState> {
  return withWrite(async () => {
    const raw = await readRowRaw().catch(() => null);
    const base = raw ? normalize(raw) : sampleLeads();
    /* Sweep rows from an OLDER generated floor first (see FILL_GENERATION):
       they were the marker that kept this top-up from ever running again, so
       a change to the fill tables could never reach a workspace that already
       held the old rows. Hand-added rows carry no fill prefix and survive. */
    base.leads = base.leads.filter((r) => !isStaleFillRow(r.id));
    if (hasMockFillRows(base.leads.map((r) => r.id))) return base;
    const rows = mockFillLeads();
    if (rows.length === 0) return base;
    const next: LeadsState = { leads: [...base.leads, ...rows] };
    await writeRow(next).catch(() => undefined);
    return next;
  });
}

export async function readLeads(): Promise<LeadsState> {
  if (getDataMode() !== "mock") return readRow();
  const existing = await readRowRaw();
  if (existing) {
    const state = normalize(existing);
    if (hasMockFillRows(state.leads.map((l) => l.id))) return state;
  }
  return topUpMockFill();
}

export type LeadInput = {
  id?: string;
  name?: string;
  company?: string;
  customerId?: string;
  title?: string;
  email?: string;
  phone?: string;
  country?: string;
  source?: string;
  interest?: string;
  offeringId?: string;
  status?: string;
  owner?: string;
  note?: string;
  disqualifiedReason?: string;
};

export async function saveLead(input: LeadInput, who: string): Promise<Lead> {
  return withWrite(async () => {
    const state = await readRow();
    const existing = input.id
      ? state.leads.find((l) => l.id === input.id)
      : undefined;
    const draft = normalizeLead({
      ...existing,
      ...input,
      id: existing?.id ?? uid(),
      /* Minted once. A lead people quote by number in a pipeline meeting must
         not renumber itself when somebody fixes a typo in the company name. */
      ref: existing?.ref ?? nextLeadRef(state.leads),
      createdBy: existing?.createdBy ?? who,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedBy: who,
      updatedAt: new Date().toISOString(),
    });
    if (!draft) {
      throw new Error("A lead needs at least a person or a company name.");
    }
    state.leads = [...state.leads.filter((l) => l.id !== draft.id), draft];
    await writeRow(state);
    return draft;
  });
}

export async function removeLead(id: string): Promise<void> {
  await withWrite(async () => {
    const state = await readRow();
    state.leads = state.leads.filter((l) => l.id !== id);
    await writeRow(state);
  });
}

/**
 * Mark a lead converted and point it at the deal it became. The lead is never
 * deleted: "you don't discuss those 3000 items, you discuss only the
 * opportunity" is about the pipeline meeting, not about losing the history of
 * where a deal came from.
 */
export async function markLeadConverted(
  id: string,
  opportunityId: string,
  who: string
): Promise<Lead | null> {
  return withWrite(async () => {
    const state = await readRow();
    const lead = state.leads.find((l) => l.id === id);
    if (!lead) return null;
    const updated: Lead = {
      ...lead,
      status: "Converted",
      convertedOpportunityId: opportunityId,
      convertedAt: new Date().toISOString(),
      updatedBy: who,
      updatedAt: new Date().toISOString(),
    };
    state.leads = state.leads.map((l) => (l.id === id ? updated : l));
    await writeRow(state);
    return updated;
  });
}
