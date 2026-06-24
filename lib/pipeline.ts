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
  nowMs: number,
  points = 12
): number[] {
  const open = deals.filter((d) => d.stage !== "Closed Lost");
  const times = open
    .map((d) => new Date(d.createdAt).getTime())
    .filter((t) => !Number.isNaN(t));
  if (times.length === 0) return new Array(points).fill(0);
  const startMs = Math.min(...times);
  const span = Math.max(1, nowMs - startMs);
  const series: number[] = [];
  for (let i = 0; i < points; i++) {
    const t = startMs + (span * i) / (points - 1);
    const sum = open
      .filter((d) => new Date(d.createdAt).getTime() <= t)
      .reduce((s, d) => s + d.value, 0);
    series.push(Math.round((sum / 1e6) * 100) / 100);
  }
  return series;
}
