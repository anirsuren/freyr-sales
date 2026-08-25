/**
 * LEADS — the thousands, before the hundreds (Suren, Aug 25 call).
 *
 * The whole reason this is a separate thing from an opportunity, in his words:
 * "there will be thousands of leads… but out of those only hundreds can be
 * your opportunities. That is why you want to keep something as a lead — so
 * that you don't discuss those 3000 items, you discuss only the opportunity."
 *
 * He nearly cut it ("I don't want to call anything as a lead, I'll just call
 * everything as an opportunity") and then talked himself back: "okay, then it
 * makes sense to keep that as a lead, because right now we need to focus on
 * opportunity — that's the main thing."
 *
 * WHAT A LEAD IS: an inbound that has not been qualified yet. His example:
 * "somebody came in and said, in the website, hey what is this demo?"
 *
 * WHAT HAPPENS AT LEAD LEVEL, and nowhere else: "at the lead level I do a
 * meeting and presentation, not at the contact level — because contact is just
 * a contact database." And never a submission: "I'm not going to do any
 * submissions [against a contact or a lead]. What I mean by submission is RFP
 * submissions, proposal submissions."
 *
 * So a lead can carry meetings and presentations, and when it turns real it
 * becomes an opportunity and stops being discussed as a lead.
 *
 * Client-safe: types and pure helpers. Store is lib/leads.ts.
 */

/** Where it came from. His example is the website; the rest is how a B2B
 *  regulatory business actually gets inbound. */
export const LEAD_SOURCES = [
  "Website",
  "Conference",
  "Referral",
  "Campaign",
  "Inbound email",
  "Partner",
  "Outbound",
  "Other",
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

/**
 * Deliberately four working states plus two endings. A lead's whole job is to
 * become an opportunity or stop taking up room in the pipeline meeting.
 */
export const LEAD_STATUSES = [
  "New",
  "Contacted",
  "Qualifying",
  "Nurturing",
  /** Became an opportunity. Terminal: the deal is the record from here. */
  "Converted",
  "Disqualified",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export type Lead = {
  id: string;
  /** LEAD-0001. Quotable in a meeting, never reused. */
  ref: string;
  /** The person who came in. */
  name: string;
  company: string;
  /** Set once the company is matched to a real account. A lead does not need
   *  one — most arrive before anybody has created the customer. */
  customerId?: string;
  title?: string;
  email?: string;
  phone?: string;
  country?: string;
  source: LeadSource;
  /** Free text: which offering they asked about, what they typed in the form. */
  interest?: string;
  offeringId?: string;
  status: LeadStatus;
  owner?: string;
  note?: string;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
  /** Set when Converted. The opportunity is the record from that point on. */
  convertedOpportunityId?: string;
  convertedAt?: string;
  disqualifiedReason?: string;
};

export type LeadsState = { leads: Lead[] };

export const EMPTY_LEADS: LeadsState = { leads: [] };

export function isOpenLead(lead: Lead): boolean {
  return lead.status !== "Converted" && lead.status !== "Disqualified";
}

export function nextLeadRef(existing: Lead[]): string {
  const highest = existing.reduce((max, l) => {
    const n = Number(/^LEAD-(\d+)$/.exec(l.ref)?.[1] ?? 0);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  return `LEAD-${String(highest + 1).padStart(4, "0")}`;
}

/* Status colours are reserved in this app — green means done, red means
   somebody stopped it. Converted earns green because it IS the win condition
   for a lead; Disqualified earns red because somebody decided no. Everything
   in between wears a working colour. */
export function leadStatusColor(status: LeadStatus): string {
  return status === "Converted"
    ? "#16A34A"
    : status === "Disqualified"
      ? "#DC2626"
      : status === "Qualifying"
        ? "#0071E3"
        : status === "Contacted"
          ? "#0891B2"
          : status === "Nurturing"
            ? "#7C3AED"
            : "#4338CA";
}

export function leadSourceColor(source: LeadSource): string {
  const map: Record<LeadSource, string> = {
    Website: "#0071E3",
    Conference: "#B4318F",
    Referral: "#0F766E",
    Campaign: "#7C3AED",
    "Inbound email": "#0891B2",
    Partner: "#C2410C",
    Outbound: "#4338CA",
    Other: "#8E98A8",
  };
  return map[source] ?? "#8E98A8";
}

/** How long this has been sitting, in whole days. Ageing is the whole point
 *  of a lead list: a lead nobody touched for a month is the finding. */
export function leadAgeDays(lead: Lead, now = Date.now()): number {
  const t = Date.parse(lead.updatedAt || lead.createdAt);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((now - t) / 86_400_000));
}
