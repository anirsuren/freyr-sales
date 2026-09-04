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
/* READ-ONLY, AND ONLY ON THE MOCK SEED PATH. The seed builds a plan per mock
   deal, so it has to ask the deals store which deals mock actually has: a plan
   pointing at a deal that does not exist joins to nothing on the dashboard,
   which is exactly what the four plans that used to live here did. */
import { readOpportunities } from "./opportunities";

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

/**
 * THE GENERATION OF THE MOCK SEED. Bump it when the seed below changes and the
 * demo row should pick the change up; see RevenueAccrualsState.seedVersion for
 * why this exists rather than the seed simply running every read.
 *
 * 1 = the four `acc-sample-*` plans (and the one-off script that wrote
 *     `mockgen-acc-*` rows beside them).
 * 2 = a plan per mock deal, with version histories and five frozen sheets.
 */
const SEED_VERSION = 2;

/** Every id the seed has ever minted, across both generations, plus the rows
 *  the standalone fill script wrote. A plan matching this is the seed's to
 *  replace; anything else was made by a person in mock and is left alone. */
const SEED_OWNED = /^(mockseed-acc-|mockgen-acc-|acc-sample-)/;

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
  const mrr = r.mrr === undefined ? undefined : num(r.mrr);
  /* A split, when present, IS the total — so a plan cannot store a total that
     disagrees with the numbers a person typed underneath it. */
  const split = ots !== undefined || arr !== undefined || mrr !== undefined;
  return {
    month: m,
    amount: split ? (ots ?? 0) + (arr ?? 0) + (mrr ?? 0) : num(r.amount),
    ...(ots === undefined ? {} : { ots }),
    ...(arr === undefined ? {} : { arr }),
    ...(mrr === undefined ? {} : { mrr }),
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
            ...(existing.mrr === undefined && line.mrr === undefined
              ? {}
              : { mrr: (existing.mrr ?? 0) + (line.mrr ?? 0) }),
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
     amount = ots + arr + mrr is enforced above, so the report, the editor and the
     history can never be reading three different sets of months (Suren, Sep 1:
     "when the user enters, it's always whichever is the latest active
     version").

     A plan with no stored versions keeps its lines exactly as they are: it IS
     version 1 and nothing about it is rewritten. That is the whole no-migration
     promise, and it is why `versions` is written back only when it exists. */
  /**
   * ITEM 19 REVERSES WHAT THIS USED TO DO, AND THE REVERSAL IS THE POINT.
   *
   * Manoj's change sheet: "System should remove all entries in the Revenue
   * Accrual Schedule if the Expected to Sign Date is passed. Show those
   * respective entries as Inactive in Deviation tab."
   *
   * Suren said the opposite on Sep 1, and his words are two paragraphs up:
   * "it's not removing, you can invalidate... but there has to be a flag which
   * says it is not validating and you go and fix it." So the sweep opened a
   * blank inactive version, `latestActiveVersion` skipped past it, and the
   * money stayed on every report until a human fixed it.
   *
   * Manoj wants the money gone. When the NEWEST version is the system's own
   * inactive one, the schedule now reads empty — the report stops carrying a
   * plan whose sign date has passed unsigned.
   *
   * NOTHING IS DESTROYED. The previous version keeps its months in
   * `versions`, the Deviations tab shows the record as Inactive with its full
   * history, and filling the record in again clears the flag. So "removed"
   * means removed from every forward total, not erased.
   */
  const newest = versions.length ? versions[versions.length - 1] : null;
  const expiredUnsigned = !!newest?.inactive;
  const lines = !versions.length
    ? stored
    : expiredUnsigned
      ? []
      : latestActiveVersion({ lines: stored, versions, updatedBy, updatedAt }).lines;

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
    /* CARRIED THROUGH EVERY WRITE. Normalising is what every save round-trips
       the row through, so dropping this here would erase the seed marker the
       first time somebody edited a mock plan, and the next read would top the
       row up all over again on top of their edit. */
    ...(typeof raw.seedVersion === "number" && Number.isFinite(raw.seedVersion)
      ? { seedVersion: Math.round(raw.seedVersion) }
      : {}),
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

/**
 * THE MOCK SEED. Anir, Sep 2: "i need there to be hundreds of data points in
 * total down every rabbit hole for every single page so in mock mode ppl can
 * see exactly how it will look... there should be so many data points for
 * every single thing it shouldnt even matter."
 *
 * WHAT THIS REPLACED, AND WHY IT HAD TO MOVE INTO THE CODE. Four sample plans
 * lived here, written against `opp-sample-1..4` — deals that exist in no mode,
 * so every one of them was an orphan the dashboard could not join to anything.
 * The volume that is actually in the demo row today came from a one-off script
 * (scripts/mock/fill-deal-connections.ts) that somebody had to remember to
 * run: uniform, every plan a single version, so the version history, the
 * status chip and the month-on-month gap all demoed empty. A seed that only
 * exists in a database is a seed that is one wiped row away from an empty
 * showroom.
 *
 * SO EVERY PLAN HERE HANGS OFF A DEAL THAT REALLY IS IN MOCK, and takes its
 * money, its customer, its offering and its months from that deal rather than
 * inventing a second set of facts beside it.
 *
 * DETERMINISTIC, NEVER RANDOM. Every choice below is a function of the deal's
 * own id, so two reads of this page agree and a reload reshuffles nothing.
 */

/**
 * FNV-1a over the deal id. The one source of every choice made below.
 *
 * READ THE BITS WITH `>>>`, NEVER `>>`. This returns a full 32-bit number, and
 * a signed shift on one above 2^31 lands NEGATIVE — so `(h >> 11) % 100` is
 * negative half the time and indexes an array off its front. Caught here on
 * Sep 2: two thirds of the seeded plans silently skipped their deviations and
 * some picked an undefined month count.
 */
function seedHash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** The mock sales cast, the same names the rest of the demo already uses — a
 *  showroom full of people who appear nowhere else reads as broken. */
const SEED_PLANNERS = [
  "Elena Rossi",
  "Marcus Chen",
  "Priya Raman",
  "Tom Baker",
  "Nina Kowalski",
  "Grace Liu",
];

/**
 * WHY SOMEBODY RE-PLANNED. A deviation without a reason is refused by
 * deviateAccrualPlan, and a demo full of "updated" tells a reader nothing.
 * These are the sentences a regulatory sales team actually writes.
 */
const SEED_SLIP_REASONS = [
  "Legal review slipped, signature now expected a month later.",
  "Procurement pushed the PO into the next quarter.",
  "Their reorganisation put the sponsor out until next month.",
  "Pilot extended by four weeks at the customer's request.",
  "Waiting on the master services agreement to be countersigned.",
];
const SEED_RESCOPE_REASONS = [
  "Scope cut to two markets, value re-spread over the shorter term.",
  "They added a third market, so the monthly figure goes up.",
  "Renewal agreed at a lower run rate than the original plan.",
  "Second phase pulled forward, months re-cut against the new start.",
  "Rate card revised at contract stage, months restated.",
];

/** A version's timestamp, so the frozen sheets below have real history to
 *  photograph. Months chosen so each snapshot catches a different version. */
function seedStamp(month: string, h: number): string {
  const day = String(3 + (h % 22)).padStart(2, "0");
  return `${month}-${day}T09:00:00.000Z`;
}

/** Every month moved forward by `by`, the amounts untouched — a slip, which is
 *  the single case Suren named: money "not closed in July and now spilling
 *  into August". Nothing is lost, so the total does not change. */
function seedSlip(lines: AccrualLine[], by: number): AccrualLine[] {
  return lines.map((l) => {
    const [y, m] = l.month.split("-").map(Number);
    return { ...l, month: monthKey(new Date(Date.UTC(y, m - 1 + by, 1))) };
  });
}

/** Re-scoped: every month scaled, and one more month added on the end so the
 *  revised version names a month the original never had. */
function seedRescope(lines: AccrualLine[], factor: number): AccrualLine[] {
  const scaled = lines.map((l) => {
    const amount = Math.round(l.amount * factor);
    return {
      ...l,
      amount,
      ...(l.ots === undefined ? {} : { ots: Math.round(l.ots * factor) }),
      ...(l.arr === undefined
        ? {}
        : { arr: amount - Math.round((l.ots ?? 0) * factor) }),
    };
  });
  const last = scaled[scaled.length - 1];
  if (!last) return scaled;
  const [y, m] = last.month.split("-").map(Number);
  return [
    ...scaled,
    { month: monthKey(new Date(Date.UTC(y, m, 1))), amount: last.amount },
  ];
}

/**
 * ONE-TIME AND RECURRING, SPLIT ON SOME PLANS AND NOT OTHERS (Suren, Sep 1:
 * "OTS amount in USD, ARR amount in USD... and then you can have a total
 * column"). Leaving the split off some plans is deliberate: the columns are
 * optional and additive, and a demo where every row carries them would not
 * show what a plan written without them looks like.
 */
function seedSplit(lines: AccrualLine[], kind: number): AccrualLine[] {
  if (kind === 0) return lines;
  if (kind === 1) {
    /* The classic shape: the one-time fee lands with the first invoice and the
       subscription runs behind it. */
    return lines.map((l, i) =>
      i === 0
        ? { ...l, ots: l.amount, arr: 0 }
        : { ...l, ots: 0, arr: l.amount }
    );
  }
  return lines.map((l) => {
    const ots = Math.round(l.amount * 0.3);
    return { ...l, ots, arr: l.amount - ots };
  });
}

/** The deal facts an accrual plan is built from. */
type SeedDeal = {
  id: string;
  name: string;
  customer: string;
  customerId?: string;
  offeringId?: string;
  offeringLabel?: string;
  value: number;
  estSignDate?: string;
  status?: string;
};

/**
 * BUILD ONE PLAN, OR DECIDE THIS DEAL HAS NONE.
 *
 * Not every deal gets one, on purpose. "Deals with money but no plan" is a
 * real state and the section of the page that says so has to have something in
 * it, or the demo shows a workspace where nobody is ever behind.
 */
function seedPlan(deal: SeedDeal, now: string): AccrualPlan | null {
  const h = seedHash(deal.id);
  const bucket = h % 100;
  if (deal.value <= 0) return null;
  /* About a seventh of the pipeline has nobody's numbers on it yet. */
  if (bucket < 15) return null;

  const signMonth = deal.estSignDate ? monthKey(deal.estSignDate) : "";
  /* MONTHS THAT ARE PLAUSIBLE AGAINST THE DEAL. Revenue starts accruing the
     month the deal is expected to sign; a plan whose months have no relation
     to the sign date is the fiction this module exists to catch. */
  const start = signMonth || monthsFrom("2026-10", 6)[h % 6];
  const months = [3, 4, 6, 6, 9, 12, 12, 18][(h >>> 3) % 8];

  /* A LAID-OUT PLAN WITH NO FIGURES IN IT — Suren's "non filled": "nobody has
     entered accruals against it". Its contract value is left at zero because a
     plan claiming a figure it has not spread would be flagged as not adding
     up, which is a different complaint than nobody having filled it in. */
  const emptyRecord = bucket < 20;
  const value = emptyRecord ? 0 : deal.value;
  const original = seedSplit(
    spreadEvenly(value, start, months),
    emptyRecord ? 0 : (h >>> 6) % 3
  );

  /* THE SIGN DATE THE PLAN WAS BUILT AGAINST. Usually the deal's own, so the
     flag stays quiet; on about one plan in eleven the date has moved a month
     since, which is exactly the case Suren asked to be caught ("if somebody
     comes in and changes the contract sign date, then his whole plan is
     wrong"). */
  const dateMoved = !emptyRecord && h % 11 === 0 && !!deal.estSignDate;
  const signDateAtPlan = deal.estSignDate
    ? dateMoved
      ? monthKey(new Date(Date.UTC(
          Number(signMonth.slice(0, 4)),
          Number(signMonth.slice(5, 7)) - 2,
          1
        ))) + "-12"
      : deal.estSignDate
    : undefined;

  const by = SEED_PLANNERS[h % SEED_PLANNERS.length];
  const versions: AccrualVersion[] = [
    {
      version: 1,
      origin: "original",
      lines: original,
      by,
      at: seedStamp("2026-02", h),
    },
  ];

  /* WHAT HAPPENED TO THIS PLAN SINCE. Most were written once and left alone;
     some were re-planned once, a few twice, and a few were caught by the
     signing-date sweep. Everything below appends — version 1 keeps the figures
     it always had, which is the only reason a variance exists to report. */
  const story = emptyRecord ? 0 : (h >>> 11) % 100;
  const closeMonthPassed = !!signMonth && signMonth < "2026-09";

  if (story >= 55 && story < 90) {
    versions.push({
      version: 2,
      origin: "user",
      lines: seedSlip(original, 1 + ((h >>> 17) % 3)),
      reason: SEED_SLIP_REASONS[h % SEED_SLIP_REASONS.length],
      by: SEED_PLANNERS[(h + 2) % SEED_PLANNERS.length],
      at: seedStamp("2026-06", h),
    });
  }
  if (story >= 78 && story < 90) {
    const previous = versions[versions.length - 1].lines;
    /* HALF OF THESE ARE A PURE SLIP AND HALF A RE-SCOPE, because the month-on
       month report tells them apart and the slip is the case Suren actually
       named: money "not closed in July and now spilling into August" moves
       between months without the total changing at all, so a report ranked on
       the net would bury it. A demo where every deviation also changed the
       total never shows that row. */
    const slips = (h >>> 21) % 2 === 0;
    versions.push({
      version: versions.length + 1,
      origin: "user",
      lines: slips
        ? seedSlip(previous, 1 + ((h >>> 19) % 2))
        : seedRescope(previous, [0.8, 1.15, 0.92, 1.3][(h >>> 23) % 4]),
      reason: slips
        ? SEED_SLIP_REASONS[(h >>> 9) % SEED_SLIP_REASONS.length]
        : SEED_RESCOPE_REASONS[(h >>> 5) % SEED_RESCOPE_REASONS.length],
      by: SEED_PLANNERS[(h + 4) % SEED_PLANNERS.length],
      /* AFTER THE LAST FROZEN SHEET, deliberately. The month-on-month gap
         compares today's plans against August's sheet, and a demo where every
         deviation predates the freeze has an empty gap report. */
      at: seedStamp("2026-09", h),
    });
  }
  /* THE SWEEP ONLY EVER TOUCHES A DEAL WHOSE SIGN DATE HAS PASSED UNSIGNED
     (Suren, Sep 1), so a seeded inactive version is only written where the
     button would really have written one. Blank, because "our system just
     inactivates it, don't even fill".
     THE DATE IS THE GATE AND THE ROLL ONLY THINS IT, rather than the other way
     round: gating on the roll first left two Inactive records in the whole
     demo, because almost every deal in the mock pipeline signs in the future.
     Most of the handful whose date really has gone by have been swept, which
     is what a workspace where somebody presses the button looks like. */
  const swept = !emptyRecord && (h >>> 25) % 5 < 3;
  if (swept && closeMonthPassed && deal.status !== "Won" && deal.status !== "Lost") {
    versions.push({
      version: versions.length + 1,
      origin: "system",
      lines: [],
      by: "Signing-date check",
      at: seedStamp("2026-09", h),
      inactive: true,
    });
  }

  const last = versions[versions.length - 1];
  return {
    id: `mockseed-acc-${deal.id}`,
    opportunityId: deal.id,
    opportunityName: deal.name,
    customer: deal.customer,
    ...(deal.customerId ? { customerId: deal.customerId } : {}),
    ...(deal.offeringId ? { offeringId: deal.offeringId } : {}),
    ...(deal.offeringLabel ? { offeringLabel: deal.offeringLabel } : {}),
    contractValue: value,
    ...(signDateAtPlan ? { signDateAtPlan } : {}),
    /* Mirrors the latest ACTIVE version, exactly as normalizePlan enforces. */
    lines: [...versions].reverse().find((v) => !v.inactive)?.lines ?? original,
    versions,
    ...(bucket >= 20 && bucket < 26
      ? { note: "Split invoicing agreed with their finance team." }
      : {}),
    updatedBy: last.origin === "system" ? by : last.by,
    updatedAt: last.at > now ? now : last.at,
  };
}

/**
 * THE FROZEN SHEETS. Five of them, one per month, each holding what every plan
 * SAID at the end of that month rather than a second invented set of figures:
 * for each plan, the last version written before the sheet was taken.
 *
 * That is what makes the month-on-month gap honest here. A deviation stamped
 * in June is inside July's sheet and outside April's, so the gap between any
 * two sheets is exactly the re-planning that happened between them, and the
 * deals the report names are the deals that really moved.
 */
function seedSnapshots(plans: AccrualPlan[]): AccrualSnapshot[] {
  /* THREE, NOT A YEAR OF THEM. Only the newest sheet before this month is ever
     read, and each one photographs every plan — five of them doubled the size
     of a row that is read, modified and written back on every single save. */
  const months = ["2026-06", "2026-07", "2026-08"];
  return months.map((id) => {
    const [y, m] = id.split("-").map(Number);
    const takenAt = new Date(Date.UTC(y, m, 0, 18, 0, 0)).toISOString();
    return {
      id,
      takenAt,
      takenBy: "Elena Rossi",
      rows: plans
        .map((p) => {
          const asOf = [...planVersions(p)]
            .filter((v) => v.at <= takenAt)
            .reverse()
            .find((v) => !v.inactive);
          if (!asOf || !asOf.lines.length) return null;
          return {
            opportunityId: p.opportunityId,
            opportunityName: p.opportunityName,
            customer: p.customer,
            byMonth: Object.fromEntries(
              asOf.lines.map((l) => [l.month, l.amount])
            ),
          };
        })
        .filter((r): r is AccrualSnapshot["rows"][number] => r !== null),
    };
  });
}

/**
 * EVERY MOCK DEAL, TURNED INTO A PLAN OR DELIBERATELY LEFT WITHOUT ONE.
 *
 * The deals come from the opportunities store rather than from a list copied
 * in here, so a plan can never point at a deal that is not in mock and the
 * money on a plan is always the money on its deal. It reads mock's own deals
 * because this whole function only ever runs behind the mock check in
 * readRevenueAccruals.
 */
async function sampleAccruals(): Promise<RevenueAccrualsState> {
  const now = new Date().toISOString();
  const opportunities = await readOpportunities()
    .then((s) => s.opportunities)
    .catch(() => []);
  const plans: AccrualPlan[] = [];
  for (const o of opportunities) {
    const line = (o.lines ?? [])[0];
    const plan = seedPlan(
      {
        id: o.id,
        name: o.name || `${o.customer} deal`,
        customer: o.customer,
        customerId: o.customerId,
        offeringId: line?.offeringId ?? o.offeringIds?.[0],
        offeringLabel: line?.offeringLabel ?? o.offeringLabels?.[0],
        value: o.value ?? 0,
        estSignDate: line?.estSignDate ?? o.estSignDate,
        status: o.status,
      },
      now
    );
    if (plan) plans.push(plan);
  }
  return { plans, snapshots: seedSnapshots(plans), seedVersion: SEED_VERSION };
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
  if (!existing) {
    const seeded = await sampleAccruals();
    await writeRow(seeded).catch(() => undefined);
    return seeded;
  }
  const state = normalize(existing);
  if (state.seedVersion === SEED_VERSION) return state;

  /* A ROW BUILT BY AN OLDER SEED, TOPPED UP ONCE.
     Everything the seed has ever owned is replaced; everything a person made
     in mock is keyed by uid() and is not in that list, so it comes through
     untouched — and so does any deal they planned by hand, because a rebuilt
     seed plan is dropped rather than allowed to become a second plan on a deal
     somebody has already planned. One plan per deal, ever.
     Frozen sheets are keyed by month: the seed's five months are replaced and
     any month a person froze themselves is kept. */
  const kept = state.plans.filter((p) => !SEED_OWNED.test(p.id));
  const claimed = new Set(kept.map((p) => p.opportunityId));
  const fresh = await sampleAccruals();
  const seedMonths = new Set(fresh.snapshots.map((s) => s.id));
  const merged: RevenueAccrualsState = {
    plans: [...kept, ...fresh.plans.filter((p) => !claimed.has(p.opportunityId))],
    snapshots: [
      ...state.snapshots.filter((s) => !seedMonths.has(s.id)),
      ...fresh.snapshots,
    ].sort((a, b) => a.id.localeCompare(b.id)),
    seedVersion: SEED_VERSION,
  };
  await writeRow(merged).catch(() => undefined);
  return merged;
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
