// Campaigns v1 (Suren, Jul 3): campaign content is generated (then edited by a
// person), a list of recipient contacts is selected, and the blast goes out to
// everyone with an email. Sending stays MOCKED while the email channel is gated
// off — but the store seeds a few finished demo campaigns (Anir, Jul 3: "show
// mock data — I need to see how the graphs would look") so every chart on the
// campaigns pages renders with realistic numbers, exactly like the rest of the
// app's seeded customers/deals/sessions. Campaigns a user creates at runtime
// keep honest zeros until the channel connects.
import { getDataMode } from "./dataMode";

export type CampaignStatus = "draft" | "queued" | "sent";
export type CampaignObjective = "pipeline" | "awareness" | "event_follow_up" | "expansion";

export interface Campaign {
  id: string;
  name: string;
  offering_id: string | null;
  offering_name: string;
  subject: string;
  body: string;
  recipient_contact_ids: string[];
  objective: CampaignObjective;
  owner: string;
  owner_user_id: string | null;
  workspace_id: string | null;
  audience_summary: string;
  scheduled_at: string | null;
  status: CampaignStatus;
  // Deliveries + engagement. Seeded demo campaigns carry realistic numbers;
  // runtime-created campaigns start at 0 and stay honest until email connects.
  sent_count: number;
  opens: number;
  replies: number;
  queued_at: string | null;
  sent_at: string | null;
  created_at: string;
}

interface CampaignStore {
  campaigns: Campaign[];
}

// Demo campaigns over the same seeded contacts as the rest of the app, so the
// cross-links (recipients → contact pages, voice touches) all resolve.
function seedCampaigns(): Campaign[] {
  const d = (days: number) =>
    new Date(Date.now() - days * 86_400_000).toISOString();
  return [
    {
      id: "camp-seed-001",
      name: "Freya.Register Q3 awareness",
      offering_id: "of-001",
      offering_name: "Freya.Register",
      subject: "One source of truth for every registration you own",
      body: "Hi {{first_name}},\n\nTeams juggling FDA, EMA and PMDA timelines usually track registrations in spreadsheets that drift out of date the week they're made. Freya.Register keeps every product, market and license in one live view: with the renewals and commitments surfaced before they become fire drills.\n\nWorth a 20-minute look at how it would sit on top of your current tracker?\n\nBest,\nFreyr team",
      recipient_contact_ids: [
        "cont-004",
        "cont-005",
        "cont-009",
        "cont-010",
        "cont-006",
        "cont-012",
      ],
      objective: "awareness",
      owner: "Walter Hensley",
      owner_user_id: null,
      workspace_id: null,
      audience_summary: "Regulatory leaders at biopharma accounts",
      scheduled_at: null,
      status: "sent",
      sent_count: 6,
      opens: 4,
      replies: 2,
      queued_at: d(7),
      sent_at: d(6),
      created_at: d(9),
    },
    {
      id: "camp-seed-002",
      name: "Regulatory Intelligence pilot invite",
      offering_id: "of-023",
      offering_name: "Regulatory Intelligence Services",
      subject: "Guidance changes, summarized before they hit your inbox",
      body: "Hi {{first_name}},\n\nMost RA teams find out about guidance changes from a colleague's forward. Our Regulatory Intelligence service watches the agencies you care about and sends periodic, source-linked updates your team can act on: consulting, on-demand research, or embedded FTE support.\n\nWe're inviting a few teams into a pilot this quarter. Interested?\n\nBest,\nFreyr team",
      recipient_contact_ids: [
        "cont-007",
        "cont-012",
        "cont-003",
        "cont-006",
        "cont-011",
      ],
      objective: "pipeline",
      owner: "Walter Hensley",
      owner_user_id: null,
      workspace_id: null,
      audience_summary: "Regulatory intelligence prospects",
      scheduled_at: null,
      status: "queued",
      sent_count: 2,
      opens: 1,
      replies: 0,
      queued_at: d(1),
      sent_at: null,
      created_at: d(2),
    },
    {
      id: "camp-seed-003",
      name: "Labeling compliance intro",
      offering_id: null,
      offering_name: "",
      subject: "Six markets, one label change: without the scramble",
      body: "Draft: pick the labeling offering to ground this, then tighten the hook before queueing.",
      recipient_contact_ids: ["cont-008", "cont-004", "cont-010"],
      objective: "pipeline",
      owner: "Walter Hensley",
      owner_user_id: null,
      workspace_id: null,
      audience_summary: "Labeling and compliance stakeholders",
      scheduled_at: null,
      status: "draft",
      sent_count: 0,
      opens: 0,
      replies: 0,
      queued_at: null,
      sent_at: null,
      created_at: d(0.4),
    },
    ...generatedCampaigns(d),
  ];
}

/**
 * THE REST OF THE CAMPAIGN HISTORY.
 *
 * Three campaigns is a screenshot, not a workspace: the list was three cards,
 * the objective filter had one row per bucket at best, and the performance
 * comparison had nothing to compare (Anir, Aug 31: "every rabbit hole needs to
 * have a shit ton of data"). A year of sends against the generated book of
 * accounts, so the list pages, the objective mix and the open/reply
 * distributions all have a real spread behind them.
 *
 * Deterministic: index arithmetic against the same seeded contacts the rest of
 * mock uses, so two reads never disagree and every recipient link resolves.
 */
function generatedCampaigns(d: (days: number) => string): Campaign[] {
  const DEFS: [string, string, CampaignObjective, string, string][] = [
    ["Freya.Submit publishing webinar", "of-004", "awareness", "Publishing checks before the sequence goes out", "Heads of submissions and publishing"],
    ["Label change readiness check", "of-005", "pipeline", "Six markets, one label change, one source of truth", "Labeling leads across mid and large pharma"],
    ["DIA follow-up: booth conversations", "of-001", "event_follow_up", "Good to meet you at DIA", "Everyone we spoke to at the booth"],
    ["Artwork rework cost teardown", "of-006", "pipeline", "What an artwork error actually costs you", "Packaging and artwork owners"],
    ["Freya.Intelligence quarterly digest", "of-003", "awareness", "This quarter's regulatory changes, by market", "Regulatory intelligence subscribers"],
    ["Renewals coming due in Q1", "of-001", "expansion", "Twelve renewals on your book close inside 90 days", "Existing Freya.Register accounts"],
    ["Device makers: MDR technical files", "of-show-001", "pipeline", "Your technical file is not a folder", "Device regulatory and quality leads"],
    ["RIM Summit follow-up", "of-002", "event_follow_up", "The slides from our RIM Summit session", "RIM Summit attendee list"],
    ["Add the intelligence feed", "of-003", "expansion", "You have the registrations. Add the early warning.", "Register customers without Intelligence"],
    ["First-time filers: where teams lose months", "of-show-005", "pipeline", "The three things that delay a first submission", "Small biotech, pre-first-filing"],
    ["Freya Fusion platform overview", "of-show-016", "awareness", "One platform, every regulatory workflow", "Large pharma platform evaluators"],
    ["Pharmacovigilance capacity check", "of-show-023", "pipeline", "Case volume up, headcount flat. Now what?", "Safety and PV leads"],
    ["Generics: variation volume", "of-show-012", "pipeline", "340 variations a year is a tooling problem", "Generics regulatory affairs"],
    ["Agent pack for existing platforms", "of-show-020", "expansion", "Add our agents to the system you already run", "Accounts on a competitor platform"],
    ["Consumer health claims review", "of-show-002", "pipeline", "Claims that survive both the lawyer and the regulator", "Consumer health regulatory"],
    ["APAC registration expansion", "of-show-003", "expansion", "Eight markets, one registration book", "Accounts expanding into APAC"],
    ["Freya Docs migration offer", "of-007", "pipeline", "Move your controlled documents without a two-year project", "Document management owners"],
    ["Year-end regulatory outlook", "of-show-010", "awareness", "What is coming in regulation next year", "Full intelligence list"],
    ["Submission publishing health check", "of-show-006", "pipeline", "A free read of your last five sequences", "Publishing teams at mid-size filers"],
    ["Cell and gene: comparability", "of-show-022", "pipeline", "Three authorities, three views, one package", "Advanced therapy developers"],
    ["Post-inspection remediation support", "of-show-024", "pipeline", "After the observations, before the deadline", "Accounts with recent inspection findings"],
    ["IDMP readiness", "of-show-051", "awareness", "IDMP is a master data project wearing a compliance hat", "EU market authorisation holders"],
    ["Customer advisory board invite", "of-002", "expansion", "Join the customer advisory board", "Top accounts by revenue"],
    ["Re-engage: quiet since spring", "of-001", "pipeline", "Picking this back up where we left it", "Accounts with no activity in 90 days"],
  ];
  /* Recipients come from the generated contact book, so every name on a
     campaign opens a contact page that exists. */
  const contactAt = (k: number) =>
    `cont-fill-${String((k % 140) + 1).padStart(3, "0")}-${(k % 5) + 1}`;
  const OWNERS = [
    "Walter Hensley", "Gordon Ashby", "Margaret Whitfield", "Mark Miller",
    "Eleanor Rutherford", "Marcus Bramwell", "Sylvia Ashcroft",
  ];
  return DEFS.map(([name, offeringId, objective, subject, audience], i) => {
    /* Two thirds sent, then queued, then drafts — the shape of a real list,
       where most of the history is behind you. */
    const status: CampaignStatus =
      i % 9 === 7 ? "queued" : i % 9 === 8 ? "draft" : "sent";
    const size = 18 + ((i * 13) % 62);
    const recipients = Array.from({ length: size }, (_, k) =>
      contactAt(i * 37 + k * 3)
    );
    const sent = status === "sent" ? size : status === "queued" ? Math.floor(size / 3) : 0;
    /* Open and reply rates in the band a real B2B list produces — 28-46% and
       3-9% — rather than a flat percentage on every row. */
    const opens = Math.round(sent * (0.28 + ((i * 7) % 19) / 100));
    const replies = Math.round(sent * (0.03 + ((i * 5) % 7) / 100));
    const age = 6 + i * 14;
    return {
      id: `camp-fill-${String(i + 1).padStart(3, "0")}`,
      name,
      offering_id: offeringId,
      offering_name: "",
      subject,
      body: `Hi {{first_name}},\n\n${subject}. We put together a short read on how teams in your position are handling it, and what it changes about the way the work gets planned.\n\nWorth twenty minutes to walk through where it would sit against what you run today?\n\nBest,\nFreyr team`,
      recipient_contact_ids: recipients,
      objective,
      owner: OWNERS[i % OWNERS.length]!,
      owner_user_id: null,
      workspace_id: null,
      audience_summary: audience,
      scheduled_at: null,
      status,
      sent_count: sent,
      opens,
      replies,
      queued_at: status === "draft" ? null : d(age + 1),
      sent_at: status === "sent" ? d(age) : null,
      created_at: d(age + 3),
    };
  });
}

function store(): CampaignStore {
  const g = globalThis as typeof globalThis & {
    __freyrCampaigns?: CampaignStore;
    __freyrLiveCampaigns?: CampaignStore;
  };
  if (getDataMode() === "live") {
    if (!g.__freyrLiveCampaigns) g.__freyrLiveCampaigns = { campaigns: [] };
    return g.__freyrLiveCampaigns;
  }
  if (!g.__freyrCampaigns) g.__freyrCampaigns = { campaigns: seedCampaigns() };
  return g.__freyrCampaigns;
}

let n = 0;
const uid = () => `camp-${Date.now().toString(36)}-${n++}`;

export function listCampaigns(): Campaign[] {
  return store().campaigns;
}

export function getCampaign(id: string): Campaign | null {
  return store().campaigns.find((c) => c.id === id) || null;
}

export function createCampaign(data: {
  name: string;
  offering_id?: string | null;
  offering_name?: string;
  subject: string;
  body: string;
  recipient_contact_ids: string[];
  objective?: CampaignObjective;
  owner?: string;
  owner_user_id?: string | null;
  workspace_id?: string | null;
  audience_summary?: string;
  scheduled_at?: string | null;
}): Campaign {
  const c: Campaign = {
    id: uid(),
    name: data.name,
    offering_id: data.offering_id || null,
    offering_name: data.offering_name || "",
    subject: data.subject,
    body: data.body,
    recipient_contact_ids: data.recipient_contact_ids,
    objective: data.objective || "pipeline",
    owner: data.owner?.trim() || "Unassigned",
    owner_user_id: data.owner_user_id || null,
    workspace_id: data.workspace_id || null,
    audience_summary: data.audience_summary || "Selected contacts",
    scheduled_at: data.scheduled_at || null,
    status: "draft",
    sent_count: 0,
    opens: 0,
    replies: 0,
    queued_at: null,
    sent_at: null,
    created_at: new Date().toISOString(),
  };
  store().campaigns.unshift(c);
  return c;
}

export function updateCampaign(
  id: string,
  patch: Partial<Pick<Campaign, "name" | "subject" | "body" | "recipient_contact_ids" | "status" | "queued_at" | "scheduled_at" | "objective" | "audience_summary">>
): Campaign | null {
  const c = getCampaign(id);
  if (!c) return null;
  Object.assign(c, patch);
  return c;
}
