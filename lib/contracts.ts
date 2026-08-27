import "server-only";

import { getDataMode } from "./dataMode";
import { spreadEvenly } from "./revenueAccrualsShared";
import {
  CONTRACT_STATUSES,
  EMPTY_CONTRACTS,
  nextContractReference,
  type Contract,
  type ContractStatus,
  type ContractsState,
  type ScheduleLine,
} from "./contractsShared";

/**
 * THE CONTRACT STORE — the sales side of the one shared repository (Suren,
 * Aug 25: "the contract repository has to be in one place and both the systems
 * have to use the same place, otherwise you will have two sets of things…
 * this interface should enter the data, because this is where we are logically
 * closing").
 *
 * Same store pattern as every other module: one row, jsonb `catalog`, mock and
 * real on separate ids, every field named in a normalizer, one write queue.
 * The delivery platform reads this by `reference`; nothing here writes to it.
 */

const ROW_ID = "contracts";

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

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function monthOf(v: unknown): string {
  const s = str(v, 7);
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s) ? s : "";
}

function statusOf(v: unknown): ContractStatus {
  return CONTRACT_STATUSES.includes(v as ContractStatus)
    ? (v as ContractStatus)
    : "Draft";
}

function normalizeContract(v: unknown): Contract | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Partial<Contract>;
  const id = str(r.id, 60);
  const reference = str(r.reference, 32);
  if (!id || !reference) return null;
  const byMonth = new Map<string, number>();
  for (const raw of Array.isArray(r.schedule) ? r.schedule : []) {
    if (!raw || typeof raw !== "object") continue;
    const m = monthOf((raw as ScheduleLine).month);
    if (!m) continue;
    byMonth.set(m, (byMonth.get(m) ?? 0) + num((raw as ScheduleLine).amount));
  }
  return {
    id,
    reference,
    name: str(r.name, 200),
    customer: str(r.customer, 120),
    customerId: str(r.customerId, 60) || undefined,
    opportunityId: str(r.opportunityId, 60) || undefined,
    opportunityName: str(r.opportunityName, 200) || undefined,
    offeringId: str(r.offeringId, 60) || undefined,
    offeringLabel: str(r.offeringLabel, 160) || undefined,
    value: num(r.value),
    status: statusOf(r.status),
    startDate: str(r.startDate, 20) || undefined,
    endDate: str(r.endDate, 20) || undefined,
    signedOn: str(r.signedOn, 20) || undefined,
    owner: str(r.owner, 80) || undefined,
    documentUrl: str(r.documentUrl, 2000) || undefined,
    signedBy: str(r.signedBy, 120) || undefined,
    /* Which booked-revenue goal this counts towards. Normalised like every
       other field rather than spread through, so a browser cannot invent a
       goal link shape and a save cannot silently drop one. */
    goalLink: (() => {
      const raw = r.goalLink as Record<string, unknown> | undefined;
      const goalId = str(raw?.goalId, 60);
      if (!goalId) return undefined;
      return {
        goalId,
        person: str(raw?.person, 80) || undefined,
        actualId: str(raw?.actualId, 80) || undefined,
        postedAt: str(raw?.postedAt, 20) || undefined,
      };
    })(),
    schedule: [...byMonth.entries()]
      .map(([month, amount]) => ({ month, amount }))
      .sort((a, b) => a.month.localeCompare(b.month)),
    note: str(r.note, 1000) || undefined,
    createdBy: str(r.createdBy, 80) || "Unknown",
    createdAt: str(r.createdAt, 40) || new Date().toISOString(),
    updatedBy: str(r.updatedBy, 80) || "Unknown",
    updatedAt: str(r.updatedAt, 40) || new Date().toISOString(),
  };
}

function normalize(v: unknown): ContractsState {
  if (!v || typeof v !== "object") return structuredClone(EMPTY_CONTRACTS);
  const raw = v as Partial<ContractsState>;
  return {
    contracts: (Array.isArray(raw.contracts) ? raw.contracts : [])
      .map(normalizeContract)
      .filter((c): c is Contract => c !== null),
  };
}

async function readRow(): Promise<ContractsState> {
  if (!hasDatabase()) return structuredClone(EMPTY_CONTRACTS);
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

async function writeRow(state: ContractsState): Promise<void> {
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
  var __FREYR_CONTRACTS_WRITE_QUEUE__: Promise<void> | undefined;
}

async function withWrite<T>(fn: () => Promise<T>): Promise<T> {
  const previous = globalThis.__FREYR_CONTRACTS_WRITE_QUEUE__ ?? Promise.resolve();
  let release: () => void = () => undefined;
  globalThis.__FREYR_CONTRACTS_WRITE_QUEUE__ = new Promise<void>((resolve) => {
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
  return `ct-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/* ---------------------------------------------------------------- samples */

function sampleContracts(): ContractsState {
  const mk = (
    n: number,
    name: string,
    customer: string,
    offeringLabel: string,
    value: number,
    status: ContractStatus,
    startMonth: string,
    months: number
  ): Contract => ({
    id: `ct-sample-${n}`,
    reference: `FR-C-${String(n).padStart(4, "0")}`,
    name,
    customer,
    offeringLabel,
    value,
    status,
    startDate: `${startMonth}-01`,
    signedOn: status === "Signed" ? `${startMonth}-04` : undefined,
    signedBy: status === "Signed" ? "Dr. Lena Vogt, VP Regulatory" : undefined,
    /* Sample only. A real contract's link points at wherever legal keeps the
       executed PDF; nothing is stored in this app. */
    documentUrl:
      status === "Signed" || status === "Ready for delivery"
        ? `https://example.invalid/contracts/FR-C-${String(n).padStart(4, "0")}.pdf`
        : undefined,
    owner: "Elena Rossi",
    schedule: spreadEvenly(value, startMonth, months),
    createdBy: "Elena Rossi",
    createdAt: `${startMonth}-01T09:00:00.000Z`,
    updatedBy: "Elena Rossi",
    updatedAt: `${startMonth}-04T09:00:00.000Z`,
  });
  return {
    contracts: [
      mk(1, "Freya.Label managed service", "Meridian Pharmaceuticals", "Freya.Label", 1_200_000, "Signed", "2026-06", 12),
      mk(2, "Global publishing renewal", "Aurora Biosciences", "Global Publishing", 840_000, "Signed", "2026-07", 12),
      mk(3, "RIM platform migration", "Helix Therapeutics", "Regulatory Intelligence Services", 2_400_000, "Ready for delivery", "2026-09", 18),
      mk(4, "Labeling pilot extension", "Northwind Labs", "Freya.Label", 360_000, "Draft", "2026-10", 6),
    ],
  };
}

/* ------------------------------------------------------------------- api */

/**
 * MOCK IS A REAL STORE, NOT A PICTURE OF ONE (Anir, Aug 26: "all the same
 * functionality (add, edit etc.) should be on mock mode, but it shouldn't
 * affect real data"). `activeRowId()` has always pointed mock at its OWN row,
 * so a mock write could never reach real; what made it read-only was answering
 * with a fresh sample every time, so an edit had nowhere to land. The samples
 * now SEED that row once and everything after is an ordinary read. Emptying it
 * deliberately stays empty: the seed fires only when the row never existed.
 */
export async function readContracts(): Promise<ContractsState> {
  if (getDataMode() !== "mock") return readRow();
  const existing = await readRowRaw();
  if (existing) return normalize(existing);
  const seeded = sampleContracts();
  await writeRow(seeded).catch(() => undefined);
  return seeded;
}

export type ContractInput = {
  id?: string;
  name: string;
  customer: string;
  customerId?: string;
  opportunityId?: string;
  opportunityName?: string;
  offeringId?: string;
  offeringLabel?: string;
  value: number;
  status?: ContractStatus;
  startDate?: string;
  endDate?: string;
  signedOn?: string;
  owner?: string;
  documentUrl?: string;
  signedBy?: string;
  schedule?: { month: string; amount: number }[];
  note?: string;
};

export async function saveContract(
  input: ContractInput,
  who: string
): Promise<Contract> {
  return withWrite(async () => {
    const state = await readRow();
    const existing = input.id
      ? state.contracts.find((c) => c.id === input.id)
      : undefined;
    const draft = normalizeContract({
      ...existing,
      ...input,
      id: existing?.id ?? uid(),
      /* The reference is minted once and never rewritten — it is the key the
         delivery platform holds, and a contract that renumbers itself breaks
         the only link between the two systems. */
      reference: existing?.reference ?? nextContractReference(state.contracts),
      schedule: input.schedule ?? existing?.schedule ?? [],
      createdBy: existing?.createdBy ?? who,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedBy: who,
      updatedAt: new Date().toISOString(),
    });
    if (!draft) throw new Error("That contract could not be saved.");
    state.contracts = [
      ...state.contracts.filter((c) => c.id !== draft.id),
      draft,
    ];
    await writeRow(state);
    return draft;
  });
}

export async function removeContract(id: string): Promise<void> {
  await withWrite(async () => {
    const state = await readRow();
    state.contracts = state.contracts.filter((c) => c.id !== id);
    await writeRow(state);
  });
}

/** Every contract on one deal — usually none or one. */
export function contractsForOpportunity(
  state: ContractsState,
  opportunityId: string
): Contract[] {
  return state.contracts.filter((c) => c.opportunityId === opportunityId);
}
