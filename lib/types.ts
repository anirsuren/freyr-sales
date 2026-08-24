// Shared types mirroring the Supabase schema (Section 13) and the Claude
// analysis outputs (Section 8). Used across lib + API + components.

export type SizeTier = "small" | "mid" | "large";

export type Outcome =
  | "interested"
  | "not_interested"
  | "in_progress"
  | "no_response"
  | "meeting_booked"
  | "ai_call_completed"
  | "ai_call_failed";

export interface AccountNote {
  id: string;
  author: string;
  body: string;
  created_at: string;
  // Log a real interaction, not just free text (Suren): call / email / meeting /
  // note, plus an optional next step and follow-up date.
  kind?: "call" | "email" | "meeting" | "note" | null;
  next_step?: string | null;
  follow_up_date?: string | null;
}

export interface AccountAttachment {
  id: string;
  name: string;
  url: string | null;
  created_at: string;
}

export interface AccountDeal {
  id: string;
  name: string;
  stage: string;
  value: number;
  created_at: string;
  // Richer deal detail (Suren: "this is an enterprise app… this is all you
  // have for a new deal?"). All optional so existing deals still validate.
  offering?: string | null;
  contact?: string | null;
  owner?: string | null;
  // Stable workspace-member attribution for new writes. `owner` remains as a
  // denormalized display label so historical records and existing UI continue
  // to render while identity-sensitive comparisons use this id when present.
  owner_user_id?: string | null;
  close_date?: string | null;
  next_step?: string | null;
  notes?: string | null;
}

export interface Customer {
  id: string;
  company_name: string;
  website_url: string | null;
  raw_scrape?: string | null;
  size_tier: SizeTier | null;
  industry: string | null;
  geography: string | null;
  enrichment_summary: string | null;
  created_at: string;
  /** WHO PUT THIS ACCOUNT IN (Anir, Aug 23: "same thing for: Offering,
   *  Opportunities, Customers, Team"). Optional and blank on everything that
   *  predates the field — those accounts show their date alone rather than an
   *  invented author. Distinct from `owner`, which is who works it now. */
  created_by?: string | null;
  last_enriched_at: string;
  owner?: string | null;
  owner_user_id?: string | null;
  workspace_id?: string | null;
  competitor?: string | null;
  notes_log?: AccountNote[];
  attachments?: AccountAttachment[];
  account_deals?: AccountDeal[];
  // Customer analysis (Suren's Jun 27 ask): the offerings customer-type this
  // account qualifies as (e.g. "Pharmaceutical - Large"), whether it's a public
  // or private company, and its revenue — proposed by "Analyze the customer"
  // from the web, then approved.
  customer_type?: string | null;
  ownership?: string | null; // "Public" | "Private"
  revenue?: string | null;
  analyzed_at?: string | null;
  // Offerings this customer ALREADY uses (offering ids) — the adoption link:
  // the customer's Offerings tab splits the applicable list into "already
  // using" vs. the opportunities left to sell.
  offerings_in_use?: string[] | null;
  // Commercial detail per in-use offering (Suren's Jul 5 dictation): for each
  // offering they're using, one or more revenue lines — how we make money on
  // it (annual / project / service / license), the amount, dates, licenses.
  // Feeds the offering's "Reports" tab (revenue cumulated across customers).
  offering_usage?: OfferingUsage[] | null;
  /** The FDL components this customer actually runs, and which version of
   *  each (Suren, Aug 8: "from a customer side you should be able to connect
   *  customer to all components — which release of the version of the
   *  component they are connecting… so any time I look at what software
   *  components the customer has, I click on the customer"). */
  digital_components?: CustomerComponentLink[] | null;
}

/** One component a customer runs, pinned to the version they are on. */
export interface CustomerComponentLink {
  component_id: string;
  /** FdlRelease id they are live on. Null when nobody has recorded it yet. */
  release_id?: string | null;
  /** The version they are expected to move to next, when it is agreed. */
  next_release_id?: string | null;
  /**
   * WHETHER THAT VERSION IS ACTUALLY THEIRS YET. Suren, Aug 9: "end of the day
   * the software may be already given to the customer, or the customer is
   * expecting but I have not given it to them. If it's a potential lead I just
   * want to say this is the version they would like… a version people have to
   * work towards." A version carries its own status (has Freyr shipped it at
   * all); this is the separate fact of whether it has reached THIS customer.
   */
  release_status?: "released" | "expected" | null;
  notes?: string | null;
}

// The customer × offering heat map keeps the commercial journey separate from
// revenue lines. A customer can have several historical versions for the same
// offering, but only the version with `linked: true` is shown in the matrix.
// Old versions stay in the record when they are unlinked so the report never
// loses the activity trail.
/**
 * THE FIVE ACTIVITIES, from Suren's Activities sheet (Aug 8). The catalogue
 * used to carry fourteen shades of the same journey — "you have too many
 * activities here… those are the only activities that should come" — and the
 * old legend (To pitch, Under contract, Implemented…) now reads as an
 * activity plus a status instead of its own entry.
 */
export type CustomerOfferingActivity =
  | "lead"
  | "opportunity"
  | "pilot"
  | "contract"
  | "delivery";

/** And exactly three statuses, same sheet. */
export type CustomerOfferingStatus =
  | "initiated"
  | "under_progress"
  | "completed";

export type CustomerOfferingCurrency =
  | "USD"
  | "EUR"
  | "GBP"
  | "CHF"
  | "CAD"
  | "AUD"
  | "JPY"
  | "CNY"
  | "INR"
  | "SGD"
  | "AED"
  | "SAR"
  | "SEK"
  | "NOK"
  | "DKK"
  | "NZD"
  | "ZAR"
  | "BRL"
  | "MXN";

/** When each status was reached — stamped as the status moves, editable after
 *  (Suren: "if it says initiated, when did the initiated date? Under progress
 *  what date it is? Completed if it is…"). */
export interface CustomerOfferingStatusDates {
  initiated?: string | null;
  under_progress?: string | null;
  completed?: string | null;
}

export interface CustomerOfferingEngagementVersion {
  id: string;
  version: number;
  linked: boolean;
  activity: CustomerOfferingActivity;
  activity_description: string | null;
  /** Free notes about this specific activity ("I am meeting this customer…"). */
  comments?: string | null;
  status: CustomerOfferingStatus;
  status_dates?: CustomerOfferingStatusDates;
  dollar_value: number;
  /** Optional for backward compatibility; records created before currency
   * selection existed are USD. */
  currency?: CustomerOfferingCurrency;
  start_date: string | null;
  end_date: string | null;
  /** The expected commercial close, which is separate from the activity end. */
  potential_close_date?: string | null;
  opportunity_ids: string[];
  proposal_ids: string[];
  contract_ids: string[];
  created_at: string;
  updated_at: string;
}

// How Freyr earns on an in-use offering (Suren: "revenue type — annual,
// project, annual service, or annual license revenue").
export type RevenueType = "annual" | "project" | "annual_service" | "license";

export interface OfferingRevenueLine {
  id: string;
  revenue_type: RevenueType;
  amount: number; // annual/project/service revenue $, or the license revenue $
  num_licenses?: number | null; // only for license revenue
  start_date: string | null; // yyyy-mm-dd
  end_date: string | null;
  description?: string | null; // e.g. "implementation project for them"
}

export interface OfferingUsage {
  offering_id: string;
  revenue_lines: OfferingRevenueLine[];
  engagement_versions?: CustomerOfferingEngagementVersion[];
  /** Shared, unfinished activity. It is excluded from the heat map until saved. */
  engagement_draft?: CustomerOfferingEngagementVersion | null;
}

export interface Contact {
  id: string;
  customer_id: string;
  full_name: string;
  email: string | null;
  linkedin_url: string | null;
  phone: string | null;
  raw_linkedin_data?: any;
  job_title: string | null;
  role_bucket: string | null;
  career_summary: string | null;
  enrichment_summary: string | null;
  created_at: string;
  last_enriched_at: string;
}

export interface RecommendedService {
  service_name: string;
  relevance_score: number;
  why_this_customer?: string;
  why_this_contact?: string;
  pitch_angle: string;
  freyr_language_to_use?: string[];
}

export interface PitchEmail {
  subject_lines: string[];
  body: string;
}

export interface PitchCallScript {
  opener: string;
  value_prop: string;
  permission_question: string;
  if_bad_time_voicemail: string;
  if_good_time_continue: string;
  qualifying_questions: string[];
}

export interface PitchVersion {
  id: string;
  created_at: string;
  source: "initial" | "regenerate" | "manual";
  pitch_5min_script: string;
  pitch_email: string;
  pitch_call_script: string;
}

export interface PitchSession {
  id: string;
  customer_id: string;
  contact_id: string;
  kb_version: number;
  recommended_services: RecommendedService[];
  pitch_email: PitchEmail | string;
  pitch_5min_script: string;
  pitch_call_script: PitchCallScript | string;
  additional_context: string | null;
  created_at: string;
  pitch_versions?: PitchVersion[];
  // compliance approval workflow (V2 #7)
  review_status?: ReviewStatus;
  reviewer?: string | null;
  review_note?: string | null;
  reviewed_at?: string | null;
}

export type ReviewStatus =
  | "draft"
  | "in_review"
  | "approved"
  | "changes_requested";

export interface Interaction {
  id: string;
  pitch_session_id: string | null;
  customer_id: string;
  contact_id: string;
  outcome: Outcome;
  notes: string | null;
  follow_up_date: string | null;
  logged_by: string;
  created_at: string;
}

// Persisted agent run history (V9). Every time the agent acts — a one-click
// "handle", a full play, or an autopilot pass — it records an AgentRun with the
// step-by-step detail of what it did, so the work is transparent and durable.
export type AgentRunKind = "act" | "play" | "autopilot" | "plan";

export type AgentStepStatus = "done" | "gated" | "escalated" | "skipped";

export interface AgentRunStep {
  label: string;
  detail?: string;
  status: AgentStepStatus;
}

export interface AgentRun {
  id: string;
  kind: AgentRunKind;
  // Signed workspace member that created this run. The display label is kept
  // for readable history; authorization uses the stable app_users id.
  created_by_user_id?: string | null;
  created_by?: string | null;
  title: string;
  customer_id: string | null;
  company: string | null;
  outcome: "handled" | "sent" | "escalated" | "mixed";
  summary: string;
  steps: AgentRunStep[];
  created_at: string;
  // Timeline entries this run created, so an auto-handled run can be undone (V9).
  interaction_ids?: string[];
  reverted?: boolean;
  // The actual draft the agent produced (email/plan) so "Draft it for me" shows
  // real, readable output and the run page can display it — not just a log line.
  draft?: { title: string; body: string } | null;
}

// Personal agent state is always addressed through a verified workspace member.
// Keeping both ids in one required value prevents a caller from accidentally
// reading the first/global preference row or another rep's private drafts/chat.
export interface WorkspaceMemberScope {
  workspaceId: string;
  userId: string;
}

// Per-account agent chat (V9 #45) — the "Ask the agent" thread, persisted so the
// agent remembers the conversation per account across visits.
export interface AgentChatMessage {
  id: string;
  customer_id: string;
  role: "me" | "agent";
  text: string;
  source?: "claude" | "mock";
  created_at: string;
}

// Draft library (V9 #39) — reusable outreach snippets the rep saves from the
// agent's drafts and can drop into future plays. The agent's growing template
// memory.
export interface DraftSnippet {
  id: string;
  title: string;
  subject: string;
  body: string;
  uses: number;
  created_at: string;
}

// Persisted sequence enrollment (V9). The agent can enroll an account into a
// cadence as part of a play; these survive navigation and show on Sequences.
export interface SequenceEnrollment {
  id: string;
  customer_id: string;
  sequence_id: string;
  step_index: number;
  enrolled_by: string;
  created_at: string;
}

// Agent memory (V9 #25) — standing preferences the rep pins and the agent's
// autopilot respects on every run. Mock-first; one row.
export type DraftTone = "warm" | "formal" | "brief";
export type AutopilotCadence = "off" | "daily" | "weekly";

export interface AgentPrefs {
  id: string;
  focus_industry: string | null; // only act on this industry; null = all
  only_mine: boolean; // focus the agent on my accounts only (vs the whole book)
  autopilot_reengage: boolean; // autopilot may auto-handle cooling re-engagement
  autopilot_stabilize: boolean; // autopilot may auto-handle at-risk stabilization
  // High-value guardrail (#75): autopilot/plans escalate (never auto-handle)
  // draftable actions on accounts whose open pipeline exceeds this. null = off.
  autopilot_max_value: number | null;
  draft_tone: DraftTone; // the rep's default voice for agent-drafted outreach
  // Autopilot schedule (catch-up model): the agent flags a run as due on the
  // rep's next visit; a deployment cron would fire it on time.
  autopilot_cadence: AutopilotCadence;
  autopilot_last_run: string | null;
  // Daily-briefing schedule, same catch-up model.
  digest_cadence: AutopilotCadence;
  digest_last_sent: string | null;
  // Who the rep is. The agent writes in their voice, so a name and a job title
  // were never enough — everything it drafted read generically. The LinkedIn
  // URL is what the rep pastes; the three fields under it are what the
  // enrichment run fills in from that URL, and what the agent actually reads.
  linkedin_url: string | null;
  linkedin_headline: string | null; // "VP Regulatory Affairs at Freyr"
  linkedin_about: string | null; // background paragraph, trimmed
  linkedin_photo: string | null; // replaces the initials circle
  linkedin_synced_at: string | null;
  /** Account-backed history for the main Agent workspace. Kept with the rep's
   * private preferences because both are scoped to one verified member. */
  conversation_state?: unknown[];
  updated_at: string;
}

export interface FreyrKb {
  id: string;
  structured_kb: any | null;
  raw_crawl_text?: string | null;
  crawled_at: string | null;
  page_count: number;
  version: number;
}

export interface MatchingOutput {
  recommended_services: RecommendedService[];
  customer_summary: string;
  contact_summary: string;
  recommended_tone: string;
  things_to_avoid: string[];
}

export interface PitchOutput {
  pitch_5min_script: string;
  pitch_email: PitchEmail;
  pitch_call_script: PitchCallScript;
}
