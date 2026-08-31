import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { OFFERING_CATALOGUE_ORDER } from "./offeringCatalogue";
import { dirname, join } from "path";
import { v4 as uuidv4 } from "uuid";
import { MOCK_PITCHES, MOCK_MATCHING_OUTPUT, MOCK_FREYR_KB } from "./claude";
import { buildAccountPitch } from "./pitch";
import { MOCK_FREYR_CRAWL_PAGES } from "./firecrawl";
import type {
  Customer,
  Contact,
  PitchSession,
  Interaction,
  FreyrKb,
  AgentRun,
  SequenceEnrollment,
  AgentPrefs,
  DraftSnippet,
  AgentChatMessage,
  Outcome,
  WorkspaceMemberScope,
} from "./types";

// ---------------------------------------------------------------------------
// In-memory store. Stashed on globalThis so it survives Next.js dev HMR and is
// shared across every route handler in the same Node process.
// ---------------------------------------------------------------------------
interface MockStore {
  customers: Customer[];
  contacts: Contact[];
  pitchSessions: PitchSession[];
  interactions: Interaction[];
  agentRuns: AgentRun[];
  sequenceEnrollments: SequenceEnrollment[];
  agentPrefs: ScopedAgentPrefs[];
  draftSnippets: ScopedDraftSnippet[];
  agentChats: ScopedAgentChatMessage[];
  freyrKb: FreyrKb;
}

type ScopeColumns = {
  workspace_id: string;
  user_id: string;
};
type ScopedAgentPrefs = AgentPrefs & ScopeColumns;
type ScopedDraftSnippet = DraftSnippet & ScopeColumns;
type ScopedAgentChatMessage = AgentChatMessage & ScopeColumns;

declare global {
  // eslint-disable-next-line no-var
  var __FREYR_MOCK_STORE__: MockStore | undefined;
}

/**
 * Which FDL components a showroom account runs, and on which version.
 * Deterministic from the account number so the demo never shuffles, and
 * pinned to the demo component/release ids seeded in lib/offerings.
 */
/** Every showroom component an account can be running. The demo fourteen plus
 *  the showroom catalogue in lib/offerings — without the second set, 140
 *  accounts shared fourteen components between them and every Digital
 *  components tab looked like the last one. */
const DEMO_ESTATE_IDS = [
  ...Array.from(
    { length: 14 },
    (_, i) => `fdl-demo-${String(i + 1).padStart(3, "0")}`
  ),
  /* 54 = showroomFdlBlueprints() in lib/offerings. Kept as a literal because
     importing that module here would drag the whole offerings catalogue into
     the store; an id that ever fell out of step simply renders no row, since
     the components tab skips a link whose component it cannot find. */
  ...Array.from(
    { length: 54 },
    (_, i) => `fdl-show-${String(i + 1).padStart(3, "0")}`
  ),
];

function demoComponentLinks(accountId: string) {
  const n = Number(accountId.replace(/\D/g, "")) || 1;
  const pick = (offset: number) =>
    DEMO_ESTATE_IDS[(n * 3 + offset) % DEMO_ESTATE_IDS.length]!;
  const ids = Array.from(new Set([pick(0), pick(5), pick(9), ...(n % 2 ? [pick(11)] : [])]));
  return ids.map((component_id, index) => ({
    component_id,
    /* -r1 always exists; a computed -r2/-r3 did not on the many showroom
       components that ship a single release, and those rows rendered "None
       yet" against a component that plainly has a version. Sitting on the
       first release also keeps the "a newer version is out" nudge, because
       anything with more than one release is now behind by definition. */
    release_id: `${component_id}-r1`,
    next_release_id: (n + index) % 2 === 0 ? `${component_id}-r2` : null,
    notes: null,
  }));
}

/**
 * THE IDENTITY OF A GENERATED CONTACT, DERIVED IN ONE PLACE.
 *
 * The long-tail accounts, their people and their company names are built from
 * these lists. lib/voice seeds calls against the same contacts and has to
 * print the same names on them: a call row reading "Lena Vogt" that links to
 * a contact page showing somebody else is worse than no call at all. Hoisted
 * out of seed() and exported so there is one derivation, not two that drift.
 */
const FILL_STEMS = [
    "Aventis", "Belmara", "Calyx", "Dornier", "Eryx", "Fennec", "Girona",
    "Halcyon", "Ionis", "Juniper", "Kestrel", "Lumen", "Marisol", "Nyxis",
    "Orbis", "Pallas", "Quarry", "Rivenna", "Sable", "Tessera", "Umbra",
    "Verdant", "Wexford", "Xantha", "Ymir", "Zephyra", "Altamira", "Borealis",
    "Cinder", "Delphi", "Ember", "Fjord", "Granite", "Harrow", "Isolde",
  ];
const FILL_SUFFIX = [
    "Biopharma", "Therapeutics", "Biosciences", "Labs", "Pharma",
    "Medical", "Health", "Diagnostics", "Bio", "Sciences",
  ];
const FILL_FIRST = [
    "Lena", "Owen", "Priya", "Tomas", "Ana", "Marco", "Yuki", "Ruth", "Hannah",
    "Diego", "Farida", "Karl", "Meera", "Jonas", "Chiara", "Samuel", "Aisha",
    "Viktor", "Noor", "Erik", "Camila", "Ibrahim", "Sofia", "Liam", "Nadia",
    "Pavel", "Zara", "Mateo", "Ingrid", "Rohan",
  ];
const FILL_LAST = [
    "Vogt", "Bradley", "Nair", "Lindqvist", "Sousa", "Bianchi", "Tanaka",
    "Okafor", "Weiss", "Moreno", "Jensen", "Iyer", "Berg", "Ricci", "Adeyemi",
    "Khan", "Petrov", "Rahman", "Larsen", "Duarte", "Cisse", "Marchetti",
    "Doyle", "Nowak", "Fischer", "Almeida", "Kaur", "Nakamura", "Olsen", "Ruiz",
  ];

const fillAt = <T,>(list: T[], n: number): T => list[n % list.length]!;

/** `account` is 1-based (cust-fill-001 is account 1); `slot` is 0-4. */
export function mockFillContact(account: number, slot: number) {
  const i = account - 1;
  const company = `${fillAt(FILL_STEMS, i)} ${fillAt(FILL_SUFFIX, i * 3 + 1)}`;
  return {
    id: `cont-fill-${String(account).padStart(3, "0")}-${slot + 1}`,
    name: `${fillAt(FILL_FIRST, i * 5 + slot)} ${fillAt(FILL_LAST, i * 7 + slot * 3)}`,
    company,
  };
}

function seed(): MockStore {
  const customers: Customer[] = [
    {
      id: "cust-001",
      company_name: "BioNex Therapeutics",
      website_url: "https://bionextherapeutics.com",
      size_tier: "mid",
      industry: "Biotechnology",
      geography:
        "United States (Princeton, NJ): offices in London, Singapore",
      enrichment_summary:
        "Mid-size clinical-stage biopharma, ~450 employees, Series D, 3 Phase 2 compounds + 1 NDA-ready. Focus on biologics for oncology and autoimmune. Working across FDA and EMA.",
      created_at: new Date("2025-11-15").toISOString(),
      last_enriched_at: new Date("2025-11-15").toISOString(),
      customer_type: "Biologics - Mid size",
      ownership: "Private",
      revenue: "$1.4B",
      analyzed_at: new Date("2025-11-15").toISOString(),
    },
    {
      id: "cust-002",
      company_name: "Indavel Pharma",
      website_url: "https://indavelpharma.com",
      size_tier: "small",
      industry: "Pharmaceutical",
      geography: "India (Mumbai): expanding to EU",
      enrichment_summary:
        "Small generic pharma company, ~80 employees, focused on ANDA filings for US market entry. First-time FDA submitter.",
      created_at: new Date("2025-12-01").toISOString(),
      last_enriched_at: new Date("2025-12-01").toISOString(),
      customer_type: "Pharmaceutical - Small",
      ownership: "Private",
      revenue: "$180M",
      analyzed_at: new Date("2025-12-01").toISOString(),
    },
  ];

  const contacts: Contact[] = [
    {
      id: "cont-001",
      customer_id: "cust-001",
      full_name: "Dr. Patricia Mayhew",
      email: "p.mehta@bionextherapeutics.com",
      linkedin_url: "https://linkedin.com/in/drpriyamehta",
      phone: "+1 (617) 424-9903",
      job_title: "VP Regulatory Affairs",
      role_bucket: "Regulatory Affairs",
      career_summary:
        "Former FDA CDER reviewer. 20+ years in regulatory. Led 12 NDA/MAA approvals. Deep biologics expertise.",
      enrichment_summary:
        "Senior RA decision-maker with FDA insider background. Will respond to data-driven, peer-level conversations. Avoid overselling.",
      raw_linkedin_data: {
        about:
          "20+ years leading regulatory strategy for complex biologics and small molecules across US, EU, and emerging markets. Led 12 successful NDA/MAA approvals. Former FDA reviewer.",
        experience: [
          {
            title: "VP Regulatory Affairs",
            company: "BioNex Therapeutics",
            duration: "2019. Present",
            description:
              "Leading global regulatory strategy for a pipeline of 8 biologics and 3 small molecules.",
          },
          {
            title: "Director, Regulatory Affairs",
            company: "Novartis",
            duration: "2014-2019",
          },
          {
            title: "Regulatory Reviewer",
            company: "US FDA (CDER)",
            duration: "2008-2014",
          },
        ],
        skills: [
          "Regulatory Strategy",
          "FDA Submissions",
          "CTD Dossiers",
          "Biologics",
          "CMC",
          "Clinical Regulatory",
          "EMA",
          "CDSCO",
        ],
      },
      created_at: new Date("2025-11-15").toISOString(),
      last_enriched_at: new Date("2025-11-15").toISOString(),
    },
  ];

  // Seed "now" — anchored to TODAY (noon UTC at seed time), not a hardcoded
  // date, so the demo never ages: a pinned date silently drifts from real time,
  // which made "this week" windows (weekly review, agent activity) go empty and
  // every account's last touch look weeks old once real time moved past the pin.
  // Live windows (notifications, pipeline staleness, the review's 7-day cut) all
  // use real `Date.now()`, so anchoring here keeps the seed aligned with them and
  // every relative date current whenever Suren opens it. Defined here (not
  // further down) so the hardcoded BioNex / cont-001 session + interaction below
  // can be dated relative to it too.
  const _t = new Date();
  const NOW = Date.UTC(_t.getUTCFullYear(), _t.getUTCMonth(), _t.getUTCDate(), 12, 0, 0);
  const iso = (daysAgo: number) =>
    new Date(NOW - daysAgo * 86400000).toISOString();

  // Same day, but a believable business-hours time-of-day derived from a seed —
  // so the Activity feed doesn't show every single event logged at 8:00 AM
  // (which reads as fake). Deterministic, so it's stable across reloads.
  const isoAt = (daysAgo: number, seedStr: string) => {
    let h = 0;
    for (const ch of seedStr) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const hour = 13 + (h % 8); // 13–20 UTC ≈ 9am–4pm ET, spread across the day
    const minute = (((h ^ (h >>> 13)) >>> 0) % 60); // xorshift so minutes spread
    const d = new Date(NOW - daysAgo * 86400000);
    d.setUTCHours(hour, minute, 0, 0);
    return d.toISOString();
  };

  const pitchSessions: PitchSession[] = [
    {
      id: "sess-001",
      customer_id: "cust-001",
      contact_id: "cont-001",
      kb_version: 1,
      recommended_services: MOCK_MATCHING_OUTPUT.recommended_services,
      pitch_email: MOCK_PITCHES.pitch_email,
      pitch_5min_script: MOCK_PITCHES.pitch_5min_script,
      pitch_call_script: MOCK_PITCHES.pitch_call_script,
      additional_context:
        "Met at DIA Annual Meeting. She mentioned their NDA timeline is tight.",
      created_at: iso(6),
    },
  ];

  const interactions: Interaction[] = [
    {
      id: "int-001",
      pitch_session_id: "sess-001",
      customer_id: "cust-001",
      contact_id: "cont-001",
      outcome: "in_progress",
      notes:
        "Had intro call. She is interested in CTD dossier support. Sending proposal next week.",
      // Relative to NOW so the contact reads as freshly worked: contacted a few
      // days ago, with a comfortably-upcoming follow-up (~3 weeks out so it
      // stays in the future as the demo date drifts) — not months overdue.
      follow_up_date: iso(-21).slice(0, 10),
      logged_by: "Walter Hensley",
      created_at: isoAt(5, "int-001"),
    },
  ];

  // ---- Extended book of business so every screen reflects a living pipeline ----
  // domain/handle from a company or person name. No length cap — a 16-char
  // slice was truncating real names mid-word into broken domains like
  // "novagenetherapeu.com" / "northwindbioscie.com", which read as fake.
  const slug = (s: string) =>
    s.toLowerCase().replace(/[^a-z]+/g, "");

  // Deterministic US phone from a seed so every contact has a real-looking
  // number (Suren: "how do these contacts not have phone numbers?"). Stable
  // across reloads, and never generates a 555/000 area code.
  const mockPhone = (seedStr: string) => {
    let h = 0;
    for (const ch of seedStr) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const area = 201 + (h % 799);
    const mid = 200 + ((h >> 4) % 800);
    const last = h % 10000;
    return `+1 (${area}) ${String(mid).padStart(3, "0")}-${String(last).padStart(4, "0")}`;
  };

  type Spec = {
    id: string;
    company: string;
    size: "small" | "mid" | "large";
    industry: string;
    geo: string;
    csum: string;
    contact: string;
    title: string;
    role: string;
    csumc: string;
    service: string;
    score: number;
    outcome: Interaction["outcome"] | null;
    days: number;
    note?: string;
    follow?: number;
    review?: PitchSession["review_status"];
    // Adoption-story fields (Suren's customer⇄offering link): a classified
    // customer with offerings already in use demos the Offerings tab on open.
    ctype?: string;
    own?: string;
    rev?: string;
    inUse?: string[];
    // Commercial detail per in-use offering (Suren's Jul 5 dictation) — seeds
    // the revenue lines + the offering Reports tab (revenue across customers).
    usage?: import("./types").OfferingUsage[];
  };

  const specs: Spec[] = [
    { id: "003", company: "Cortexa Biopharma", size: "mid", industry: "Biotechnology", geo: "United States (Boston, MA)", csum: "Clinical-stage neuro biotech, ~300 staff, two Phase 2 CNS assets, first EMA filing planned.", contact: "Marcus Thorne", title: "Head of CMC", role: "Quality Assurance", csumc: "15 yrs CMC across biologics; owns dossier technical writing.", service: "NDA/MAA CMC Writing", score: 9, outcome: "interested", days: 6, note: "Keen on CTD/CMC support for the EMA filing.", follow: 5, review: "in_review" },
    { id: "004", company: "Helix Biologics", size: "large", industry: "Pharmaceutical", geo: "United Kingdom (Cambridge)", csum: "Top-20 pharma, global biologics portfolio, simultaneous FDA/EMA/PMDA programs.", contact: "Dr. Lena Vogt", title: "SVP Global Regulatory", role: "Executive", csumc: "Former EMA assessor; runs a 60-person global RA org.", service: "Global Labeling Strategy", score: 8, outcome: "meeting_booked", days: 3, note: "Booked exec briefing for next Thursday.", follow: 7, ctype: "Pharmaceutical - Large", own: "Public", rev: "$8.2B", inUse: ["of-001", "of-023"], usage: [
      { offering_id: "of-001", revenue_lines: [
        { id: "rev-h1", revenue_type: "license", amount: 480000, num_licenses: 60, start_date: "2026-01-01", end_date: "2026-12-31", description: "Freya.Register seats across the global RA org." },
        { id: "rev-h2", revenue_type: "project", amount: 220000, num_licenses: null, start_date: "2026-02-01", end_date: "2026-08-31", description: "Registration data migration & implementation project." },
      ] },
      { offering_id: "of-023", revenue_lines: [
        { id: "rev-h3", revenue_type: "annual_service", amount: 150000, num_licenses: null, start_date: "2026-01-01", end_date: "2026-12-31", description: "On-demand regulatory intelligence retainer." },
      ] },
    ] },
    { id: "005", company: "Solvance Pharma", size: "large", industry: "Pharmaceutical", geo: "United States (San Diego, CA)", csum: "Commercial-stage; expanding rare-disease pipeline into EU and Japan.", contact: "Prithvi Nair", title: "Director, Regulatory Ops", role: "Regulatory Affairs", csumc: "Owns submission operations and publishing tooling.", service: "Regulatory Submission Services", score: 9, outcome: "in_progress", days: 17, note: "Reviewing our eCTD throughput benchmarks.", follow: 4 },
    { id: "006", company: "NovaGene Therapeutics", size: "mid", industry: "Biotechnology", geo: "United States (Princeton, NJ)", csum: "Gene-therapy biotech, first BLA in 18 months, lean RA team.", contact: "Dana Whitfield", title: "VP Regulatory Affairs", role: "Regulatory Affairs", csumc: "Built RA from scratch; needs scalable submission capacity.", service: "Clinical Trial Regulatory Support", score: 8, outcome: "interested", days: 19, note: "Wants IND-to-BLA roadmap.", follow: 6 },
    { id: "007", company: "Aether Medical Devices", size: "mid", industry: "Medical Device", geo: "Germany (Munich)", csum: "Class III cardiovascular devices, navigating EU MDR transition.", contact: "Stefan Bauer", title: "Head of Regulatory", role: "Regulatory Affairs", csumc: "MDR specialist under technical-documentation deadline pressure.", service: "Regulatory Intelligence", score: 7, outcome: "no_response", days: 22 },
    { id: "008", company: "Solara Consumer Health", size: "small", industry: "Consumer Health", geo: "United States (Chicago, IL)", csum: "OTC and supplements brand expanding into EU and Canada.", contact: "Megan Ruiz", title: "Compliance Manager", role: "Compliance", csumc: "Owns OTC labeling and ingredient compliance.", service: "Labeling and Artwork Management", score: 7, outcome: "in_progress", days: 5, note: "Multi-market labeling pain across 6 SKUs.", follow: 3 },
    { id: "009", company: "Quantum Oncology", size: "mid", industry: "Biotechnology", geo: "United States (South SF, CA)", csum: "Precision-oncology biotech, ADC platform, two pivotal trials.", contact: "Dr. Arthur Pennington", title: "Chief Medical Officer", role: "Medical Affairs", csumc: "Physician-scientist; cares about trial regulatory de-risking.", service: "Clinical Trial Regulatory Support", score: 8, outcome: "meeting_booked", days: 2, note: "Exec sponsor engaged; aligning on scope.", follow: 8, review: "approved" },
    { id: "010", company: "Meridian Pharmaceuticals", size: "large", industry: "Pharmaceutical", geo: "Switzerland (Basel)", csum: "Global generics + specialty; high-volume ANDA/MAA submissions.", contact: "Claudia Hofmann", title: "Global Head, Reg Submissions", role: "Executive", csumc: "Runs a high-throughput global submissions factory.", service: "Regulatory Submission Services", score: 9, outcome: "not_interested", days: 18, note: "Has incumbent vendor mid-contract.", inUse: ["of-001"], usage: [
      { offering_id: "of-001", revenue_lines: [
        { id: "rev-m1", revenue_type: "license", amount: 260000, num_licenses: 32, start_date: "2026-03-01", end_date: "2027-02-28", description: "Freya.Register licenses for the submissions team." },
      ] },
    ] },
    { id: "011", company: "Northwind Biosciences", size: "small", industry: "Biotechnology", geo: "Canada (Toronto)", csum: "Seed-stage biotech, pre-IND, first-time FDA filer.", contact: "Owen Bradley", title: "Co-founder & COO", role: "Executive", csumc: "Wears many hats; needs end-to-end regulatory hand-holding.", service: "Clinical Trial Regulatory Support", score: 7, outcome: null, days: 1 },
    { id: "012", company: "Orion Vaccines", size: "mid", industry: "Biotechnology", geo: "United States (Rockville, MD)", csum: "Vaccine developer, pandemic-preparedness portfolio, EUA experience.", contact: "Dr. Hana Kim", title: "VP Regulatory Strategy", role: "Regulatory Affairs", csumc: "Led multiple EUAs; values speed and agency relationships.", service: "Regulatory Intelligence", score: 8, outcome: "interested", days: 16, note: "Wants global guidance monitoring.", follow: 5 },
  ];

  // EVERY OFFERING CARRIES REAL-LOOKING COMMERCIALS IN THE DEMO.
  //
  // The Reports tab used to sit empty for 27 of the 29 offerings, so it showed
  // an "Example preview" card of obviously fake numbers instead. Anir, Jul 28:
  // "we don't need example preview... just put fake shit, just be like it looks
  // real. It's on mock mode anyway. Pretend there's revenue for all of them."
  //
  // So the DEMO seed gives every offering genuine adoption: a handful of the
  // seeded accounts using it, with licences, project fees and retainers on real
  // dated contracts. It is all derived deterministically from the offering id,
  // so the same offering shows the same book on every boot and the totals on
  // the portfolio report always reconcile with the per-offering pages.
  //
  // LIVE MODE IS UNTOUCHED. This runs inside the mock seed only, so a real
  // workspace still starts empty and never shows a number nobody earned.
  const DEMO_ACCOUNTS = specs.map((x) => `cust-${x.id}`);
  // The seeded catalogue, in order. Sourced from the same single list the
  // offering icons use, so it cannot drift out of sync with the catalogue.
  const DEMO_OFFERING_IDS = OFFERING_CATALOGUE_ORDER.map(
    (_, i) => `of-${String(i + 1).padStart(3, "0")}`
  );
  function seedCommercials(offeringId: string) {
    // Stable pseudo-random from the id: same catalog, same book, every time.
    let h = 0;
    for (let i = 0; i < offeringId.length; i++)
      h = (h * 31 + offeringId.charCodeAt(i)) >>> 0;
    const pick = (n: number) => (h = (h * 1103515245 + 12345) >>> 0) % n;

    const accountCount = 2 + pick(3); // 2 to 4 accounts on every offering
    const chosen: string[] = [];
    for (let i = 0; i < accountCount; i++) {
      const c = DEMO_ACCOUNTS[pick(DEMO_ACCOUNTS.length)];
      if (!chosen.includes(c)) chosen.push(c);
    }
    // Contract dates are RELATIVE to today, not pinned to a calendar year, so
    // the renewal chart never drifts into a wall of $0 months as time passes.
    // A licence signed `age` months ago renews `12 - age` months from now, so
    // spreading `age` over the year spreads the renewals over the year too.
    const monthsFromNow = (n: number) => {
      const d = new Date(NOW);
      d.setUTCMonth(d.getUTCMonth() + n, 1);
      return d.toISOString().slice(0, 10);
    };
    return chosen.map((customerId, i) => {
      const seats = 15 + pick(70);
      const perSeat = 6000 + pick(5) * 1000;
      const age = 1 + pick(11); // signed 1 to 11 months ago
      const lines = [
        {
          id: `rev-${offeringId}-${i}-l`,
          revenue_type: "license" as const,
          amount: seats * perSeat,
          num_licenses: seats,
          start_date: monthsFromNow(-age),
          end_date: monthsFromNow(12 - age),
          description: "Platform licences for the regulatory team.",
        },
      ];
      // Roughly half the accounts also carry services or a project, on their
      // own term so a single account can have two different renewal dates.
      if (pick(2) === 0) {
        const svcAge = 1 + pick(11);
        lines.push({
          id: `rev-${offeringId}-${i}-s`,
          revenue_type: (pick(2) === 0 ? "annual_service" : "project") as "license",
          amount: (4 + pick(18)) * 10000,
          num_licenses: null as unknown as number,
          start_date: monthsFromNow(-svcAge),
          end_date: monthsFromNow(12 - svcAge),
          description: "Implementation and ongoing regulatory support.",
        });
      }
      return { customerId, offeringId, revenue_lines: lines };
    });
  }

  // Fan the generated book out per account so each customer carries its own
  // `offering_usage`, which is where the reports read from.
  const generatedUsage = new Map<
    string,
    { offering_id: string; revenue_lines: unknown[]; engagement_versions: unknown[] }[]
  >();

  /**
   * A believable activity history for one account on one offering — two or
   * three activities down Suren's ladder with the latest marked current, so
   * the customer's Offerings tab and the heat map both have something real to
   * read in Mock (Anir, Aug 8: mock must look full).
   */
  function demoActivities(customerId: string, offeringId: string) {
    let h = 0;
    const key = `${customerId}:${offeringId}`;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
    const roll = (n: number) => (h = (h * 1103515245 + 12345) >>> 0) % n;
    const LADDER = ["lead", "opportunity", "pilot", "contract", "delivery"] as const;
    const reached = 1 + roll(LADDER.length); // 1..5 activities deep
    const day = (back: number) => {
      const d = new Date(NOW);
      d.setUTCDate(d.getUTCDate() - back);
      return d.toISOString().slice(0, 10);
    };
    const NOTE: Record<string, string> = {
      lead: "First conversation with the regulatory team.",
      opportunity: "Scoped the markets and the data they hold today.",
      pilot: "Pilot running on two markets with their own products.",
      contract: "Commercials agreed; legal reviewing the order form.",
      delivery: "Rolled out to the regulatory team and in daily use.",
    };
    return LADDER.slice(0, reached).map((activity, index) => {
      const last = index === reached - 1;
      const started = day((reached - index) * 45 + roll(20));
      const status = last
        ? (["initiated", "under_progress", "under_progress"] as const)[roll(3)]
        : ("completed" as const);
      return {
        id: `eng-${offeringId}-${customerId}-${index + 1}`,
        version: index + 1,
        // Exactly one current activity per customer-offering: the newest.
        linked: last,
        activity,
        activity_description: NOTE[activity],
        comments: last ? "Next step agreed with their regulatory lead." : null,
        status,
        status_dates: {
          initiated: started,
          under_progress:
            status === "initiated" ? null : day((reached - index) * 45 - 10),
          completed: status === "completed" ? day((reached - index) * 30) : null,
        },
        dollar_value: last ? (2 + roll(9)) * 25000 : 0,
        currency: "USD" as const,
        start_date: started,
        end_date: null,
        potential_close_date: null,
        opportunity_ids: [],
        proposal_ids: [],
        contract_ids: [],
        created_at: new Date(NOW).toISOString(),
        updated_at: new Date(NOW).toISOString(),
      };
    });
  }

  for (const offeringId of DEMO_OFFERING_IDS) {
    for (const row of seedCommercials(offeringId)) {
      const list = generatedUsage.get(row.customerId) || [];
      list.push({
        offering_id: row.offeringId,
        revenue_lines: row.revenue_lines,
        engagement_versions: demoActivities(row.customerId, row.offeringId),
      });
      generatedUsage.set(row.customerId, list);
    }
  }

  // EVERY DEMO ACCOUNT IS CLASSIFIED. An unclassified customer opens its
  // Offerings tab on the "What type of customer is this?" picker with nothing
  // behind it, so eleven of the twelve showrooms read as empty (Anir, Aug 8:
  // "in the fake mode it has to be as if there's a ton of shit for every
  // single thing"). Derived from the industry + size already on the spec, so
  // the value always matches a row in the customer-type master list.
  const FAMILY: Record<string, string> = {
    Pharmaceutical: "Pharmaceutical",
    Biotechnology: "Biologics",
    "Medical Device": "Medical Devices",
    "Medical Devices": "Medical Devices",
    "Consumer Health": "Consumer Products",
  };
  const SIZE_NAME: Record<string, string> = {
    small: "Small",
    mid: "Mid size",
    large: "Large",
  };
  const REVENUE: Record<string, string> = {
    small: "$180M",
    mid: "$1.4B",
    large: "$9.6B",
  };

  for (const s of specs) {
    const cid = `cust-${s.id}`;
    const ctid = `cont-${s.id}`;
    const sid = `sess-${s.id}`;
    const derivedType =
      s.ctype ||
      `${FAMILY[s.industry] || "Pharmaceutical"} - ${
        SIZE_NAME[s.size] || "Mid size"
      }`;
    customers.push({
      id: cid,
      company_name: s.company,
      website_url: `https://${slug(s.company)}.com`,
      size_tier: s.size,
      industry: s.industry,
      geography: s.geo,
      enrichment_summary: s.csum,
      created_at: iso(s.days + 30),
      last_enriched_at: iso(s.days),
      customer_type: derivedType,
      ownership: s.own || (s.size === "small" ? "Private" : "Public"),
      revenue: s.rev || REVENUE[s.size] || "$1.4B",
      analyzed_at: iso(s.days),
      // Hand-written usage wins; the generated book fills in the rest so no
      // offering's report is empty in the demo. Hand-written rows that predate
      // the activity model get the same generated ladder, so no in-use card
      // sits on "Activities (0)".
      offering_usage: [
        ...(s.usage || []).map((u) => ({
          ...u,
          engagement_versions: u.engagement_versions?.length
            ? u.engagement_versions
            : demoActivities(cid, u.offering_id),
        })),
        ...((generatedUsage.get(cid) || []).filter(
          (g) => !(s.usage || []).some((u) => u.offering_id === g.offering_id)
        ) as typeof s.usage extends undefined ? never[] : NonNullable<typeof s.usage>),
      ],
      offerings_in_use: Array.from(
        new Set([
          ...(s.inUse || []),
          ...(generatedUsage.get(cid) || []).map((g) => g.offering_id),
        ])
      ),
      // THE SHOWROOM'S SOFTWARE ESTATE. Every demo account runs three or four
      // FDL components on real versions, so the Digital components tab is
      // populated wherever a reviewer lands (Anir, Aug 8: "in the fake mode
      // it has to be as if there's a ton of shit for every single thing").
      digital_components: demoComponentLinks(s.id),
    });
    contacts.push({
      id: ctid,
      customer_id: cid,
      full_name: s.contact,
      email: `${slug(s.contact)}@${slug(s.company)}.com`,
      linkedin_url: `https://linkedin.com/in/${slug(s.contact)}`,
      phone: mockPhone(ctid),
      job_title: s.title,
      role_bucket: s.role,
      career_summary: s.csumc,
      enrichment_summary:
        "Senior stakeholder; lead with evidence and respect their time.",
      raw_linkedin_data: {
        about: s.csumc,
        experience: [{ title: s.title, company: s.company, duration: "Present" }],
        skills: ["Regulatory Strategy", "Submissions", "Compliance"],
      },
      created_at: iso(s.days + 30),
      last_enriched_at: iso(s.days),
    });
    const pitch = buildAccountPitch({
      company: s.company,
      contactName: s.contact,
      contactTitle: s.title,
      service: s.service,
      context: s.csum,
      repName: "Walter Hensley",
    });
    pitchSessions.push({
      id: sid,
      customer_id: cid,
      contact_id: ctid,
      kb_version: 1,
      recommended_services: [
        {
          service_name: s.service,
          relevance_score: s.score,
          pitch_angle: `Position ${s.service} against ${s.company}'s near-term regulatory milestones.`,
        },
        {
          service_name: "Regulatory Intelligence",
          relevance_score: Math.max(5, s.score - 2),
          pitch_angle: "Single-pane monitoring across FDA, EMA and 120+ agencies.",
        },
      ],
      pitch_email: JSON.stringify({ subject_lines: pitch.subject_lines, body: pitch.body }),
      pitch_5min_script: pitch.pitch_5min_script,
      pitch_call_script: pitch.pitch_call_script,
      additional_context: s.note || null,
      review_status: s.review,
      reviewed_at: s.review === "approved" ? iso(s.days) : null,
      created_at: isoAt(s.days, s.id),
    });
    if (s.outcome) {
      interactions.push({
        id: `int-${s.id}`,
        pitch_session_id: sid,
        customer_id: cid,
        contact_id: ctid,
        outcome: s.outcome,
        notes: s.note || null,
        follow_up_date: s.follow ? iso(-s.follow) : null,
        logged_by: "Walter Hensley",
        created_at: isoAt(Math.max(0, s.days - 1), `int-${s.id}`),
      });
    }
  }

  const freyrKb: FreyrKb = {
    id: "kb-001",
    structured_kb: MOCK_FREYR_KB,
    raw_crawl_text: MOCK_FREYR_CRAWL_PAGES.join("\n\n---\n\n"),
    // Relative to "now" so the KB reads as recently maintained, not perpetually
    // stale off a hardcoded 2025 date (same fix as the dynamic dashboard date).
    crawled_at: iso(9),
    page_count: MOCK_FREYR_CRAWL_PAGES.length,
    version: 1,
  };

  // A couple of seeded runs so the agent's run history reads as a living log.
  const agentRuns: AgentRun[] = [
    {
      id: "run-seed-001",
      kind: "play",
      title: "Ran a full outreach play for Helix Biologics",
      customer_id: "cust-004",
      company: "Helix Biologics",
      outcome: "sent",
      summary: "Researched, matched services, and drafted: you reviewed, approved, and sent it.",
      steps: [
        { label: "Researched the account", detail: "Scanned Helix Biologics' profile, signals, and history", status: "done" },
        { label: "Matched Freyr services", detail: "Led with Global Labeling Strategy", status: "done" },
        { label: "Drafted the outreach", detail: "Tailored email + call angle for SVP Global Regulatory", status: "done" },
        { label: "Compliance approval", detail: "You reviewed and approved it", status: "gated" },
        { label: "Sent by you", detail: "You sent it after approving: the agent never sends on its own", status: "done" },
      ],
      created_at: iso(1),
    },
    {
      id: "run-seed-002",
      kind: "autopilot",
      title: "Autopilot drafted your queue",
      customer_id: null,
      company: null,
      outcome: "mixed",
      summary: "2 drafted for your review · 1 needs your approval.",
      steps: [
        { label: "Re-engage Aether Medical Devices", detail: "Drafted and saved to the timeline: review and send when you're ready. Nothing sent.", status: "done" },
        { label: "Follow up with Cortexa Biopharma", detail: "Drafted and saved to the timeline: review and send when you're ready. Nothing sent.", status: "done" },
        { label: "Approve the pitch for Helix Biologics", detail: "Needs your approval before anything is drafted or sent", status: "escalated" },
      ],
      created_at: iso(2),
    },
  ];

  // One seeded agent enrollment so the Re-engagement cadence reads as live.
  const sequenceEnrollments: SequenceEnrollment[] = [
    {
      id: "enr-seed-001",
      customer_id: "cust-007",
      sequence_id: "reengage",
      step_index: 0,
      enrolled_by: "Freyr Agent",
      created_at: iso(1),
    },
  ];
  /**
   * ACCOUNTS ACTUALLY RUNNING A CADENCE.
   *
   * The sequences page derives an enrolment for every active deal, but it
   * pins all of them to the FIRST sequence in the library — so with one
   * persisted row, eleven of the twelve cadences had an empty timeline and
   * "accounts enrolled" read as a rounding error against 152 accounts. These
   * are spread deterministically across the whole library, at varying step
   * depths, so every cadence has a live enrolment and a due count behind it.
   *
   * Ids must match lib/sequences.ts. A cadence that is removed there simply
   * loses its rows here — the page reads enrolments by sequence id.
   */
  const CADENCES = [
    "reg-exec", "reengage", "post-meeting", "device-mdr", "first-filer",
    "renewal-expansion", "generics-variation", "labeling-artwork",
    "intelligence-pilot", "platform-eval", "conference-followup",
    "dormant-winback",
  ];
  const ENROLLERS = [
    "Freyr Agent", "Walter Hensley", "Gordon Ashby", "Margaret Whitfield",
    "Eleanor Rutherford", "Marcus Bramwell",
  ];
  for (let i = 0; i < 72; i += 1) {
    /* Every other generated account, so an enrolled account is a minority of
       the book rather than all of it — which is what makes the "candidates
       to enrol" count on the same page mean anything. */
    const n = i * 2 + 1;
    sequenceEnrollments.push({
      id: `enr-fill-${String(i + 1).padStart(3, "0")}`,
      customer_id: `cust-fill-${String(n).padStart(3, "0")}`,
      sequence_id: CADENCES[i % CADENCES.length]!,
      /* Shallow more often than deep: most enrolments are still early, which
         is what keeps the due-now count high enough to be worth looking at. */
      step_index: i % 4,
      enrolled_by: ENROLLERS[i % ENROLLERS.length]!,
      created_at: iso(1 + (i % 30)),
    } as (typeof sequenceEnrollments)[number]);
  }

  /**
   * AND THEN THE VOLUME.
   *
   * Anir, Aug 31: "do u understand how much fucking data i need? i need
   * thousands of data points in mock mode."
   *
   * Sixteen accounts and three contacts is a showroom, not a workspace. Every
   * page that counts, groups, charts or paginates looked the same at sixteen
   * rows as it would at one — you cannot see whether a table scrolls, whether
   * a group total means anything, or whether search is worth having.
   *
   * So the hand-written cast above stays exactly as it is (it carries the rich
   * enrichment text, the revenue lines and the offering joins the showroom
   * pages need), and a deterministic long tail is generated behind it. Index
   * arithmetic, no randomness: two reads never disagree and a screenshot stays
   * true.
   *
   * INVENTED COMPANIES ONLY, and invented people at them. The pipeline sheet
   * carries real Freyr accounts; putting a made-up VP with a made-up phone
   * number on one of those is the line the house rule draws.
   */
  const FILL_INDUSTRY = [
    "Pharmaceutical", "Biotechnology", "Medical Devices", "Consumer Health",
    "Generics", "Animal Health", "Diagnostics", "Nutraceuticals",
  ];
  const FILL_GEO = [
    "United States (Boston, MA)", "United Kingdom (Cambridge)",
    "Germany (Munich)", "India (Hyderabad)", "Japan (Tokyo)",
    "Switzerland (Basel)", "Brazil (São Paulo)", "Singapore",
    "Canada (Toronto)", "France (Lyon)", "Ireland (Dublin)",
    "South Korea (Seoul)",
  ];
  const FILL_SIZE = ["small", "mid", "large"];
  const FILL_OWNERSHIP = ["Private", "Public", "PE-backed", "Family owned"];
  const FILL_TITLES: [string, string][] = [
    ["VP Regulatory Affairs", "Regulatory Affairs"],
    ["Head of Submissions", "Regulatory Affairs"],
    ["Director, RIM", "Regulatory Operations"],
    ["Head of Labelling", "Regulatory Affairs"],
    ["Regulatory Operations Manager", "Regulatory Operations"],
    ["Chief Medical Officer", "Executive"],
    ["Head of Quality", "Quality Assurance"],
    ["Programme Director", "Executive"],
    ["Head of Pharmacovigilance", "Safety"],
    ["Regulatory Affairs Associate", "Regulatory Affairs"],
  ];
  const at = <T,>(list: T[], n: number): T => list[n % list.length]!;
  const fillSlug = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, "");

  /* 140 accounts is roughly what a regional team carries, and it is enough for
     a table to page, a group total to mean something and search to matter. */
  const FILL_ACCOUNTS = 140;
  for (let i = 0; i < FILL_ACCOUNTS; i += 1) {
    const n = i + 1;
    const company = `${at(FILL_STEMS, i)} ${at(FILL_SUFFIX, i * 3 + 1)}`;
    const cid = `cust-fill-${String(n).padStart(3, "0")}`;
    const size = at(FILL_SIZE, i);
    const industry = at(FILL_INDUSTRY, i);
    const created = new Date(
      Date.UTC(2025, 10, 1) + i * 3 * 86400000
    ).toISOString();
    customers.push({
      id: cid,
      company_name: company,
      website_url: `https://${fillSlug(company)}.example`,
      size_tier: size,
      industry,
      geography: at(FILL_GEO, i),
      enrichment_summary: `${size === "large" ? "Global" : size === "mid" ? "Mid-size" : "Emerging"} ${industry.toLowerCase()} company headquartered in ${at(FILL_GEO, i)}. Active across ${1 + (i % 4)} regions with submissions planned through ${2026 + (i % 3)}.`,
      created_at: created,
      last_enriched_at: created,
      customer_type: `${industry} - ${size === "large" ? "Large" : size === "mid" ? "Mid size" : "Small"}`,
      ownership: at(FILL_OWNERSHIP, i),
      revenue:
        size === "large"
          ? `$${2 + (i % 9)}.${i % 10}B`
          : size === "mid"
            ? `$${300 + ((i * 37) % 700)}M`
            : `$${40 + ((i * 13) % 160)}M`,
      analyzed_at: created,
    } as (typeof customers)[number]);

    /* FIVE PEOPLE PER ACCOUNT. A contact list with one name on it cannot show
       who else is in the room, which is the whole point of the tab. */
    for (let k = 0; k < 5; k += 1) {
      const first = at(FILL_FIRST, i * 5 + k);
      const last = at(FILL_LAST, i * 7 + k * 3);
      const [title, bucket] = at(FILL_TITLES, i + k);
      contacts.push({
        id: `cont-fill-${String(n).padStart(3, "0")}-${k + 1}`,
        customer_id: cid,
        full_name: `${first} ${last}`,
        email: `${first.toLowerCase()}.${last.toLowerCase()}@${fillSlug(company)}.example`,
        linkedin_url: null,
        phone: null,
        job_title: title,
        role_bucket: bucket,
        career_summary: `${8 + ((i + k) % 20)} years in ${bucket.toLowerCase()}, most recently at ${company}.`,
        enrichment_summary: `${bucket} contact at ${company}. Responds best to specifics on timelines and scope.`,
        raw_linkedin_data: null,
        created_at: created,
        last_enriched_at: created,
      } as (typeof contacts)[number]);
    }
  }

  /* A PITCH SESSION ON MOST OF THEM. Sessions shipped with two, so the page
     was a pair of cards — you could not tell it was a list. One per account
     across most of the long tail, against a real contact at that account so
     the joins land. */
  /* A RUNNING ORDINAL, NOT `i`. The loop skips every third account, so any
     cycle indexed by `i` only ever lands on two of every three positions —
     `changes_requested` sat at one of the skipped ones and never appeared, so
     the rework queue stayed empty however long the cycle got. */
  let fillSession = -1;
  for (let i = 0; i < FILL_ACCOUNTS; i += 1) {
    if (i % 3 === 2) continue;
    fillSession += 1;
    const n = i + 1;
    const cid = `cust-fill-${String(n).padStart(3, "0")}`;
    const contactId = `cont-fill-${String(n).padStart(3, "0")}-${(i % 5) + 1}`;
    pitchSessions.push({
      id: `sess-fill-${String(n).padStart(3, "0")}`,
      customer_id: cid,
      contact_id: contactId,
      kb_version: 1,
      recommended_services: MOCK_MATCHING_OUTPUT.recommended_services,
      pitch_email: MOCK_PITCHES.pitch_email,
      pitch_5min_script: MOCK_PITCHES.pitch_5min_script,
      pitch_call_script: MOCK_PITCHES.pitch_call_script,
      additional_context: at(
        [
          "Met at DIA. Timeline is tight on their next filing.",
          "Inbound from the website, wants a capability overview.",
          "Referred by a delivery partner.",
          "Following up after the conference booth conversation.",
          "Renewal conversation, they asked what else we do.",
        ],
        i
      ),
      created_at: new Date(
        Date.UTC(2026, 5, 1) + i * 2 * 86400000
      ).toISOString(),
      /* A REVIEW STATE ON EVERY GENERATED DRAFT. Left off, all 94 fill
         sessions were `undefined`, so the compliance queue on /tasks was one
         card and the "needs your approval" bucket on /agent and
         /notifications was one row — in a workspace with 105 drafts. The
         cycle is weighted toward approved, which is what a working team's
         queue actually looks like. */
      review_status: at(
        [
          "approved", "approved", "in_review", "draft", "approved",
          "changes_requested", "approved", "in_review", "draft",
          "approved", "in_review", "approved",
        ] as const,
        fillSession
      ),
      /* Only the approved ones carry a review date; the rest have not been
         signed off yet, and a timestamp on an unreviewed draft is a lie. */
      reviewed_at: [0, 1, 4, 6, 9, 11].includes(fillSession % 12)
        ? new Date(Date.UTC(2026, 5, 2) + i * 2 * 86400000).toISOString()
        : null,
    } as (typeof pitchSessions)[number]);
  }

  /**
   * AND ACTIVITY AGAINST THEM.
   *
   * The fill loop created 140 accounts and 94 drafts but logged NOTHING, so
   * every generated deal sat in Prospect with no last-activity date and the
   * whole workspace ran on the ten hand-written interactions. That is what
   * made the dashboard's outcome mix a five-slice donut, the activity feed
   * five rows deep, the follow-up queue eight items and every agent analytic
   * a single account.
   *
   * One to three logged touches per generated draft, cycled deterministically
   * so the stage mix, the outcome mix and the rotting-deal count all come out
   * of real records rather than a hardcoded curve.
   */
  /* Deliberately a local copy of the mock sales roster rather than an import
     from lib/pipeline: that module pulls in lucide-react for its stage icons,
     and the store has no business dragging an icon library into the server. */
  const FILL_LOGGERS = [
    "Walter Hensley", "Gordon Ashby", "Margaret Whitfield", "Mark Miller",
    "Eleanor Rutherford", "Marcus Bramwell", "Sylvia Ashcroft",
    "James O'Brien", "Audrey Kingsley", "Thomas Beckett", "Nancy Caldwell",
    "Russell Pemberton", "Grace Lockwood", "Daniel Foster",
  ];
  /* Weighted the way a book actually sits: mostly working deals, a few
     qualified, a handful gone quiet and the occasional loss. */
  const FILL_OUTCOMES: Outcome[] = [
    "in_progress", "interested", "no_response", "meeting_booked",
    "in_progress", "interested", "not_interested", "in_progress",
    "ai_call_completed", "no_response", "interested", "in_progress",
  ];
  const FILL_NOTES = [
    "Intro call done. Walked through the registration book and where the gaps are.",
    "Sent the capability deck. They asked for pricing on a two-market pilot.",
    "Left a voicemail and followed up by email. Nothing back yet.",
    "Demo booked with their regulatory ops lead and two of her team.",
    "They are mid-budget cycle. Revisit once the new financial year opens.",
    "Asked for references in the same therapeutic area before going further.",
    "Went with the incumbent this round. Asked to be kept on the list.",
    "Good conversation on submissions. The blocker is publishing capacity.",
    "AI call completed. Interested in the intelligence feed specifically.",
    "Forwarded internally to their head of quality. Waiting on a reply.",
    "Wants a scoping call on labelling across their EU portfolio.",
    "Discussed the artwork workflow. They have a recall they are still paying for.",
  ];
  let fillTouch = 0;
  for (let i = 0; i < FILL_ACCOUNTS; i += 1) {
    if (i % 3 === 2) continue;
    const n = i + 1;
    const cid = `cust-fill-${String(n).padStart(3, "0")}`;
    const contactId = `cont-fill-${String(n).padStart(3, "0")}-${(i % 5) + 1}`;
    const sid = `sess-fill-${String(n).padStart(3, "0")}`;
    /* One, two or three touches. buildDeals reads the LAST outcome per
       contact, so the final entry in each run is what sets the stage. */
    const touches = 1 + (i % 3);
    for (let t = 0; t < touches; t += 1) {
      fillTouch += 1;
      /* Newest touch last, and spread from ~70 days ago up to yesterday so
         the rotting-deal cutoff (14 days) catches a believable slice rather
         than all of them or none. */
      const daysAgo = 1 + ((i * 7 + 3) % 70) - t * 6;
      /* Same reason as the review cycle above: `i * 3 + t` could never reach
         the positions that need a third touch, so `ai_call_completed` was
         unreachable and the voice outcome never appeared anywhere. */
      const outcome = at(FILL_OUTCOMES, fillTouch);
      interactions.push({
        id: `int-fill-${String(n).padStart(3, "0")}-${t + 1}`,
        pitch_session_id: sid,
        customer_id: cid,
        contact_id: contactId,
        outcome,
        notes: at(FILL_NOTES, fillTouch),
        /* Only open outcomes carry a follow-up: chasing a closed-lost deal is
           not a task, and a queue full of them would be noise. */
        follow_up_date:
          outcome === "not_interested" || fillTouch % 5 === 0
            ? null
            : iso(-(3 + (fillTouch % 25))).slice(0, 10),
        logged_by: at(FILL_LOGGERS, i + t),
        created_at: isoAt(Math.max(0, daysAgo), `int-fill-${n}-${t}`),
      } as (typeof interactions)[number]);
    }
  }

  /**
   * A RUN HISTORY WORTH READING.
   *
   * Two seeded runs meant /agent/impact showed a one-row leaderboard, the
   * plan page a two-line history and the weekly review a single account —
   * the three pages whose entire job is to show the agent has been working.
   * These are generated against the long tail so the leaderboard, the run
   * chart and the accounts-touched count all have a spread behind them.
   */
  const RUN_PLAYS: [AgentRun["kind"], AgentRun["outcome"], string, string][] = [
    ["play", "sent", "Ran a full outreach play", "Researched, matched offerings and drafted: you reviewed, approved and sent it."],
    ["act", "handled", "Drafted a follow-up", "Picked up the thread from the last call and drafted the follow-up for review."],
    ["act", "handled", "Logged the call outcome", "Wrote the timeline entry from the call notes and set the next follow-up date."],
    ["play", "escalated", "Prepared a re-engagement", "Draft is ready, but the account needs your approval before anything goes out."],
    ["autopilot", "mixed", "Autopilot cleared the queue", "Drafted the overnight queue and escalated the one that needed a decision."],
    ["plan", "handled", "Built the account plan", "Pulled the history, the offerings in play and the open risks into one plan."],
  ];
  for (let i = 0; i < 46; i += 1) {
    /* Every third fill account, so the leaderboard spans a couple of dozen
       companies instead of one. */
    const n = i * 3 + 1;
    const cid = `cust-fill-${String(n).padStart(3, "0")}`;
    const customer = customers.find((c) => c.id === cid);
    if (!customer) continue;
    const [kind, outcome, title, summary] = at(RUN_PLAYS, i);
    agentRuns.push({
      id: `run-fill-${String(i + 1).padStart(3, "0")}`,
      kind,
      title: `${title} for ${customer.company_name}`,
      customer_id: cid,
      company: customer.company_name,
      outcome,
      summary,
      steps: [
        { label: "Researched the account", detail: `Read ${customer.company_name}'s profile, signals and history`, status: "done" },
        { label: "Matched Freyr offerings", detail: "Ranked the catalogue against their stated regulatory milestones", status: "done" },
        { label: "Drafted the outreach", detail: "Tailored the email and the call angle to the contact's role", status: "done" },
        {
          label: outcome === "escalated" ? "Waiting on your approval" : "Saved to the timeline",
          detail:
            outcome === "escalated"
              ? "Nothing goes out until you approve it"
              : "Ready for you to review and send. The agent never sends on its own",
          status: outcome === "escalated" ? "escalated" : "done",
        },
      ],
      created_at: isoAt(1 + (i % 28), `run-fill-${i}`),
    } as (typeof agentRuns)[number]);
  }

  // Every showroom account — hand-written or generated — runs a software
  // estate, so the Digital components tab is never empty in Mock.
  for (const customer of customers) {
    if (!customer.digital_components?.length) {
      customer.digital_components = demoComponentLinks(customer.id);
    }
  }

  return {
    customers,
    contacts,
    pitchSessions,
    interactions,
    agentRuns,
    sequenceEnrollments,
    // Private defaults are cloned lazily for each verified member. They must not
    // be shared merely because two people use the same mock workspace process.
    agentPrefs: [],
    draftSnippets: [],
    agentChats: [],
    freyrKb,
  };
}

// ---------------------------------------------------------------------------
// Durable persistence (Suren: "everything has to save — it can't vanish").
// The store is written to a JSON file so edits survive a server restart, not
// just page reloads. It lives under node_modules/.cache so Next's file watcher
// doesn't treat it as a source change (which would loop the dev server), and
// it's DISABLED under the test flag so the Playwright suite always sees a fresh
// seed. Bump SCHEMA_VERSION whenever the seed shape changes to auto-reseed.
// Bumped Aug 8: showroom accounts now carry a digital_components estate, so
// a snapshot written before that must be reseeded rather than loaded.
/* Bumped when the seed changes shape or volume — the store is cached to disk
   under node_modules/.cache, so without this a new seed never runs and the
   workspace stays at whatever it was first built as. Anir, Aug 31: the 140
   generated accounts landed in the code and not one of them reached a page. */
/* 7: the generated accounts now log activity, carry a review state on their
   drafts and have a run history behind them. Without a bump the cached store
   keeps its silent 140 accounts and none of that reaches a page either. */
const SCHEMA_VERSION = 8;
const PERSIST = process.env.AGENT_FORCE_MOCK !== "1";
const STORE_FILE = join(process.cwd(), "node_modules", ".cache", "freyr-store.json");

function loadOrSeed(): MockStore {
  if (PERSIST) {
    try {
      if (existsSync(STORE_FILE)) {
        const parsed = JSON.parse(readFileSync(STORE_FILE, "utf8"));
        if (parsed && parsed.__v === SCHEMA_VERSION && parsed.store) {
          return parsed.store as MockStore;
        }
      }
    } catch {
      /* corrupt or unreadable — fall through to a fresh seed */
    }
  }
  return seed();
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
function persist() {
  if (!PERSIST) return;
  // Debounce so a burst of writes coalesces into one file write.
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try {
      mkdirSync(dirname(STORE_FILE), { recursive: true });
      writeFileSync(STORE_FILE, JSON.stringify({ __v: SCHEMA_VERSION, store }));
    } catch {
      /* best-effort; never crash a request because we couldn't persist */
    }
  }, 120);
}

const store: MockStore = globalThis.__FREYR_MOCK_STORE__ ?? loadOrSeed();
if (!globalThis.__FREYR_MOCK_STORE__) {
  globalThis.__FREYR_MOCK_STORE__ = store;
}

function inScope(
  record: ScopeColumns,
  scope: WorkspaceMemberScope
): boolean {
  return (
    record.workspace_id === scope.workspaceId &&
    record.user_id === scope.userId
  );
}

function ensurePersonalDefaults(scope: WorkspaceMemberScope): ScopedAgentPrefs {
  const existing = store.agentPrefs.find((prefs) => inScope(prefs, scope));
  if (existing) return existing;

  const scopeColumns: ScopeColumns = {
    workspace_id: scope.workspaceId,
    user_id: scope.userId,
  };
  const prefs: ScopedAgentPrefs = {
    ...scopeColumns,
    id: uuidv4(),
    focus_industry: null,
    only_mine: false,
    autopilot_reengage: true,
    autopilot_stabilize: true,
    autopilot_max_value: null,
    draft_tone: "warm",
    autopilot_cadence: "off",
    autopilot_last_run: null,
    digest_cadence: "off",
    digest_last_sent: null,
    linkedin_url: null,
    linkedin_headline: null,
    linkedin_about: null,
    linkedin_photo: null,
    linkedin_synced_at: null,
    updated_at: new Date().toISOString(),
  };
  // Clone the starter for this member. Deleting it later does not make it
  // reappear because the member's preferences remain as the seed marker.
  const starter: ScopedDraftSnippet = {
    ...scopeColumns,
    id: uuidv4(),
    title: "Submission-timeline intro",
    subject: "Hitting your submission timeline",
    body: `Hi there,\n\nFreyr's regulatory submission team helps clinical-stage teams hit FDA/EMA timelines without adding headcount. Worth a 20-minute call to see if it fits your near-term milestones?\n\nBest,\nFreyr Solutions`,
    uses: 4,
    created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
  };
  store.agentPrefs.push(prefs);
  store.draftSnippets.push(starter);
  persist();
  return prefs;
}

// ---------------------------------------------------------------------------
// CRUD operations matching the Supabase adapter signatures exactly.
// ---------------------------------------------------------------------------
export const mockDb = {
  customers: {
    list: async () =>
      [...store.customers].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ),
    get: async (id: string) =>
      store.customers.find((c) => c.id === id) || null,
    findByName: async (name: string, workspaceId?: string) =>
      store.customers.find(
        (c) =>
          c.company_name.toLowerCase() === name.toLowerCase() &&
          (!workspaceId || !c.workspace_id || c.workspace_id === workspaceId)
      ) || null,
    create: async (data: Partial<Customer>) => {
      const record: Customer = {
        ...(data as Customer),
        id: data.id || uuidv4(),
        created_at: new Date().toISOString(),
        last_enriched_at: new Date().toISOString(),
      };
      store.customers.push(record);
      persist();
      return record;
    },
    update: async (id: string, data: Partial<Customer>) => {
      const idx = store.customers.findIndex((c) => c.id === id);
      if (idx === -1) return null;
      store.customers[idx] = {
        ...store.customers[idx],
        ...data,
        last_enriched_at: new Date().toISOString(),
      };
      persist();
      return store.customers[idx];
    },
  },
  contacts: {
    list: async (customerId?: string) =>
      store.contacts.filter((c) => !customerId || c.customer_id === customerId),
    get: async (id: string) =>
      store.contacts.find((c) => c.id === id) || null,
    create: async (data: Partial<Contact>) => {
      const record: Contact = {
        ...(data as Contact),
        id: data.id || uuidv4(),
        created_at: new Date().toISOString(),
        last_enriched_at: new Date().toISOString(),
      };
      store.contacts.push(record);
      persist();
      return record;
    },
    update: async (id: string, data: Partial<Contact>) => {
      const idx = store.contacts.findIndex((c) => c.id === id);
      if (idx === -1) return null;
      store.contacts[idx] = { ...store.contacts[idx], ...data };
      persist();
      return store.contacts[idx];
    },
  },
  pitchSessions: {
    list: async (customerId?: string, contactId?: string) =>
      store.pitchSessions
        .filter(
          (s) =>
            (!customerId || s.customer_id === customerId) &&
            (!contactId || s.contact_id === contactId)
        )
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime()
        ),
    get: async (id: string) =>
      store.pitchSessions.find((s) => s.id === id) || null,
    create: async (data: Partial<PitchSession>) => {
      const record: PitchSession = {
        ...(data as PitchSession),
        id: data.id || uuidv4(),
        created_at: new Date().toISOString(),
      };
      store.pitchSessions.push(record);
      persist();
      return record;
    },
    update: async (id: string, data: Partial<PitchSession>) => {
      const idx = store.pitchSessions.findIndex((s) => s.id === id);
      if (idx === -1) return null;
      store.pitchSessions[idx] = { ...store.pitchSessions[idx], ...data };
      persist();
      return store.pitchSessions[idx];
    },
  },
  interactions: {
    list: async (customerId?: string, contactId?: string) =>
      store.interactions
        .filter(
          (i) =>
            (!customerId || i.customer_id === customerId) &&
            (!contactId || i.contact_id === contactId)
        )
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime()
        ),
    create: async (data: Partial<Interaction>) => {
      const record: Interaction = {
        ...(data as Interaction),
        id: data.id || uuidv4(),
        created_at: new Date().toISOString(),
      };
      store.interactions.push(record);
      persist();
      return record;
    },
    remove: async (id: string) => {
      const before = store.interactions.length;
      store.interactions = store.interactions.filter((i) => i.id !== id);
      return store.interactions.length < before;
    },
  },
  agentRuns: {
    list: async () =>
      [...store.agentRuns].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ),
    get: async (id: string) =>
      store.agentRuns.find((r) => r.id === id) || null,
    create: async (data: Partial<AgentRun>) => {
      const record: AgentRun = {
        ...(data as AgentRun),
        id: data.id || uuidv4(),
        created_at: new Date().toISOString(),
      };
      store.agentRuns.unshift(record);
      return record;
    },
    update: async (id: string, data: Partial<AgentRun>) => {
      const idx = store.agentRuns.findIndex((r) => r.id === id);
      if (idx === -1) return null;
      store.agentRuns[idx] = { ...store.agentRuns[idx], ...data };
      return store.agentRuns[idx];
    },
  },
  sequenceEnrollments: {
    list: async () => [...store.sequenceEnrollments],
    get: async (id: string) =>
      store.sequenceEnrollments.find((e) => e.id === id) || null,
    create: async (data: Partial<SequenceEnrollment>) => {
      const record: SequenceEnrollment = {
        ...(data as SequenceEnrollment),
        id: data.id || uuidv4(),
        created_at: new Date().toISOString(),
      };
      store.sequenceEnrollments.push(record);
      persist();
      return record;
    },
    update: async (id: string, data: Partial<SequenceEnrollment>) => {
      const idx = store.sequenceEnrollments.findIndex((e) => e.id === id);
      if (idx === -1) return null;
      store.sequenceEnrollments[idx] = {
        ...store.sequenceEnrollments[idx],
        ...data,
      };
      persist();
      return store.sequenceEnrollments[idx];
    },
    remove: async (id: string) => {
      const before = store.sequenceEnrollments.length;
      store.sequenceEnrollments = store.sequenceEnrollments.filter(
        (e) => e.id !== id
      );
      return store.sequenceEnrollments.length < before;
    },
  },
  agentPrefs: {
    get: async (scope: WorkspaceMemberScope) =>
      ensurePersonalDefaults(scope),
    update: async (
      scope: WorkspaceMemberScope,
      data: Partial<AgentPrefs>
    ) => {
      const current = ensurePersonalDefaults(scope);
      const index = store.agentPrefs.findIndex((prefs) =>
        inScope(prefs, scope)
      );
      store.agentPrefs[index] = {
        ...current,
        ...data,
        workspace_id: scope.workspaceId,
        user_id: scope.userId,
        updated_at: new Date().toISOString(),
      };
      persist();
      return store.agentPrefs[index];
    },
  },
  draftSnippets: {
    list: async (scope: WorkspaceMemberScope) => {
      ensurePersonalDefaults(scope);
      return store.draftSnippets
        .filter((snippet) => inScope(snippet, scope))
        .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
    },
    create: async (
      scope: WorkspaceMemberScope,
      data: Partial<DraftSnippet>
    ) => {
      ensurePersonalDefaults(scope);
      const record: ScopedDraftSnippet = {
        ...(data as DraftSnippet),
        workspace_id: scope.workspaceId,
        user_id: scope.userId,
        id: data.id || uuidv4(),
        created_at: new Date().toISOString(),
      };
      store.draftSnippets.unshift(record);
      persist();
      return record;
    },
    update: async (
      scope: WorkspaceMemberScope,
      id: string,
      data: Partial<DraftSnippet>
    ) => {
      ensurePersonalDefaults(scope);
      const idx = store.draftSnippets.findIndex(
        (snippet) => snippet.id === id && inScope(snippet, scope)
      );
      if (idx === -1) return null;
      store.draftSnippets[idx] = {
        ...store.draftSnippets[idx],
        ...data,
        workspace_id: scope.workspaceId,
        user_id: scope.userId,
      };
      persist();
      return store.draftSnippets[idx];
    },
    bumpUse: async (scope: WorkspaceMemberScope, id: string) => {
      ensurePersonalDefaults(scope);
      const idx = store.draftSnippets.findIndex(
        (snippet) => snippet.id === id && inScope(snippet, scope)
      );
      if (idx === -1) return null;
      store.draftSnippets[idx] = {
        ...store.draftSnippets[idx],
        uses: (store.draftSnippets[idx].uses || 0) + 1,
      };
      persist();
      return store.draftSnippets[idx];
    },
    remove: async (scope: WorkspaceMemberScope, id: string) => {
      ensurePersonalDefaults(scope);
      const before = store.draftSnippets.length;
      store.draftSnippets = store.draftSnippets.filter(
        (snippet) => snippet.id !== id || !inScope(snippet, scope)
      );
      persist();
      return store.draftSnippets.length < before;
    },
  },
  agentChats: {
    list: async (scope: WorkspaceMemberScope, customerId: string) =>
      store.agentChats
        .filter(
          (message) =>
            message.customer_id === customerId && inScope(message, scope)
        )
        .sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        ),
    create: async (
      scope: WorkspaceMemberScope,
      data: Partial<AgentChatMessage>
    ) => {
      const record: ScopedAgentChatMessage = {
        ...(data as AgentChatMessage),
        workspace_id: scope.workspaceId,
        user_id: scope.userId,
        id: data.id || uuidv4(),
        created_at: new Date().toISOString(),
      };
      store.agentChats.push(record);
      persist();
      return record;
    },
    clear: async (scope: WorkspaceMemberScope, customerId: string) => {
      const before = store.agentChats.length;
      store.agentChats = store.agentChats.filter(
        (message) =>
          message.customer_id !== customerId || !inScope(message, scope)
      );
      persist();
      return before - store.agentChats.length;
    },
  },
  freyrKb: {
    get: async () => store.freyrKb,
    update: async (data: Partial<FreyrKb>) => {
      store.freyrKb = { ...store.freyrKb, ...data };
      return store.freyrKb;
    },
  },
};

export type MockDb = typeof mockDb;
