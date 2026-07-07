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
  last_enriched_at: string;
  owner?: string | null;
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
