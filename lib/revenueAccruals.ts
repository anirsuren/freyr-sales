import "server-only";

import { getDataMode } from "./dataMode";
import {
  DEVIATION_ORIGINS,
  EMPTY_ACCRUALS,
  judgePlan,
  latestActiveVersion,
  monthKey,
  monthsFrom,
  planVersions,
  spreadEvenly,
  versionStatus,
  type AccrualLine,
  type AccrualPlan,
  type AccrualSnapshot,
  type AccrualVersion,
  type DeviationOrigin,
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

/**
 * A FIGURE, OR NOTHING. Deliberately not num(), which answers 0 for anything it
 * cannot read.
 *
 * A rejected figure is a field the person re-types. A 0 invented out of a bad
 * value is a month this app claims somebody accrued nothing in, and that number
 * goes onto a report and into a meeting. Deviating is "they adjust and save"
 * (Suren, Sep 1), so what they typed either arrives or is refused; it never
 * arrives as something else.
 *
 * Negatives go too: a month of revenue is not a refund, and clamping one to 0
 * would write a figure nobody entered.
 */
export function parseFigure(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v === "boolean") return undefined;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n);
}

function normalizeLine(v: unknown): AccrualLine | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Partial<AccrualLine>;
  const m = month(r.month);
  if (!m) return null;
  const ots = r.ots === undefined ? undefined : num(r.ots);
  const arr = r.arr === undefined ? undefined : num(r.arr);
  /* A split, when present, IS the total — so a plan cannot store a total that
     disagrees with the two numbers a person typed underneath it. */
  const split = ots !== undefined || arr !== undefined;
  return {
    month: m,
    amount: split ? (ots ?? 0) + (arr ?? 0) : num(r.amount),
    ...(ots === undefined ? {} : { ots }),
    ...(arr === undefined ? {} : { arr }),
  };
}

/**
 * ONE LINE PER MONTH. Two rows for the same month would double-count into
 * every total on the report, and there is no sane way to display it.
 */
function dedupeLines(raw: unknown): AccrualLine[] {
  const byMonth = new Map<string, AccrualLine>();
  for (const item of Array.isArray(raw) ? raw : []) {
    const line = normalizeLine(item);
    if (!line) continue;
    const existing = byMonth.get(line.month);
    byMonth.set(
      line.month,
      existing
        ? {
            ...line,
            amount: existing.amount + line.amount,
            ...(existing.ots === undefined && line.ots === undefined
              ? {}
              : { ots: (existing.ots ?? 0) + (line.ots ?? 0) }),
            ...(existing.arr === undefined && line.arr === undefined
              ? {}
              : { arr: (existing.arr ?? 0) + (line.arr ?? 0) }),
          }
        : line
    );
  }
  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
}

/**
 * ONE STORED VERSION.
 *
 * INACTIVE IS SYSTEM-ONLY AND ENFORCED HERE (Suren, Sep 1: "nobody can make it
 * inactive because people have to enter that information somehow. If they have
 * not filled it, then it's non-filled"). A version whose origin is not the
 * system loses the flag on the way in, so neither a fumbled payload nor a
 * hand-edited row can produce an Inactive record a person made.
 */
function normalizeVersion(v: unknown, index: number): AccrualVersion | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Partial<AccrualVersion>;
  const claimed = str(r.origin, 20) as DeviationOrigin;
  /* An unreadable origin reads as `original`: it is the only one of the three
     that claims nothing about who acted. */
  const origin = DEVIATION_ORIGINS.includes(claimed) ? claimed : "original";
  const reason = str(r.reason, 500);
  return {
    version:
      typeof r.version === "number" && Number.isFinite(r.version) && r.version > 0
        ? Math.round(r.version)
        : index + 1,
    origin,
    lines: dedupeLines(r.lines),
    ...(reason ? { reason } : {}),
    by: str(r.by, 80) || "Unknown",
    at: str(r.at, 40) || new Date().toISOString(),
    ...(r.inactive === true && origin === "system" ? { inactive: true } : {}),
  };
}

function normalizePlan(v: unknown): AccrualPlan | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Partial<AccrualPlan>;
  const id = str(r.id, 60);
  const opportunityId = str(r.opportunityId, 60);
  if (!id || !opportunityId) return null;
  const updatedBy = str(r.updatedBy, 80) || "Unknown";
  const updatedAt = str(r.updatedAt, 40) || new Date().toISOString();

  /* VERSIONS ARE RENUMBERED 1..N IN ORDER. The type promises contiguous
     numbering and the history table prints these; a gap could only come from a
     corrupted row, and a history that skips from 2 to 4 reads as a version
     somebody deleted. */
  const versions = (Array.isArray(r.versions) ? r.versions : [])
    .map(normalizeVersion)
    .filter((x): x is AccrualVersion => x !== null)
    .sort((a, b) => a.version - b.version)
    .map((x, i) => ({ ...x, version: i + 1 }));

  const stored = dedupeLines(r.lines);
  /* `lines` MIRRORS THE LATEST ACTIVE VERSION, enforced here the same way
     amount = ots + arr is enforced above, so the report, the editor and the
     history can never be reading three different sets of months (Suren, Sep 1:
     "when the user enters, it's always whichever is the latest active
     version").

     A plan with no stored versions keeps its lines exactly as they are: it IS
     version 1 and nothing about it is rewritten. That is the whole no-migration
     promise, and it is why `versions` is written back only when it exists. */
  const lines = versions.length
    ? latestActiveVersion({ lines: stored, versions, updatedBy, updatedAt }).lines
    : stored;

  return {
    id,
    opportunityId,
    opportunityName: str(r.opportunityName, 200),
    customer: str(r.customer, 120),
    customerId: str(r.customerId, 60) || undefined,
    offeringId: str(r.offeringId, 60) || undefined,
    offeringLabel: str(r.offeringLabel, 160) || undefined,
    contractValue: num(r.contractValue),
    signDateAtPlan: str(r.signDateAtPlan, 40) || undefined,
    lines,
    ...(versions.length ? { versions } : {}),
    note: str(r.note, 500) || undefined,
    updatedBy,
    updatedAt,
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

/**
 * MOCK IS A REAL STORE, NOT A PICTURE OF ONE (Anir, Aug 26: "all the same
 * functionality (add, edit etc.) should be on mock mode, but it shouldn't
 * affect real data"). `activeRowId()` has always pointed mock at its OWN row,
 * so a mock write could never reach real; what made it read-only was answering
 * with a fresh sample every time, so an edit had nowhere to land. The samples
 * now SEED that row once and everything after is an ordinary read. Emptying it
 * deliberately stays empty: the seed fires only when the row never existed.
 */
export async function readRevenueAccruals(): Promise<RevenueAccrualsState> {
  if (getDataMode() !== "mock") return readRow();
  const existing = await readRowRaw();
  if (existing) return normalize(existing);
  const seeded = sampleAccruals();
  await writeRow(seeded).catch(() => undefined);
  return seeded;
}

export type AccrualPlanInput = {
  opportunityId: string;
  opportunityName: string;
  customer: string;
  customerId?: string;
  offeringId?: string;
  offeringLabel?: string;
  contractValue: number;
  /* The full line, so the one-time and recurring split travels with the total
     instead of being dropped by a caller that only knows about months. */
  lines: AccrualLine[];
  note?: string;
  /** The deal's estimated sign date as it stood when this was saved, so a
   *  later change to it can be spotted. See AccrualPlan.signDateAtPlan. */
  signDateAtPlan?: string;
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
    /* SAVING IS NOT DEVIATING, and this is the line between them.

       Suren, Sep 1, drew the deviation as the thing you do to a plan that is
       already done: "Right now it's already done, and you have saved it.
       Beside this button, if he's going to change it, he has to put a button
       called Deviate." So authoring the plan is a save and it writes the
       version being edited; changing it afterwards on purpose is a Deviate and
       it appends a new one. If every save appended, the version number and the
       count of deviations would both be a count of keystrokes and neither
       would answer "who deviated".

       WHICH VERSION A SAVE WRITES: the latest ACTIVE one, never simply the
       highest ("when the user enters, it's always whichever is the latest
       active version"). A record the sweep has just touched carries a blank
       inactive version on top, and an edit routed there would land on a
       version marked expired. */
    const versions = existing?.versions;
    const target = existing ? latestActiveVersion(existing).version : 1;
    const draft = normalizePlan({
      ...input,
      ...(versions
        ? {
            versions: versions.map((v) =>
              v.version === target
                ? { ...v, lines: input.lines, by: who, at: new Date().toISOString() }
                : v
            ),
          }
        : {}),
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
 * DEVIATE A RECORD. A person pressed Deviate, adjusted the months and gave a
 * reason, and this appends the new version.
 *
 * Suren, Sep 1: "Right now it's already done, and you have saved it. Beside
 * this button, if he's going to change it, he has to put a button called
 * Deviate... The moment you do that, this record from version 1 becomes a new
 * record called version 2, and the record status becomes deviated."
 *
 * APPEND, NEVER OVERWRITE. Version 1 keeps the figures it always had. That is
 * what makes a Deviations tab possible at all, it is what lets the record's own
 * history table show "all the versions that got deviated", and it is the same
 * instinct the frozen snapshot already encodes: this module does not lose the
 * number it used to say.
 *
 * A REASON IS REQUIRED. "The two columns repeat for the deviation, and then
 * they adjust and save", with Reason the last column of his sheet. A deviation
 * nobody explained is the number that starts the argument in the meeting, and
 * the point of version one of this feature is who deviated and why.
 *
 * THE NEW VERSION MAY NAME MONTHS THE OLD ONE NEVER HAD. That is his own
 * example: "He's not putting anything in September; he puts in October,
 * November, December."
 */
export async function deviateAccrualPlan(
  opportunityId: string,
  lines: AccrualLine[],
  reason: string,
  who: string
): Promise<AccrualPlan> {
  return withWrite(async () => {
    const state = await readRow();
    const plan = state.plans.find((p) => p.opportunityId === opportunityId);
    if (!plan) throw new Error("There is no accrual plan on that deal.");
    const why = str(reason, 500);
    if (!why) throw new Error("A deviation needs a reason.");
    /* AT LEAST ONE MONTH. Deviating is an act of entering figures; a record
       with nothing entered is Non Filled, which is what you get by never
       filling it in, not by deviating to nothing. Without this a UI bug
       posting an empty array would blank the deal on every report, since the
       operative lines mirror the newest active version. */
    const months = Array.isArray(lines) ? lines : [];
    if (!months.length) throw new Error("A deviation needs at least one month.");

    const history = planVersions(plan);
    const next: AccrualVersion = {
      version: history[history.length - 1].version + 1,
      origin: "user",
      lines: months,
      reason: why,
      by: who,
      at: new Date().toISOString(),
    };
    const updated = normalizePlan({
      ...plan,
      versions: [...history, next],
      updatedBy: who,
      updatedAt: next.at,
    });
    if (!updated) throw new Error("That deviation could not be saved.");
    state.plans = state.plans.map((p) =>
      p.opportunityId === opportunityId ? updated : p
    );
    await writeRow(state);
    return updated;
  });
}

/** The deal facts the sweep judges a plan against. */
export type SweepDeal = { id: string; estSignDate?: string; status?: string };

export type SweepResult = {
  /** How many plans the button looked at. */
  scanned: number;
  /** The records it opened a blank inactive version on. */
  inactivated: { opportunityId: string; opportunityName: string; version: number }[];
};

/**
 * THE SYSTEM DEVIATION SWEEP, WHICH IS A BUTTON AND NOT A TIMER.
 *
 * Suren, Sep 1: "the system will also create a deviation by default. There will
 * be a button that you go and click on. Every time somebody comes and clicks on
 * that button, the system will go and record all the revenue and all the
 * opportunities. If the contract date is passed and the signatures have not
 * happened, then it will automatically create a new version of the record."
 *
 * A BUTTON, DELIBERATELY. Nothing in this module moves on its own; that is the
 * rule the whole thing was built to hold (Manoj, Aug 25: "if you keep pushing
 * it, then I'm off the hook, you will never catch hold of me"). A person clicks
 * and a person can be asked why.
 *
 * FILLED RECORDS ONLY: "this will only happen for filled records... non-filled
 * record system will not do anything." Which also makes the button idempotent
 * on its own: a record it has already inactivated is no longer Active and
 * Filled, so a second click passes it by.
 *
 * THE VERSION IT WRITES IS BLANK: "our system just inactivates it, don't even
 * fill. The moment that version you make it inactive because the date's
 * expired." It is a flag, not a correction, and "somebody has to go and fix
 * it" by deviating.
 *
 * THE MONEY DOES NOT MOVE. The plan's operative lines mirror the newest ACTIVE
 * version, so a blank inactive version on top changes no total anywhere. That
 * is rule 2 of this module in his own words: "it's not removing, you can
 * invalidate... but there has to be a flag which says it is not validating."
 */
export async function sweepAccrualPlans(
  deals: SweepDeal[],
  who: string
): Promise<SweepResult> {
  return withWrite(async () => {
    const state = await readRow();
    const byId = new Map(deals.map((d) => [d.id, d]));
    const at = new Date().toISOString();
    const inactivated: SweepResult["inactivated"] = [];

    state.plans = state.plans.map((plan) => {
      const history = planVersions(plan);
      const latest = history[history.length - 1];
      if (versionStatus(latest) !== "Active and Filled") return plan;
      /* THE SAME TEST THE PAGE ALREADY FLAGS WITH, not a second opinion.
         judgePlan's close_date_passed is exactly "the contract date is passed
         and the signatures have not happened": it ignores Won and Lost deals,
         because a signature is what Won means. Reusing it means the sweep and
         the flag on the opportunities page can never disagree. */
      const deal = byId.get(plan.opportunityId);
      if (!judgePlan(plan, deal).problems.includes("close_date_passed")) {
        return plan;
      }
      const next: AccrualVersion = {
        version: latest.version + 1,
        origin: "system",
        lines: [],
        by: who,
        at,
        inactive: true,
      };
      const updated = normalizePlan({
        ...plan,
        versions: [...history, next],
        /* The plan's own updatedBy is left alone: a person did not touch this
           record, and overwriting the last human edit with the name of
           whoever pressed the button would lose who actually wrote the plan.
           The version carries who ran the sweep. */
      });
      if (!updated) return plan;
      inactivated.push({
        opportunityId: plan.opportunityId,
        opportunityName: plan.opportunityName,
        version: next.version,
      });
      return updated;
    });

    if (inactivated.length) await writeRow(state);
    return { scanned: state.plans.length, inactivated };
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
