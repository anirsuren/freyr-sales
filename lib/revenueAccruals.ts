import "server-only";

import { getDataMode } from "./dataMode";
import {
  EMPTY_ACCRUALS,
  monthKey,
  monthsFrom,
  spreadEvenly,
  type AccrualLine,
  type AccrualPlan,
  type AccrualSnapshot,
  type RevenueAccrualsState,
} from "./revenueAccrualsShared";

/**
 * THE REVENUE ACCRUALS STORE. Same shape every store in this app uses: one row
 * in offering_catalog_state, jsonb column `catalog`, mock and real on separate
 * ids so a demo click can never reach the live plan, every field named in a
 * normalizer so an unknown key cannot survive a round trip.
 *
 * The rules this file enforces (all Suren, Aug 25) live in
 * revenueAccrualsShared.ts alongside the types: nothing auto-pushes, a missed
 * month is flagged rather than moved, and the month-on-month gap is computed
 * against a frozen snapshot rather than guessed.
 */

const ROW_ID = "revenue-accruals";

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

/** "2026-04" and nothing else — a bad month key would silently split a plan. */
function month(v: unknown): string {
  const s = str(v, 7);
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s) ? s : "";
}

function normalizeLine(v: unknown): AccrualLine | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Partial<AccrualLine>;
  const m = month(r.month);
  if (!m) return null;
  return { month: m, amount: num(r.amount) };
}

function normalizePlan(v: unknown): AccrualPlan | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Partial<AccrualPlan>;
  const id = str(r.id, 60);
  const opportunityId = str(r.opportunityId, 60);
  if (!id || !opportunityId) return null;
  /* One line per month. Two rows for the same month would double-count into
     every total on the report, and there is no sane way to display it. */
  const byMonth = new Map<string, AccrualLine>();
  for (const raw of Array.isArray(r.lines) ? r.lines : []) {
    const line = normalizeLine(raw);
    if (!line) continue;
    const existing = byMonth.get(line.month);
    byMonth.set(
      line.month,
      existing ? { ...line, amount: existing.amount + line.amount } : line
    );
  }
  return {
    id,
    opportunityId,
    opportunityName: str(r.opportunityName, 200),
    customer: str(r.customer, 120),
    customerId: str(r.customerId, 60) || undefined,
    offeringId: str(r.offeringId, 60) || undefined,
    offeringLabel: str(r.offeringLabel, 160) || undefined,
    contractValue: num(r.contractValue),
    lines: [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)),
    note: str(r.note, 500) || undefined,
    updatedBy: str(r.updatedBy, 80) || "Unknown",
    updatedAt: str(r.updatedAt, 40) || new Date().toISOString(),
  };
}

function normalizeSnapshot(v: unknown): AccrualSnapshot | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Partial<AccrualSnapshot>;
  const id = month(r.id);
  if (!id) return null;
  return {
    id,
    takenAt: str(r.takenAt, 40) || new Date().toISOString(),
    takenBy: str(r.takenBy, 80) || "Unknown",
    rows: (Array.isArray(r.rows) ? r.rows : [])
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        const x = row as AccrualSnapshot["rows"][number];
        const opportunityId = str(x.opportunityId, 60);
        if (!opportunityId) return null;
        const byMonth: Record<string, number> = {};
        for (const [k, val] of Object.entries(x.byMonth ?? {})) {
          const m = month(k);
          if (m) byMonth[m] = num(val);
        }
        return {
          opportunityId,
          opportunityName: str(x.opportunityName, 200),
          customer: str(x.customer, 120),
          byMonth,
        };
      })
      .filter((x): x is AccrualSnapshot["rows"][number] => x !== null),
  };
}

function normalize(v: unknown): RevenueAccrualsState {
  if (!v || typeof v !== "object") return structuredClone(EMPTY_ACCRUALS);
  const raw = v as Partial<RevenueAccrualsState>;
  return {
    plans: (Array.isArray(raw.plans) ? raw.plans : [])
      .map(normalizePlan)
      .filter((p): p is AccrualPlan => p !== null),
    snapshots: (Array.isArray(raw.snapshots) ? raw.snapshots : [])
      .map(normalizeSnapshot)
      .filter((s): s is AccrualSnapshot => s !== null)
      .sort((a, b) => a.id.localeCompare(b.id))
      /* Two years of frozen sheets is more history than anyone reads, and the
         row has to stay a sane size. */
      .slice(-24),
  };
}

async function readRow(): Promise<RevenueAccrualsState> {
  if (!hasDatabase()) return structuredClone(EMPTY_ACCRUALS);
  const { data, error } = await client()
    .from("offering_catalog_state")
    .select("catalog")
    .eq("id", activeRowId())
    .maybeSingle();
  if (error) throw new Error(error.message);
  return normalize(data?.catalog);
}

async function writeRow(state: RevenueAccrualsState): Promise<void> {
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
  var __FREYR_ACCRUALS_WRITE_QUEUE__: Promise<void> | undefined;
}

/** One door for every write — read-modify-write on a single row. */
async function withWrite<T>(fn: () => Promise<T>): Promise<T> {
  const previous = globalThis.__FREYR_ACCRUALS_WRITE_QUEUE__ ?? Promise.resolve();
  let release: () => void = () => undefined;
  globalThis.__FREYR_ACCRUALS_WRITE_QUEUE__ = new Promise<void>((resolve) => {
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
  return `acc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/* ---------------------------------------------------------------- samples */

/** Mock looks busy, like every other page (standing rule). Invented deals only. */
function sampleAccruals(): RevenueAccrualsState {
  const base = "2026-08";
  const plan = (
    n: number,
    opportunityName: string,
    customer: string,
    offeringLabel: string,
    value: number,
    startOffset: number,
    months: number
  ): AccrualPlan => ({
    id: `acc-sample-${n}`,
    opportunityId: `opp-sample-${n}`,
    opportunityName,
    customer,
    offeringLabel,
    contractValue: value,
    lines: spreadEvenly(value, monthsFrom(base, 12)[startOffset] ?? base, months),
    updatedBy: "Elena Rossi",
    updatedAt: "2026-08-01T09:00:00.000Z",
  });
  const plans = [
    plan(1, "Freya.Label rollout", "Meridian Pharmaceuticals", "Freya.Label", 1_200_000, 0, 6),
    plan(2, "Global publishing renewal", "Aurora Biosciences", "Global Publishing", 840_000, 1, 4),
    plan(3, "RIM migration", "Helix Therapeutics", "Regulatory Intelligence Services", 2_400_000, 2, 8),
    plan(4, "Labeling managed service", "Northwind Labs", "Freya.Label", 360_000, 0, 3),
  ];
  /* One frozen sheet a month back, deliberately different from today's plans
     so the deviation report has something real to show in the demo. */
  const snapshot: AccrualSnapshot = {
    id: "2026-07",
    takenAt: "2026-07-31T18:00:00.000Z",
    takenBy: "Elena Rossi",
    rows: plans.map((p, i) => ({
      opportunityId: p.opportunityId,
      opportunityName: p.opportunityName,
      customer: p.customer,
      byMonth: Object.fromEntries(
        p.lines.map((l, li) => [
          l.month,
          /* The third deal slipped: its July sheet loaded the earlier months
             harder than today's plan does. */
          i === 2 && li < 2 ? Math.round(l.amount * 1.6) : l.amount,
        ])
      ),
    })),
  };
  return { plans, snapshots: [snapshot] };
}

/* ------------------------------------------------------------------- api */

export async function readRevenueAccruals(): Promise<RevenueAccrualsState> {
  if (getDataMode() === "mock") return sampleAccruals();
  return readRow();
}

export type AccrualPlanInput = {
  opportunityId: string;
  opportunityName: string;
  customer: string;
  customerId?: string;
  offeringId?: string;
  offeringLabel?: string;
  contractValue: number;
  lines: { month: string; amount: number }[];
  note?: string;
};

/**
 * Save the plan for one opportunity. One plan per deal — saving again replaces
 * the months rather than adding a second plan, because "the accrual for this
 * opportunity" is one answer and two of them is the Excel problem again.
 */
export async function saveAccrualPlan(
  input: AccrualPlanInput,
  who: string
): Promise<AccrualPlan> {
  return withWrite(async () => {
    const state = await readRow();
    const existing = state.plans.find(
      (p) => p.opportunityId === input.opportunityId
    );
    const draft = normalizePlan({
      ...input,
      id: existing?.id ?? uid(),
      updatedBy: who,
      updatedAt: new Date().toISOString(),
    });
    if (!draft) throw new Error("That plan is missing an opportunity.");
    state.plans = [
      ...state.plans.filter((p) => p.opportunityId !== input.opportunityId),
      draft,
    ];
    await writeRow(state);
    return draft;
  });
}

export async function removeAccrualPlan(opportunityId: string): Promise<void> {
  await withWrite(async () => {
    const state = await readRow();
    state.plans = state.plans.filter((p) => p.opportunityId !== opportunityId);
    await writeRow(state);
  });
}

/**
 * FREEZE THIS MONTH'S SHEET — the other half of the deviation report ("by July
 * end we are freezing; on August 1st we are developing another sheet, then
 * comparing these two").
 *
 * One snapshot per month. Taking it twice in the same month overwrites, which
 * is the honest behaviour: the sheet is "what the plan said in July", and if
 * somebody re-freezes on the 31st that is a newer answer to the same question.
 */
export async function freezeAccrualSnapshot(who: string): Promise<AccrualSnapshot> {
  return withWrite(async () => {
    const state = await readRow();
    const id = monthKey(new Date());
    const snapshot: AccrualSnapshot = {
      id,
      takenAt: new Date().toISOString(),
      takenBy: who,
      rows: state.plans.map((p) => ({
        opportunityId: p.opportunityId,
        opportunityName: p.opportunityName,
        customer: p.customer,
        byMonth: Object.fromEntries(p.lines.map((l) => [l.month, l.amount])),
      })),
    };
    state.snapshots = [
      ...state.snapshots.filter((s) => s.id !== id),
      snapshot,
    ].sort((a, b) => a.id.localeCompare(b.id));
    await writeRow(state);
    return snapshot;
  });
}

/**
 * UNFREEZE A MONTH. Freezing is a deliberate act and so is undoing it: a sheet
 * frozen by mistake becomes the baseline every later gap is measured against,
 * and there was no way back. This does not touch a single plan — it removes
 * the photograph, not the thing photographed.
 */
export async function removeAccrualSnapshot(month: string): Promise<void> {
  await withWrite(async () => {
    const state = await readRow();
    state.snapshots = state.snapshots.filter((s) => s.id !== month);
    await writeRow(state);
  });
}

/** The sheet the current plans are judged against: the newest one before now. */
export function latestSnapshotBefore(
  state: RevenueAccrualsState,
  thisMonth = monthKey(new Date())
): AccrualSnapshot | null {
  const earlier = state.snapshots.filter((s) => s.id < thisMonth);
  return earlier.length ? earlier[earlier.length - 1] : null;
}
