import type { LucideIcon } from "lucide-react";
import {
  BadgeCheck,
  CalendarCheck,
  MessagesSquare,
  Radar,
  XCircle,
} from "lucide-react";
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
// Stage colours re-spread across the hue wheel so no two stages read alike in
// a donut (Suren: teal vs sky vs green were indistinguishable). Amber → blue →
// violet → green → red follows the funnel from cold to won-adjacent to lost.
export const STAGE_COLOR: Record<Stage, string> = {
  // Prospect is burnt orange, not amber: forecast and account rows draw the
  // stage name AS this colour on a 8% tint, where amber was unreadable. It is
  // 20 lightness points darker than the Closed Lost red, so the two never blur.
  Prospect: "var(--ink-orange)",
  Engaged: "var(--ink-bright-blue)",
  Qualified: "var(--ink-violet-soft)",
  "Meeting Booked": "#16A34A",
  "Closed Lost": "#EF4444",
};

// Every stage carries a colour AND an icon — a stage is a status chip, and a
// status chip is never plain type on a plain background (standing rule). This
// map lives beside STAGE_COLOR so the board, the deal timeline and any future
// stage renderer read one glyph set instead of inventing their own. Funnel
// semantics: scanning → talking → verified → booked → dead.
export const STAGE_ICON: Record<Stage, LucideIcon> = {
  Prospect: Radar,
  Engaged: MessagesSquare,
  Qualified: BadgeCheck,
  "Meeting Booked": CalendarCheck,
  "Closed Lost": XCircle,
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

/**
 * MONEY, AT WHATEVER SIZE IT ARRIVES.
 *
 * This stopped at M, so anything past a billion came out as a wall of digits
 * with an M stuck on the end — $999,999,999 rendered "$1000.0M" rather than
 * "$1.0B", and a fat-fingered deal value turned the pipeline header into
 * "$1000000000012M". Forty-five files print money through here, so one of them
 * getting a number bigger than expected should not produce something nobody
 * can read.
 *
 * The tiers below are only about DISPLAY. Nothing here bounds what may be
 * stored: lib/opportunities already floors a negative or unparseable value at
 * zero, but has no ceiling, so a deal with three extra zeros is accepted and
 * swamps every rollup it touches. What the ceiling should be is a question
 * about Freyr's deals rather than about formatting, so it is not decided here.
 */
const MONEY_UNITS: { at: number; suffix: string; digits: number }[] = [
  { at: 1_000, suffix: "K", digits: 0 },
  { at: 1_000_000, suffix: "M", digits: 1 },
  { at: 1_000_000_000, suffix: "B", digits: 1 },
  { at: 1_000_000_000_000, suffix: "T", digits: 1 },
];

export function formatMoney(n: number): string {
  /* The sign belongs in front of the currency, not between it and the digits
     ("-$500", never "$-500"). */
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs < 1_000) return `${sign}$${Math.round(abs)}`;

  let i = 0;
  while (i < MONEY_UNITS.length - 1 && abs >= MONEY_UNITS[i + 1].at) i++;
  /* Rounding can carry a number into the tier above: 999,999,999 is under a
     billion, so it lands on M, and one decimal place turns 999.999999 into
     "1000.0M". Whenever that happens, print it in the next unit up. */
  if (
    Number((abs / MONEY_UNITS[i].at).toFixed(MONEY_UNITS[i].digits)) >= 1000 &&
    i < MONEY_UNITS.length - 1
  ) {
    i++;
  }
  const { at, suffix, digits } = MONEY_UNITS[i];
  return `${sign}$${(abs / at).toFixed(digits)}${suffix}`;
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
  ownerUserId?: string | null;
  createdAt: string;
}

// Demo roster used only to give ownerless mock records a stable owner. The
// signed-in person is deliberately not encoded here: "you" must always come
// from the verified session, and a new user must never inherit another user's
// identity just because they opened the same demo workspace.
export const REPS = ["Walter Hensley", "Mark Miller", "Margaret Whitfield", "Gordon Ashby"];

// The full sales floor (Suren: "put like 20 reps, it has to look full"). The
// first four are the real, deal-owning reps; the rest fill out the org so the
// team charts read like a real enterprise sales team rather than a demo of four.
export const SALES_TEAM = [
  "Walter Hensley",
  "Gordon Ashby",
  "Margaret Whitfield",
  "Mark Miller",
  "Eleanor Rutherford",
  "Marcus Bramwell",
  "Sylvia Ashcroft",
  "James O'Brien",
  "Audrey Kingsley",
  "Thomas Beckett",
  "Nancy Caldwell",
  "Russell Pemberton",
  "Grace Lockwood",
  "Daniel Foster",
  "Yvonne Thatcher",
  "Oliver Hastings",
  "Clara Middleton",
  "Victor Prescott",
  "Hannah Schmidt",
  "Leonard Stanton",
];

/** Include the verified current user in mock analytics without relabelling any
 * existing teammate or seeded record as that user. */
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

export type RepIdentity = {
  /** Stable UI/data key. Member-backed rows use app_users.id; legacy/demo rows
   * deliberately live in a separate namespace. */
  key: string;
  name: string;
  memberId: string | null;
  source: "current" | "member" | "demo" | "legacy";
  slug: string;
};

function canonicalRepName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

function legacyRepKey(name: string): string {
  return `legacy:${canonicalRepName(name).toLocaleLowerCase()}`;
}

function routeSlug(name: string, key: string): string {
  const base =
    canonicalRepName(name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "rep";
  return `${base}--${hashName(key).toString(36)}`;
}

function identity(
  nameValue: string,
  memberId: string | null,
  source: RepIdentity["source"],
  fallbackCurrentId?: string | null
): RepIdentity {
  const name = canonicalRepName(nameValue) || "Unassigned";
  const key = memberId
    ? `member:${memberId}`
    : source === "current"
      ? `current:${fallbackCurrentId || "unknown"}`
      : legacyRepKey(name);
  return {
    key,
    name,
    memberId,
    source,
    slug: routeSlug(name, key),
  };
}

/** Include the verified current member as a distinct roster entry. A matching
 * display name never replaces the seeded/demo entry: those records have no
 * stable member id and must remain separate history. */
export function salesTeamFor(currentUser?: {
  id?: string | null;
  memberId?: string | null;
  name?: string | null;
} | null): RepIdentity[] {
  const demo = SALES_TEAM.map((name) => identity(name, null, "demo"));
  const currentName = currentUser?.name?.trim();
  if (!currentName) return demo;
  return [
    identity(
      currentName,
      currentUser?.memberId?.trim() || null,
      "current",
      currentUser?.id
    ),
    ...demo,
  ];
}

/** Resolve the durable rep identity carried by a deal. Name-only records stay
 * in the legacy namespace even when a signed member later chooses that name. */
export function repIdentityForDeal(
  deal: Pick<Deal, "owner" | "ownerUserId">
): RepIdentity {
  return identity(
    deal.owner || "Unassigned",
    deal.ownerUserId?.trim() || null,
    deal.ownerUserId ? "member" : "legacy"
  );
}

export function repOwnsDeal(
  rep: Pick<RepIdentity, "key" | "memberId">,
  deal: Pick<Deal, "owner" | "ownerUserId">
): boolean {
  if (rep.memberId) {
    return !!deal.ownerUserId && deal.ownerUserId === rep.memberId;
  }
  return !deal.ownerUserId && rep.key === legacyRepKey(deal.owner || "Unassigned");
}

export function isCurrentRep(
  rep: Pick<RepIdentity, "memberId">,
  currentMemberId: string | null | undefined
): boolean {
  return (
    !!rep.memberId &&
    !!currentMemberId &&
    rep.memberId === currentMemberId
  );
}

function uniqueRepIdentities(entries: RepIdentity[]): RepIdentity[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (seen.has(entry.key)) return false;
    seen.add(entry.key);
    return true;
  });
}

/** Owner choices put the current user first. Seeded teammates are available
 * only on explicit mock surfaces, never as assignable owners in live data. */
export function repOptionsFor(
  currentUserName?: string | null,
  includeDemoTeam = false
): string[] {
  const name = currentUserName?.trim();
  if (!includeDemoTeam) return name ? [name] : [];
  return name ? [name, ...REPS.filter((rep) => rep !== name)] : [...REPS];
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
  key: string;
  name: string;
  memberId: string | null;
  source: RepIdentity["source"];
  slug: string;
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
export function buildRepStats(
  deals: Deal[],
  options: {
    rangeDays?: number;
    includeSynthetic?: boolean;
    actualOwners?: RepIdentity[];
    roster?: RepIdentity[];
  } = {}
): RepStat[] {
  const includeSynthetic = options.includeSynthetic !== false;
  const actualOwners = uniqueRepIdentities(
    options.actualOwners ?? deals.map(repIdentityForDeal)
  );
  const actualOwnerKeys = new Set(actualOwners.map((rep) => rep.key));
  const configuredRoster =
    options.roster ?? SALES_TEAM.map((name) => identity(name, null, "demo"));
  const roster = includeSynthetic
    ? uniqueRepIdentities([...configuredRoster, ...actualOwners])
    : uniqueRepIdentities([
        ...configuredRoster.filter(
          (rep) => rep.source === "current" || rep.source === "member"
        ),
        ...actualOwners,
      ]).sort((a, b) => a.name.localeCompare(b.name));

  return roster.map((rep): RepStat => {
    const name = rep.name;
    const rd = deals.filter((deal) => repOwnsDeal(rep, deal));
    const open = rd.filter((d) => d.stage !== "Closed Lost");
    if (
      rd.length > 0 ||
      actualOwnerKeys.has(rep.key) ||
      rep.source === "current" ||
      rep.source === "member"
    ) {
      const openValue = open.reduce((s, d) => s + d.value, 0);
      const weighted = open.reduce(
        (s, d) => s + d.value * (STAGE_PROBABILITY[d.stage] ?? 0),
        0
      );
      return {
        ...rep,
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
    // Mock teammates represent a full historical book. Slice that book by the
    // selected reporting window so 7D / 30D / 90D are real, stable views rather
    // than four buttons pointing at the same timeless totals.
    const h = hashName(name);
    const baseShare =
      options.rangeDays == null
        ? 1
        : options.rangeDays <= 7
          ? 0.22
          : options.rangeDays <= 30
            ? 0.56
            : 0.84;
    const jitter = options.rangeDays == null ? 0 : (((h >>> 17) % 9) - 4) / 100;
    const share = Math.max(0.08, Math.min(1, baseShare + jitter));
    const visibleOpenValue = Math.max(5000, Math.round((synth.open * share) / 5000) * 5000);
    const visibleWeighted = Math.max(1000, Math.round((synth.weighted * share) / 1000) * 1000);
    const visibleDeals = Math.max(1, Math.round(synth.deals * share));
    const baseW = [0.34, 0.28, 0.23, 0.15];
    const offset = name.charCodeAt(0) % OPEN_STAGES.length;
    const fractions = OPEN_STAGES.map((_, i) => baseW[(i + offset) % baseW.length] ?? 0.2);
    const counts = fractions.map((fraction) => Math.floor(visibleDeals * fraction));
    let countRemainder = visibleDeals - counts.reduce((sum, count) => sum + count, 0);
    for (const index of fractions
      .map((fraction, index) => ({ fraction, index }))
      .sort((a, b) => b.fraction - a.fraction)
      .map((item) => item.index)) {
      if (countRemainder <= 0) break;
      counts[index] += 1;
      countRemainder -= 1;
    }
    let allocatedValue = 0;
    const stageValues = OPEN_STAGES.map((stage, i) => {
      const frac = fractions[i];
      const value =
        i === OPEN_STAGES.length - 1
          ? visibleOpenValue - allocatedValue
          : Math.round(visibleOpenValue * frac);
      allocatedValue += value;
      return {
        stage,
        color: STAGE_COLOR[stage],
        value,
        count: counts[i],
      };
    });
    // Open deals = the true sum of the composition graph; total owned = open +
    // a deterministic count of closed deals so owned is always ≥ open.
    const openCount = stageValues.reduce((a, s) => a + s.count, 0);
    const fullClosedOwned = 1 + (name.charCodeAt(name.length - 1) % 4);
    const closedOwned = Math.max(0, Math.round(fullClosedOwned * share));
    const qualifiedPlus = stageValues
      .filter((s) => s.stage === "Qualified" || s.stage === "Meeting Booked")
      .reduce((a, s) => a + s.count, 0);
    return {
      ...rep,
      name,
      deals: openCount + closedOwned,
      openCount,
      openValue: visibleOpenValue,
      weighted: visibleWeighted,
      avgDeal: Math.round(visibleOpenValue / Math.max(openCount, 1)),
      qualifiedPlus,
      meetings: stageValues.find((s) => s.stage === "Meeting Booked")?.count ?? 0,
      stageValues,
    };
  }).sort((a, b) => b.openValue - a.openValue);
}

export function ownerFor(customer: Customer | undefined): string {
  if (customer?.owner) return customer.owner;
  const id = customer?.id || "";
  // Stable synthetic owners exist only for the explicit demo fixtures. Live or
  // newly-created accounts must remain unassigned instead of silently becoming
  // Suren's (or another seeded teammate's) account.
  if (!/^cust-\d+$/.test(id)) return "Unassigned";
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
      company: customer?.company_name || "-",
      sizeTier: customer?.size_tier || null,
      contactName: contact?.full_name || "-",
      title: contact?.job_title || "",
      service: services[0]?.service_name || "-",
      value: dealValue(customer?.size_tier || null, s.customer_id),
      stage,
      lastActivity,
      staleDays: Math.max(0, staleDays),
      owner: ownerFor(customer),
      ownerUserId: customer?.owner_user_id || null,
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

// The WHO behind each point of `pipelineGrowthSeries` — every open deal included
// in the cumulative total at that point. Returning only newly-added deals left
// interpolated points with an empty tooltip, even though the plotted value was
// meaningful. Uses the identical order-spaced sampling as the series.
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
  for (let i = 0; i < points; i++) {
    const idx = lastIdx * (i / (points - 1));
    const hi = Math.round(idx);
    for (let k = 0; k < hi && k < open.length; k++) {
      buckets[i].push({
        company: open[k].company,
        contact: open[k].contactName,
        value: open[k].value,
      });
    }
  }
  return buckets;
}

/**
 * THE REAL DEALS, IN THE SHAPE THE REST OF THIS FILE SPEAKS.
 *
 * `buildDeals` above reads PITCH SESSIONS — the original pipeline, from before
 * Opportunities existed. Every screen and every agent route still calls it, and
 * in REAL mode there are no pitch sessions at all, so all of them were quietly
 * answering with an empty pipeline. The agent said "$0 open, 0 deals" on every
 * page in the app while 103 opportunities worth $112.0M sat in the database
 * next to it (proved on Sep 4 against /api/agent/summary).
 *
 * Rather than rewrite twenty-eight call sites, this converts the real records
 * into the `Deal` shape those call sites already handle. Nothing about
 * `buildDeals` changes: mock workspaces are full of pitch sessions and keep
 * reading exactly as they did.
 */

/**
 * An opportunity status is a place in Freyr's own sales motion; a `Stage` is
 * the old five-step vocabulary the health scoring and the agent cards speak.
 * This is the translation, and it is deliberately coarse — the point is that
 * "this deal is live and somebody is working it" survives the trip, not that
 * every status gets its own bucket.
 */
const OPPORTUNITY_STATUS_TO_STAGE: Record<string, Stage> = {
  Qualify: "Qualified",
  Pilot: "Meeting Booked",
  Propose: "Meeting Booked",
  "Submitted to client": "Meeting Booked",
  "Under review": "Engaged",
  "On hold": "Engaged",
  Won: "Qualified",
  Lost: "Closed Lost",
};

type OpportunityLike = {
  id: string;
  name?: string;
  customer?: string;
  customerId?: string;
  value?: number;
  status?: string;
  level?: string;
  owner?: string;
  offeringLabels?: string[];
  createdAt?: string;
  updatedAt?: string;
};

export function dealsFromOpportunities(
  opportunities: OpportunityLike[],
  customers: Customer[]
): Deal[] {
  const byId = Object.fromEntries(customers.map((c) => [c.id, c]));
  /* Most imported deals carry the account's NAME and no id, so a lookup on id
     alone loses the customer on almost every row — and with it the owner, the
     size tier and every per-account total the agent puts on a card. */
  const byName = Object.fromEntries(
    customers.map((c) => [String(c.company_name || "").trim().toLowerCase(), c])
  );
  const now = Date.now();
  return opportunities.map((o) => {
    const customer =
      (o.customerId ? byId[o.customerId] : undefined) ??
      byName[String(o.customer || "").trim().toLowerCase()];
    const lastActivity = o.updatedAt || o.createdAt || new Date(now).toISOString();
    const staleDays = Math.floor((now - new Date(lastActivity).getTime()) / 86400000);
    return {
      /* The opportunity id, not a session id. Everything downstream treats this
         as an opaque key, and a card that links back has to land on the real
         record rather than a pitch session that does not exist. */
      sessionId: o.id,
      customerId: customer?.id ?? o.customerId ?? "",
      contactId: "",
      company: o.customer || customer?.company_name || "-",
      sizeTier: customer?.size_tier || null,
      /* An opportunity has no single contact — the people are on the account.
         Blank rather than invented: a made-up name on a real deal is worse
         than an empty one. */
      contactName: "",
      title: o.name || "",
      service: (o.offeringLabels ?? [])[0] || "-",
      value: Number(o.value) || 0,
      stage:
        OPPORTUNITY_STATUS_TO_STAGE[String(o.status ?? "")] ??
        /* No status yet is a deal nobody has moved, which is a Prospect. */
        "Prospect",
      lastActivity,
      staleDays: Math.max(0, staleDays),
      owner: o.owner || ownerFor(customer),
      ownerUserId: customer?.owner_user_id || null,
      createdAt: o.createdAt || lastActivity,
    };
  });
}
