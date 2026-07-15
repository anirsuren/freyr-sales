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
      body: "Hi {{first_name}},\n\nTeams juggling FDA, EMA and PMDA timelines usually track registrations in spreadsheets that drift out of date the week they're made. Freya.Register keeps every product, market and license in one live view — with the renewals and commitments surfaced before they become fire drills.\n\nWorth a 20-minute look at how it would sit on top of your current tracker?\n\nBest,\nFreyr team",
      recipient_contact_ids: [
        "cont-004",
        "cont-005",
        "cont-009",
        "cont-010",
        "cont-006",
        "cont-012",
      ],
      objective: "awareness",
      owner: "Suren Dheen",
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
      body: "Hi {{first_name}},\n\nMost RA teams find out about guidance changes from a colleague's forward. Our Regulatory Intelligence service watches the agencies you care about and sends periodic, source-linked updates your team can act on — consulting, on-demand research, or embedded FTE support.\n\nWe're inviting a few teams into a pilot this quarter. Interested?\n\nBest,\nFreyr team",
      recipient_contact_ids: [
        "cont-007",
        "cont-012",
        "cont-003",
        "cont-006",
        "cont-011",
      ],
      objective: "pipeline",
      owner: "Suren Dheen",
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
      subject: "Six markets, one label change — without the scramble",
      body: "Draft — pick the labeling offering to ground this, then tighten the hook before queueing.",
      recipient_contact_ids: ["cont-008", "cont-004", "cont-010"],
      objective: "pipeline",
      owner: "Suren Dheen",
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
  ];
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
    owner: data.owner || "Suren Dheen",
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
