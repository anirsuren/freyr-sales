// Plain-English definitions for every bit of jargon, metric, and abbreviation in
// the app. One source of truth so a hover tooltip means the same thing on every
// screen. Written for a non-technical reader (Suren) — no acronyms left cold, no
// sales-ops insider language. Keep each `def` to a sentence or two.

export interface GlossaryEntry {
  term: string; // the canonical label
  def: string; // the plain-English explanation shown on hover
}

export const GLOSSARY: Record<string, GlossaryEntry> = {
  // --- pipeline / money ----------------------------------------------------
  pipeline: {
    term: "Pipeline",
    def: "Every live deal you're working, laid out by how far along it is. Think of it as your sales funnel from first contact to won or lost.",
  },
  open_pipeline: {
    term: "Open pipeline",
    def: "The total dollar value of all your deals that are still in play (not yet won or lost).",
  },
  weighted: {
    term: "Weighted value",
    def: "A deal's value adjusted for how likely it is to close at its current stage. A $100K deal that's 30% likely shows as $30K weighted — a realistic view of what your pipeline is really worth.",
  },
  wtd: {
    term: "Weighted",
    def: "Short for weighted value: the deal's value times its chance of closing. A realistic estimate, not the full sticker price.",
  },
  probability: {
    term: "Win probability",
    def: "Roughly how likely this deal is to close, based on the stage it's in. It climbs as the deal moves forward: Prospect 10% → Engaged 30% → Qualified 50% → Meeting Booked 70%.",
  },
  owner: {
    term: "Owner",
    def: "The person on your team responsible for this deal — who's driving it and who to ask about it.",
  },
  last_activity: {
    term: "Last activity",
    def: "How long since anything happened on this deal — a call, email, meeting, or note. The longer the gap, the more the deal is at risk of going cold.",
  },
  value: {
    term: "Deal value",
    def: "The expected annual contract value if this deal closes — the full amount, before adjusting for how likely it is.",
  },

  // --- WIP / board ---------------------------------------------------------
  wip_limit: {
    term: "WIP limit",
    def: "Work-in-progress limit — the most deals you want sitting in this stage at once. Go over it and the column turns red, a gentle nudge to push deals forward instead of letting them pile up. Optional — leave it blank for no limit.",
  },

  // --- stages --------------------------------------------------------------
  stage: {
    term: "Stage",
    def: "Where a deal is in your sales process. Deals move left to right as they progress: Prospect → Engaged → Qualified → Meeting Booked → (Won or Closed Lost).",
  },
  stage_prospect: {
    term: "Prospect",
    def: "A potential customer you haven't really connected with yet. Earliest stage — about 10% likely to close.",
  },
  stage_engaged: {
    term: "Engaged",
    def: "They've replied and there's a real back-and-forth going. Roughly 30% likely to close.",
  },
  stage_qualified: {
    term: "Qualified",
    def: "You've confirmed there's a genuine fit, budget, and need. About 50% likely to close.",
  },
  stage_meeting_booked: {
    term: "Meeting Booked",
    def: "A real meeting is on the calendar — strong momentum. About 70% likely to close.",
  },
  stage_closed_lost: {
    term: "Closed Lost",
    def: "The deal didn't work out — they passed or went quiet for good. Kept on record so you can learn from it.",
  },

  // --- deal size -----------------------------------------------------------
  size_tier: {
    term: "Deal size",
    def: "How big this account is, bucketed into Small, Mid-size, and Large so you can filter and focus on the deals that matter most.",
  },
  size_small: {
    term: "Small",
    def: "A smaller account — lower deal value, usually quicker to close.",
  },
  size_mid: {
    term: "Mid-size",
    def: "A mid-size account — a solid, meaningful deal.",
  },
  size_large: {
    term: "Large",
    def: "One of your biggest accounts — high value, worth real attention.",
  },

  // --- account health ------------------------------------------------------
  health: {
    term: "Account health",
    def: "A quick read on how a relationship is doing, from 0–100, based on recent activity, deal momentum, and how many people you know there. Higher and greener is better.",
  },
  health_healthy: {
    term: "Healthy",
    def: "This account is in good shape — recent activity, momentum, and people mapped. Keep it up.",
  },
  health_at_risk: {
    term: "At-risk",
    def: "This account is slipping — little recent contact or stalled momentum. Worth re-engaging before you lose it.",
  },
  health_cooling: {
    term: "Cooling",
    def: "Activity is fading on this account. Not lost yet, but it needs a touch soon to keep it warm.",
  },

  // --- sequences / cadences ------------------------------------------------
  sequence: {
    term: "Sequence",
    def: "A pre-planned series of outreach steps (emails, calls, LinkedIn touches) spread over days, so no prospect slips through the cracks. Also called a cadence.",
  },
  cadence: {
    term: "Cadence",
    def: "Another word for a sequence — the rhythm of outreach steps (e.g. email day 1, call day 4, email day 7) you follow to reach a prospect.",
  },
  enrolled: {
    term: "Enrolled",
    def: "How many accounts are currently moving through this sequence's steps.",
  },
  steps_automated: {
    term: "Steps automated",
    def: "How many outreach steps the agent has prepared for you across your sequences. It drafts and lines them up — you still approve before anything is sent.",
  },
  run_cadence: {
    term: "Run cadence",
    def: "Have the agent work through this sequence: enroll any stalled accounts and prepare the next step that's due. It drafts everything for your review — nothing goes out without your OK.",
  },
  due_to_advance: {
    term: "Due to advance",
    def: "Accounts that have reached the day for their next step in the sequence and are ready for it to be prepared.",
  },

  // --- knowledge / misc ----------------------------------------------------
  kb_version: {
    term: "KB version",
    def: "Which version of your Freyr knowledge base (services, messaging, positioning) the agent used to write this pitch — so you know it's on the latest playbook.",
  },
  next_best_action: {
    term: "Next best action",
    def: "The single most useful thing the agent suggests doing on this deal right now to move it forward.",
  },
  pending_approval: {
    term: "Pending approval",
    def: "Something the agent has prepared (like a pitch or email) that's waiting for you to review and approve before it can go out.",
  },
  pre_call_brief: {
    term: "Pre-call brief",
    def: "A quick summary the agent puts together before a call — where the deal stands, what's at stake, and the one thing to focus on — so you walk in prepared.",
  },

  // --- dashboard KPIs ------------------------------------------------------
  kpi_pipeline: {
    term: "Active Pipeline",
    def: "The total dollar value of every deal you're still working — not yet won or lost. Your book of live opportunities.",
  },
  kpi_leads: {
    term: "Active Leads",
    def: "How many accounts you're actively working right now (still in play, not closed out).",
  },
  kpi_winrate: {
    term: "Win Rate",
    def: "Of the deals that have closed, the share you won. A simple read on how often your deals go your way — higher is better.",
  },
  kpi_sessions: {
    term: "Pitch Sessions",
    def: "How many tailored pitches the agent has prepared across your accounts — each one a ready-to-review email, call script, and service recommendation.",
  },
};

// Convenience: stage name → glossary key.
export function stageKey(stage: string): string {
  return "stage_" + stage.toLowerCase().replace(/\s+/g, "_");
}
// Convenience: size tier → glossary key.
export function sizeKey(tier: string): string {
  return "size_" + tier.toLowerCase();
}
