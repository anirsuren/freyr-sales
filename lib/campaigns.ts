// Campaigns v1 (Suren, Jul 3): campaign content is generated (then edited by a
// person), a list of recipient contacts is selected, and the blast goes out to
// everyone with an email. Sending is honestly MOCKED while the email channel is
// gated off — recipients queue with a clear status instead of pretending.
// (Deliverability/warm-up/marketing mechanics come later — the KonnectCo model
// via Naomi.)

export type CampaignStatus = "draft" | "queued";

export interface Campaign {
  id: string;
  name: string;
  offering_id: string | null;
  offering_name: string;
  subject: string;
  body: string;
  recipient_contact_ids: string[];
  status: CampaignStatus;
  queued_at: string | null;
  created_at: string;
}

interface CampaignStore {
  campaigns: Campaign[];
}

function store(): CampaignStore {
  const g = globalThis as typeof globalThis & { __freyrCampaigns?: CampaignStore };
  if (!g.__freyrCampaigns) g.__freyrCampaigns = { campaigns: [] };
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
}): Campaign {
  const c: Campaign = {
    id: uid(),
    name: data.name,
    offering_id: data.offering_id || null,
    offering_name: data.offering_name || "",
    subject: data.subject,
    body: data.body,
    recipient_contact_ids: data.recipient_contact_ids,
    status: "draft",
    queued_at: null,
    created_at: new Date().toISOString(),
  };
  store().campaigns.unshift(c);
  return c;
}

export function updateCampaign(
  id: string,
  patch: Partial<Pick<Campaign, "name" | "subject" | "body" | "recipient_contact_ids" | "status" | "queued_at">>
): Campaign | null {
  const c = getCampaign(id);
  if (!c) return null;
  Object.assign(c, patch);
  return c;
}
