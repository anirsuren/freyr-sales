import type { Customer, Contact, PitchSession, Interaction } from "./types";

export const STAGES = [
  "Prospect",
  "Engaged",
  "Qualified",
  "Meeting Booked",
  "Closed Lost",
] as const;
export type Stage = (typeof STAGES)[number];

export const OUTCOME_TO_STAGE: Record<string, Stage> = {
  no_response: "Prospect",
  ai_call_failed: "Prospect",
  in_progress: "Engaged",
  ai_call_completed: "Meeting Booked",
  interested: "Qualified",
  meeting_booked: "Meeting Booked",
  not_interested: "Closed Lost",
};

// Reverse: dropping a card into a column logs this outcome.
export const STAGE_TO_OUTCOME: Record<Stage, string> = {
  Prospect: "no_response",
  Engaged: "in_progress",
  Qualified: "interested",
  "Meeting Booked": "meeting_booked",
  "Closed Lost": "not_interested",
};

export const STAGE_PROBABILITY: Record<Stage, number> = {
  Prospect: 0.1,
  Engaged: 0.3,
  Qualified: 0.5,
  "Meeting Booked": 0.7,
  "Closed Lost": 0,
};

// One palette for stages everywhere (leaderboard bars, donuts, value charts).
export const STAGE_COLOR: Record<Stage, string> = {
  // No gray anywhere in a graph (Suren) — Prospect gets a real teal.
  Prospect: "#14B8A6",
  Engaged: "#36A8F5",
  Qualified: "#5E5CE6",
  "Meeting Booked": "#34C759",
  "Closed Lost": "#FF3B30",
};

// The advancing (still-open) stages, in funnel order.
export const OPEN_STAGES: Stage[] = [
  "Prospect",
  "Engaged",
  "Qualified",
  "Meeting Booked",
];

export function dealValue(tier: string | null, seed?: string): number {
  const base =
    tier === "large" ? 800000 : tier === "mid" ? 350000 : tier === "small" ? 120000 : 200000;
  if (!seed) return base;
  // Deterministic ±35% spread (rounded to $5K) so the pipeline shows varied,
  // realistic figures instead of every deal landing on the same round number —
  // the same deal always shows the same value across reloads.
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const spread = ((h % 71) - 35) / 100; // -0.35 .. +0.35
  return Math.round((base * (1 + spread)) / 5000) * 5000;
}

export function formatMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1000)}K`;
  return `$${n}`;
}

export interface Deal {
  sessionId: string;
  customerId: string;
  contactId: string;
  company: string;
  sizeTier: string | null;
  contactName: string;
  title: string;
  service: string;
  value: number;
  stage: Stage;
  lastActivity: string;
  staleDays: number;
  owner: string;
  createdAt: string;
}

// Rep roster. A deal's owner is the account owner when assigned, otherwise a
// stable derived rep so "My deals / Team" filtering always has data.
export const REPS = ["Suren Dheen", "Mark Miller", "Priya Nair", "Diego Alvarez"];
export const CURRENT_REP = "Suren Dheen";

// The full sales floor (Suren: "put like 20 reps, it has to look full"). The
// first four are the real, deal-owning reps; the rest fill out the org so the
// team charts read like a real enterprise sales team rather than a demo of four.
export const SALES_TEAM = [
  "Suren Dheen",
  "Diego Alvarez",
  "Priya Nair",
  "Mark Miller",
  "Elena Rossi",
  "Marcus Chen",
  "Sofia Almeida",
  "James O'Brien",
  "Aisha Khan",
  "Tomas Becker",
  "Nina Kowalski",
  "Rajesh Patel",
  "Grace Liu",
  "Daniel Foster",
  "Yuki Tanaka",
  "Omar Haddad",
  "Clara Mendez",
  "Viktor Petrov",
  "Hannah Schmidt",
  "Leo Santos",
];

// Stable hash of a name → deterministic pseudo-random, so a rep's synthetic
// figures never change between renders (no Math.random in a server component).
function hashName(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

// A teammate's realistic quarter forecast. Reps who own real deals use those;
// everyone else gets a deterministic mock spread ($95K–$610K weighted) so the
// team charts and each rep's page are full and believable.
export function repForecast(name: string): { open: number; weighted: number; deals: number } {
  const h = hashName(name);
  // Unsigned shifts (>>>) — the hash can exceed 2^31, and a signed >> would make
  // the modulo negative, producing negative "deals" and a garbage avg (Suren
  // saw "-5 total owned").
  const weighted = 95000 + (h % 52) * 10000; // 95K … 605K, in 10K steps
  const winish = 0.28 + ((h >>> 6) % 22) / 100; // 0.28 … 0.49 realistic weight ratio
  const open = Math.round(weighted / winish);
  const deals = 3 + ((h >>> 11) % 9); // 3 … 11 open deals
  return { open, weighted, deals };
}

export type RepStat = {
  name: string;
  deals: number;
  openCount: number;
  openValue: number;
  weighted: number;
  avgDeal: number;
  qualifiedPlus: number;
  meetings: number;
  stageValues: { stage: string; color: string; count: number; value: number }[];
};

// Per-rep leaderboard stats — the four real deal-owners use their actual deals;
// the rest of the roster gets a deterministic synthetic spread. Shared by the
// Analytics leaderboard AND the Team page so the numbers can never disagree.
export function buildRepStats(deals: Deal[]): RepStat[] {
  return SALES_TEAM.map((name): RepStat => {
    const rd = deals.filter((d) => d.owner === name);
    const open = rd.filter((d) => d.stage !== "Closed Lost");
    if (rd.length > 0) {
      const openValue = open.reduce((s, d) => s + d.value, 0);
      const weighted = open.reduce(
        (s, d) => s + d.value * (STAGE_PROBABILITY[d.stage] ?? 0),
        0
      );
      return {
        name,
        deals: rd.length,
        openCount: open.length,
        openValue,
        weighted: Math.round(weighted),
        avgDeal: open.length ? Math.round(openValue / open.length) : 0,
        qualifiedPlus: rd.filter(
          (d) => d.stage === "Qualified" || d.stage === "Meeting Booked"
        ).length,
        meetings: rd.filter((d) => d.stage === "Meeting Booked").length,
        stageValues: OPEN_STAGES.map((stage) => ({
          stage,
          color: STAGE_COLOR[stage],
          count: open.filter((d) => d.stage === stage).length,
          value: open
            .filter((d) => d.stage === stage)
            .reduce((s, d) => s + d.value, 0),
        })),
      };
    }
    const synth = repForecast(name);
    const baseW = [0.34, 0.28, 0.23, 0.15];
    const offset = name.charCodeAt(0) % OPEN_STAGES.length;
    const stageValues = OPEN_STAGES.map((stage, i) => {
      const frac = baseW[(i + offset) % baseW.length] ?? 0.2;
      return {
        stage,
        color: STAGE_COLOR[stage],
        value: Math.round(synth.open * frac),
        count: Math.max(1, Math.round(synth.deals * frac)),
      };
    });
    // Open deals = the true sum of the composition graph; total owned = open +
    // a deterministic count of closed deals so owned is always ≥ open.
    const openCount = stageValues.reduce((a, s) => a + s.count, 0);
    const closedOwned = 1 + (name.charCodeAt(name.length - 1) % 4);
    const qualifiedPlus = stageValues
      .filter((s) => s.stage === "Qualified" || s.stage === "Meeting Booked")
      .reduce((a, s) => a + s.count, 0);
    return {
      name,
      deals: openCount + closedOwned,
      openCount,
      openValue: synth.open,
      weighted: synth.weighted,
      avgDeal: Math.round(synth.open / Math.max(openCount, 1)),
      qualifiedPlus,
      meetings: stageValues.find((s) => s.stage === "Meeting Booked")?.count ?? 0,
      stageValues,
    };
  }).sort((a, b) => b.openValue - a.openValue);
}

export function ownerFor(customer: Customer | undefined): string {
  if (customer?.owner) return customer.owner;
  const id = customer?.id || "";
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return REPS[h % REPS.length];
}

// A deal with no logged activity in this many days is "rotting".
export const ROTTING_DAYS = 14;

export function buildDeals(
  sessions: PitchSession[],
  customers: Customer[],
  contacts: Contact[],
  interactions: Interaction[]
): Deal[] {
  const customerById = Object.fromEntries(customers.map((c) => [c.id, c]));
  const contactById = Object.fromEntries(contacts.map((c) => [c.id, c]));

  // latest outcome + latest activity timestamp per contact
  const latestOutcome: Record<string, string> = {};
  const latestActivity: Record<string, string> = {};
  for (const i of [...interactions].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )) {
    latestOutcome[i.contact_id] = i.outcome;
    latestActivity[i.contact_id] = i.created_at;
  }

  const now = Date.now();
  return sessions.map((s) => {
    const customer = customerById[s.customer_id];
    const contact = contactById[s.contact_id];
    const outcome = latestOutcome[s.contact_id];
    const stage: Stage = outcome
      ? OUTCOME_TO_STAGE[outcome] || "Prospect"
      : "Prospect";
    const services = (s.recommended_services || []) as any[];
    const lastActivity = latestActivity[s.contact_id] || s.created_at;
    const staleDays = Math.floor(
      (now - new Date(lastActivity).getTime()) / 86400000
    );
    return {
      sessionId: s.id,
      customerId: s.customer_id,
      contactId: s.contact_id,
      company: customer?.company_name || "—",
      sizeTier: customer?.size_tier || null,
      contactName: contact?.full_name || "—",
      title: contact?.job_title || "",
      service: services[0]?.service_name || "—",
      value: dealValue(customer?.size_tier || null, s.customer_id),
      stage,
      lastActivity,
      staleDays: Math.max(0, staleDays),
      owner: ownerFor(customer),
      createdAt: s.created_at,
    };
  });
}

// A real cumulative open-pipeline curve (in $M), sampled at `points` evenly
// spaced moments from the first deal up to now. Shows how pipeline actually
// built up over the period the data covers — no hardcoded curve. The last point
// equals current open pipeline, so the chart ends on the headline number.
// `nowMs` is injected for deterministic tests.
export function pipelineGrowthSeries(
  deals: Deal[],
  _nowMs: number,
  points = 12
): number[] {
  // Cumulative open-pipeline value as each deal was added, in creation order.
  // We space the curve by deal *order* rather than wall-clock time: real books
  // cluster (one deal 60 days ago, the rest this week), and a time-linear axis
  // collapses that into a flat line with a cliff at the end — which reads as a
  // rendering glitch, not insight. Order-spacing yields an honest, steadily
  // rising curve ("pipeline built up as deals came in") that fills the width.
  const open = deals
    .filter((d) => d.stage !== "Closed Lost")
    .map((d) => ({ t: new Date(d.createdAt).getTime(), v: d.value }))
    .filter((d) => !Number.isNaN(d.t))
    .sort((a, b) => a.t - b.t);
  if (open.length === 0) return new Array(points).fill(0);

  // Running total after each deal, prefixed with a 0 baseline so the line rises
  // from the floor: [0, v0, v0+v1, …, total].
  const cum: number[] = [0];
  let run = 0;
  for (const d of open) {
    run += d.v;
    cum.push(run);
  }

  // Resample the cumulative steps to a fixed number of evenly-spaced points,
  // linearly interpolating between steps so the line stays smooth.
  const series: number[] = [];
  const lastIdx = cum.length - 1;
  for (let i = 0; i < points; i++) {
    const idx = lastIdx * (i / (points - 1));
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    const frac = idx - lo;
    const val = cum[lo] + (cum[hi] - cum[lo]) * frac;
    series.push(Math.round((val / 1e6) * 100) / 100);
  }
  return series;
}

// The WHO behind each point of `pipelineGrowthSeries` — the open deals that came
// in during each step of the curve, aligned index-for-index with that series so
// a hover on any point shows the actual deals that built the pipeline up to
// there (Suren: "every graph has to tell me who"). Uses the identical
// order-spaced sampling as the series, so bucket i sits under series point i.
export function pipelineGrowthPointDeals(
  deals: Deal[],
  points = 12
): { company: string; contact: string; value: number }[][] {
  const open = deals
    .filter((d) => d.stage !== "Closed Lost")
    .map((d) => ({ t: new Date(d.createdAt).getTime(), d }))
    .filter((x) => !Number.isNaN(x.t))
    .sort((a, b) => a.t - b.t)
    .map((x) => x.d);
  const buckets: { company: string; contact: string; value: number }[][] =
    Array.from({ length: points }, () => []);
  if (open.length === 0) return buckets;
  // `cum` in pipelineGrowthSeries has open.length + 1 entries, so lastIdx =
  // open.length — mirror it exactly so the point math lines up.
  const lastIdx = open.length;
  let prev = 0;
  for (let i = 0; i < points; i++) {
    const idx = lastIdx * (i / (points - 1));
    const hi = Math.round(idx);
    for (let k = prev; k < hi && k < open.length; k++) {
      buckets[i].push({
        company: open[k].company,
        contact: open[k].contactName,
        value: open[k].value,
      });
    }
    prev = Math.max(prev, hi);
  }
  return buckets;
}
