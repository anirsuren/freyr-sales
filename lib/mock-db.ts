import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
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
  agentPrefs: AgentPrefs;
  draftSnippets: DraftSnippet[];
  agentChats: AgentChatMessage[];
  freyrKb: FreyrKb;
}

declare global {
  // eslint-disable-next-line no-var
  var __FREYR_MOCK_STORE__: MockStore | undefined;
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
        "United States (Princeton, NJ) — offices in London, Singapore",
      enrichment_summary:
        "Mid-size clinical-stage biopharma, ~450 employees, Series D, 3 Phase 2 compounds + 1 NDA-ready. Focus on biologics for oncology and autoimmune. Working across FDA and EMA.",
      created_at: new Date("2025-11-15").toISOString(),
      last_enriched_at: new Date("2025-11-15").toISOString(),
    },
    {
      id: "cust-002",
      company_name: "Indavel Pharma",
      website_url: "https://indavelpharma.com",
      size_tier: "small",
      industry: "Pharmaceutical",
      geography: "India (Mumbai) — expanding to EU",
      enrichment_summary:
        "Small generic pharma company, ~80 employees, focused on ANDA filings for US market entry. First-time FDA submitter.",
      created_at: new Date("2025-12-01").toISOString(),
      last_enriched_at: new Date("2025-12-01").toISOString(),
    },
  ];

  const contacts: Contact[] = [
    {
      id: "cont-001",
      customer_id: "cust-001",
      full_name: "Dr. Priya Mehta",
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
            duration: "2019 – Present",
            description:
              "Leading global regulatory strategy for a pipeline of 8 biologics and 3 small molecules.",
          },
          {
            title: "Director, Regulatory Affairs",
            company: "Novartis",
            duration: "2014 – 2019",
          },
          {
            title: "Regulatory Reviewer",
            company: "US FDA (CDER)",
            duration: "2008 – 2014",
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
      logged_by: "Suren Dheen",
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
    { id: "009", company: "Quantum Oncology", size: "mid", industry: "Biotechnology", geo: "United States (South SF, CA)", csum: "Precision-oncology biotech, ADC platform, two pivotal trials.", contact: "Dr. Arun Pillai", title: "Chief Medical Officer", role: "Medical Affairs", csumc: "Physician-scientist; cares about trial regulatory de-risking.", service: "Clinical Trial Regulatory Support", score: 8, outcome: "meeting_booked", days: 2, note: "Exec sponsor engaged; aligning on scope.", follow: 8, review: "approved" },
    { id: "010", company: "Meridian Pharmaceuticals", size: "large", industry: "Pharmaceutical", geo: "Switzerland (Basel)", csum: "Global generics + specialty; high-volume ANDA/MAA submissions.", contact: "Claudia Hofmann", title: "Global Head, Reg Submissions", role: "Executive", csumc: "Runs a high-throughput global submissions factory.", service: "Regulatory Submission Services", score: 9, outcome: "not_interested", days: 18, note: "Has incumbent vendor mid-contract.", inUse: ["of-001"], usage: [
      { offering_id: "of-001", revenue_lines: [
        { id: "rev-m1", revenue_type: "license", amount: 260000, num_licenses: 32, start_date: "2026-03-01", end_date: "2027-02-28", description: "Freya.Register licenses for the submissions team." },
      ] },
    ] },
    { id: "011", company: "Northwind Biosciences", size: "small", industry: "Biotechnology", geo: "Canada (Toronto)", csum: "Seed-stage biotech, pre-IND, first-time FDA filer.", contact: "Owen Bradley", title: "Co-founder & COO", role: "Executive", csumc: "Wears many hats; needs end-to-end regulatory hand-holding.", service: "Clinical Trial Regulatory Support", score: 7, outcome: null, days: 1 },
    { id: "012", company: "Orion Vaccines", size: "mid", industry: "Biotechnology", geo: "United States (Rockville, MD)", csum: "Vaccine developer, pandemic-preparedness portfolio, EUA experience.", contact: "Dr. Hana Kim", title: "VP Regulatory Strategy", role: "Regulatory Affairs", csumc: "Led multiple EUAs; values speed and agency relationships.", service: "Regulatory Intelligence", score: 8, outcome: "interested", days: 16, note: "Wants global guidance monitoring.", follow: 5 },
  ];

  for (const s of specs) {
    const cid = `cust-${s.id}`;
    const ctid = `cont-${s.id}`;
    const sid = `sess-${s.id}`;
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
      ...(s.ctype
        ? {
            customer_type: s.ctype,
            ownership: s.own || null,
            revenue: s.rev || null,
            analyzed_at: iso(s.days),
            offerings_in_use: s.inUse || [],
          }
        : s.inUse
        ? { offerings_in_use: s.inUse }
        : {}),
      ...(s.usage ? { offering_usage: s.usage } : {}),
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
      created_at: iso(s.days),
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
        logged_by: "Suren Dheen",
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
      summary: "Researched, matched services, and drafted — you reviewed, approved, and sent it.",
      steps: [
        { label: "Researched the account", detail: "Scanned Helix Biologics' profile, signals, and history", status: "done" },
        { label: "Matched Freyr services", detail: "Led with Global Labeling Strategy", status: "done" },
        { label: "Drafted the outreach", detail: "Tailored email + call angle for SVP Global Regulatory", status: "done" },
        { label: "Compliance approval", detail: "You reviewed and approved it", status: "gated" },
        { label: "Sent by you", detail: "You sent it after approving — the agent never sends on its own", status: "done" },
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
        { label: "Re-engage Aether Medical Devices", detail: "Drafted and saved to the timeline — review and send when you're ready. Nothing sent.", status: "done" },
        { label: "Follow up with Cortexa Biopharma", detail: "Drafted and saved to the timeline — review and send when you're ready. Nothing sent.", status: "done" },
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

  const agentPrefs: AgentPrefs = {
    id: "prefs-001",
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
    updated_at: iso(0),
  };

  // A seeded snippet so the library reads as live and "Insert" works on day one.
  const draftSnippets: DraftSnippet[] = [
    {
      id: "snip-seed-001",
      title: "Submission-timeline intro",
      subject: "Hitting your submission timeline",
      body: `Hi there,\n\nFreyr's regulatory submission team helps clinical-stage teams hit FDA/EMA timelines without adding headcount. Worth a 20-minute call to see if it fits your near-term milestones?\n\nBest,\nSuren Dheen · Freyr`,
      uses: 4,
      created_at: iso(3),
    },
  ];

  return {
    customers,
    contacts,
    pitchSessions,
    interactions,
    agentRuns,
    sequenceEnrollments,
    agentPrefs,
    draftSnippets,
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
const SCHEMA_VERSION = 1;
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
    findByName: async (name: string) =>
      store.customers.find(
        (c) => c.company_name.toLowerCase() === name.toLowerCase()
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
    get: async () => store.agentPrefs,
    update: async (data: Partial<AgentPrefs>) => {
      store.agentPrefs = {
        ...store.agentPrefs,
        ...data,
        updated_at: new Date().toISOString(),
      };
      persist();
      return store.agentPrefs;
    },
  },
  draftSnippets: {
    list: async () =>
      [...store.draftSnippets].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ),
    create: async (data: Partial<DraftSnippet>) => {
      const record: DraftSnippet = {
        ...(data as DraftSnippet),
        id: data.id || uuidv4(),
        created_at: new Date().toISOString(),
      };
      store.draftSnippets.unshift(record);
      return record;
    },
    update: async (id: string, data: Partial<DraftSnippet>) => {
      const idx = store.draftSnippets.findIndex((s) => s.id === id);
      if (idx === -1) return null;
      store.draftSnippets[idx] = { ...store.draftSnippets[idx], ...data };
      return store.draftSnippets[idx];
    },
    bumpUse: async (id: string) => {
      const idx = store.draftSnippets.findIndex((s) => s.id === id);
      if (idx === -1) return null;
      store.draftSnippets[idx] = {
        ...store.draftSnippets[idx],
        uses: (store.draftSnippets[idx].uses || 0) + 1,
      };
      return store.draftSnippets[idx];
    },
    remove: async (id: string) => {
      const before = store.draftSnippets.length;
      store.draftSnippets = store.draftSnippets.filter((s) => s.id !== id);
      return store.draftSnippets.length < before;
    },
  },
  agentChats: {
    list: async (customerId: string) =>
      store.agentChats
        .filter((m) => m.customer_id === customerId)
        .sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        ),
    create: async (data: Partial<AgentChatMessage>) => {
      const record: AgentChatMessage = {
        ...(data as AgentChatMessage),
        id: data.id || uuidv4(),
        created_at: new Date().toISOString(),
      };
      store.agentChats.push(record);
      return record;
    },
    clear: async (customerId: string) => {
      const before = store.agentChats.length;
      store.agentChats = store.agentChats.filter(
        (m) => m.customer_id !== customerId
      );
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
