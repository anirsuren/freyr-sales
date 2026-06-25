// The agent's brain (V7, mock-first). Turns real pipeline/health/review state
// into a ranked list of next-best-actions. With ANTHROPIC_API_KEY this is where
// an LLM planner would refine/expand the list; for now it's deterministic.
import {
  buildDeals,
  ROTTING_DAYS,
  ownerFor,
  CURRENT_REP,
  type Deal,
} from "./pipeline";
import { accountHealth } from "./health";
import type {
  Customer,
  Contact,
  PitchSession,
  Interaction,
  AgentRunStep,
  AgentRun,
  AgentRunKind,
} from "./types";

export type AgentActionKind =
  | "approve"
  | "send"
  | "reengage"
  | "stabilize"
  | "followup";

export interface AgentAction {
  id: string;
  kind: AgentActionKind;
  title: string;
  rationale: string;
  href: string;
  cta: string;
  customerId: string;
  // Set on approve/send actions so the inbox can act on the pitch inline (#65).
  sessionId?: string;
}

// Kinds the agent can draft/prepare in one click (vs. human-gated approve/send).
export const DRAFTABLE: AgentActionKind[] = ["reengage", "stabilize", "followup"];

// Per-account "ask the agent" (V8). Answers grounded in the account's real
// context — deterministic now, LLM-backed when ANTHROPIC_API_KEY is set.
export interface AccountContext {
  company: string;
  healthLabel: string;
  healthScore: number;
  openValue: string;
  dealCount: number;
  contactCount: number;
  topContact?: string;
  lastActivity?: string;
  topAction?: string;
  competitor?: string | null;
  owner?: string | null;
}

// Per-contact next-best-action (V9). Deterministic suggestion grounded in the
// contact's state — drives the agent surface on the contact detail.
export interface ContactSuggestion {
  title: string;
  rationale: string;
  kind: "reengage" | "followup";
}

export function suggestForContact(input: {
  fullName: string;
  company: string;
  hasFollowUp: boolean;
  everContacted: boolean;
  siblingCount: number;
}): ContactSuggestion {
  const first =
    input.fullName.replace(/^(Dr|Mr|Mrs|Ms|Prof)\.?\s+/i, "").split(/\s+/)[0] ||
    "this contact";
  if (input.hasFollowUp) {
    return {
      kind: "followup",
      title: `Send ${first} the scheduled follow-up`,
      rationale: "A follow-up is due — draft the recap with a concrete next step.",
    };
  }
  if (!input.everContacted) {
    return {
      kind: "reengage",
      title: `Draft a first-touch email to ${first}`,
      rationale: `No outreach logged yet at ${input.company}. Open with a tailored, peer-level note.`,
    };
  }
  if (input.siblingCount < 1) {
    return {
      kind: "reengage",
      title: `Multi-thread ${input.company}`,
      rationale: `${first} is the only mapped contact — draft an intro to widen the thread and de-risk the deal.`,
    };
  }
  return {
    kind: "reengage",
    title: `Re-engage ${first} with a value nudge`,
    rationale: "Keep momentum — send a relevant insight tied to their priorities.",
  };
}

export function answerAccountQuestion(q: string, c: AccountContext): string {
  const s = q.toLowerCase();
  const next = c.topAction
    ? `The top next step is: ${c.topAction}.`
    : "There's no urgent action right now — keep nurturing.";

  // Deliverable drafts — the account "Deliverables" rail hands these to the
  // agent to draft. Grounded ONLY in this account's real data; where we don't
  // have a fact (e.g. external market numbers) we flag what to check rather
  // than inventing it. Each is explicitly a first draft for the rep to edit.
  const move = c.topAction || "Keep nurturing — no urgent move right now";
  const dealWord = `${c.dealCount} open deal${c.dealCount === 1 ? "" : "s"}`;
  const threadLine =
    c.contactCount < 2
      ? `Single-threaded${c.topContact ? ` on ${c.topContact}` : ""} — worth widening.`
      : `${c.contactCount} contacts mapped${c.topContact ? `, e.g. ${c.topContact}` : ""}.`;

  if (/account brief/.test(s)) {
    return [
      `Account brief — ${c.company}`,
      ``,
      `• Health: ${c.healthLabel} (${c.healthScore}/100).`,
      `• Pipeline: ${dealWord} worth ${c.openValue}.`,
      `• Relationship: ${threadLine}`,
      c.owner ? `• Owner: ${c.owner}.` : null,
      c.competitor ? `• Incumbent on file: ${c.competitor}.` : null,
      c.lastActivity ? `• Last activity: ${c.lastActivity}.` : null,
      `• Recommended next move: ${asClause(move)}.`,
      ``,
      `A first draft from your live account data — edit before you share it.`,
    ]
      .filter(Boolean)
      .join("\n");
  }
  if (/market (report|read|landscape)/.test(s)) {
    return [
      `Market read — ${c.company}`,
      ``,
      `From your data:`,
      `• Standing: ${c.healthLabel} (${c.healthScore}/100), ${c.openValue} open across ${dealWord}.`,
      c.competitor ? `• Competitive: ${c.competitor} is on file as the incumbent.` : null,
      ``,
      `Worth confirming before the next conversation:`,
      `• Recent regulatory guidance in their space that could shift submission timelines.`,
      `• Whether they're expanding (hiring, new programs) — a signal of more workload.`,
      `• Any funding or pipeline milestones that raise their urgency.`,
      ``,
      `A scaffold — I've flagged what to check rather than guessing at numbers.`,
    ]
      .filter(Boolean)
      .join("\n");
  }
  if (/abm plan|account[- ]based/.test(s)) {
    return [
      `ABM plan — ${c.company}`,
      ``,
      `Target: ${c.company} (${c.healthLabel}, ${c.openValue} open).`,
      `Primary contact: ${c.topContact || `to identify — only ${c.contactCount} mapped`}.`,
      c.contactCount < 2
        ? `Gap: single-threaded — map 2–3 more stakeholders to de-risk.`
        : null,
      ``,
      `Recommended motion:`,
      `1. ${asClause(move)}.`,
      `2. Multi-thread beyond ${c.topContact || "the primary contact"}.`,
      `3. Bring a relevant proof point (an offering or case study) to the next touch.`,
      ``,
      `A first-pass plan from your account data — shape it to the deal.`,
    ]
      .filter(Boolean)
      .join("\n");
  }
  if (/slide outline|\bdeck\b|\bslides\b/.test(s)) {
    return [
      `Slide outline — ${c.company}`,
      ``,
      `1. Title — ${c.company} × Freyr`,
      `2. Where things stand — ${c.healthLabel} (${c.healthScore}/100), ${c.openValue} open across ${dealWord}`,
      `3. Why now — ${asClause(move)}`,
      `4. Our fit — the offerings that match their needs`,
      `5. Proof — a relevant result or case`,
      `6. The ask — a clear next step${c.topContact ? ` with ${c.topContact}` : ""}`,
      ``,
      `An outline to build the deck from — your real facts are slotted in.`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (/health|risk|churn|doing/.test(s)) {
    return `${c.company} is ${c.healthLabel} (${c.healthScore}/100). ${next}`;
  }
  if (/next|should|do|recommend|action|play/.test(s)) {
    return next;
  }
  if (/deal|value|pipeline|money|revenue|worth/.test(s)) {
    return `${c.company} has ${c.dealCount} deal${
      c.dealCount === 1 ? "" : "s"
    } worth ${c.openValue} in open value.`;
  }
  if (/who|contact|stakeholder|thread|people|champion/.test(s)) {
    return `There ${c.contactCount === 1 ? "is" : "are"} ${c.contactCount} mapped contact${
      c.contactCount === 1 ? "" : "s"
    }${c.topContact ? `, e.g. ${c.topContact}` : ""}.${
      c.contactCount < 2 ? " Worth multi-threading to de-risk the deal." : ""
    }`;
  }
  if (/competitor|incumbent|against|versus/.test(s)) {
    return c.competitor
      ? `The incumbent/competitor on file is ${c.competitor}.`
      : "No competitor or incumbent is recorded for this account.";
  }
  if (/owner|rep|who.?s on/.test(s)) {
    return c.owner ? `${c.owner} owns this account.` : "This account is unassigned.";
  }
  if (/last|activity|recent|touch/.test(s)) {
    return c.lastActivity
      ? `The most recent logged activity was ${c.lastActivity}.`
      : "No activity has been logged yet.";
  }
  // default: overview
  return `${c.company} — ${c.healthLabel} health (${c.healthScore}/100), ${
    c.dealCount
  } deal${c.dealCount === 1 ? "" : "s"} (${c.openValue} open), ${
    c.contactCount
  } contact${c.contactCount === 1 ? "" : "s"}. ${next}`;
}

// Agent account briefing (V9 #71) — the agent's proactive *research* synthesis:
// reads the account's state and writes a short briefing + the recommended move,
// so the rep walks in informed. Deterministic; Claude-narrated when keyed.
export interface AccountBriefing {
  headline: string;
  reads: { label: string; text: string }[];
  recommendation: string;
  narrative: string;
}

// A recommendation is sometimes a full sentence ending in "." and sometimes a
// bare action; strip any trailing sentence punctuation before it's spliced into
// the narrative so we never double-punctuate (e.g. "...right now..").
function asClause(s: string): string {
  return s.trim().replace(/[.!?]+$/, "");
}

export function buildAccountBriefing(c: AccountContext): AccountBriefing {
  const band = c.healthLabel.toLowerCase();
  const atRisk = /risk|cool|declin/.test(band);
  const strong = /healthy|strong|good|warm|engaged/.test(band);

  const healthPhrase = c.healthLabel.toLowerCase();
  const headline = atRisk
    ? `${c.company} needs attention — ${healthPhrase}, with ${c.openValue} in open pipeline at stake.`
    : strong
    ? `${c.company} is in good shape — ${healthPhrase}, with ${c.openValue} of open pipeline to grow.`
    : `${c.company} is steady — ${healthPhrase} across ${c.dealCount} deal${
        c.dealCount === 1 ? "" : "s"
      } (${c.openValue} open).`;

  const reads: { label: string; text: string }[] = [
    { label: "Health", text: `${c.healthLabel} (${c.healthScore}/100).` },
    {
      label: "Pipeline",
      text: `${c.dealCount} open deal${c.dealCount === 1 ? "" : "s"} worth ${c.openValue}.`,
    },
    {
      label: "Threading",
      text:
        c.contactCount < 2
          ? `Single-threaded${
              c.topContact ? ` on ${c.topContact}` : ""
            } — widen the relationship to de-risk.`
          : `${c.contactCount} contacts mapped${
              c.topContact ? `, e.g. ${c.topContact}` : ""
            }.`,
    },
    {
      label: "Momentum",
      text: c.lastActivity
        ? `Last touch ${c.lastActivity}.`
        : "No activity logged yet — open the relationship.",
    },
  ];
  if (c.competitor) {
    reads.push({ label: "Competitive", text: `Incumbent on file: ${c.competitor}.` });
  }

  const recommendation = c.topAction
    ? c.topAction
    : "Keep nurturing — no urgent move right now.";

  const threadNote =
    c.contactCount < 2
      ? " It's single-threaded, so widening the relationship would de-risk the deal."
      : "";
  const narrative = `${headline}${threadNote} Recommended next move: ${asClause(recommendation)}.`;

  return { headline, reads, recommendation, narrative };
}

// Deal briefing (V9 #73) — a pre-call read on a single deal: stage, weighted
// value, momentum, and the next move. Reuses the AccountBriefing shape so the
// same card renders it. Deterministic.
export function buildDealBriefing(d: {
  company: string;
  stage: string;
  value: string;
  weighted: string;
  winProb: number;
  staleDays: number;
  rotting: boolean;
  nextStep: string | null;
  topAction?: string;
}): AccountBriefing {
  const headline = d.rotting
    ? `${d.company} is cooling in ${d.stage} — ${d.staleDays} days since the last touch, ${d.value} at risk.`
    : `${d.company} is in ${d.stage} — ${d.value} open, weighted to ${d.weighted} at ${d.winProb}% win odds.`;

  const reads: { label: string; text: string }[] = [
    { label: "Stage", text: `${d.stage} · ${d.winProb}% win probability.` },
    { label: "Value", text: `${d.value} open, ${d.weighted} weighted.` },
    {
      label: "Momentum",
      text: d.rotting
        ? `Cooling — ${d.staleDays} days since the last activity.`
        : `${d.staleDays} day${d.staleDays === 1 ? "" : "s"} since the last activity.`,
    },
    {
      label: "Next step",
      text: d.nextStep
        ? `Scheduled for ${d.nextStep}.`
        : "Nothing scheduled — set the next step.",
    },
  ];

  const recommendation = d.topAction
    ? d.topAction
    : d.rotting
    ? `Re-engage ${d.company} before the deal goes cold.`
    : !d.nextStep
    ? "Lock in a clear next step with the buyer."
    : "Keep the deal moving toward the next stage.";

  const narrative = `${headline} Recommended next move: ${asClause(recommendation)}.`;

  return { headline, reads, recommendation, narrative };
}

// Pre-call contact briefing (V9 #74) — the agent's read on an individual: who
// they are, how to engage them (buying style), where things stand, and the next
// move. Reuses the AccountBriefing shape so BriefingCard renders it.
export function buildContactBriefing(c: {
  fullName: string;
  jobTitle?: string | null;
  company: string;
  buyingStyle: string;
  engageTip?: string | null;
  lastContacted: string | null;
  nextStep: string | null;
  siblingCount: number;
  everContacted: boolean;
  recommendation: string;
}): AccountBriefing {
  const first =
    c.fullName
      .replace(/^(Dr|Mr|Mrs|Ms|Prof)\.?\s+/i, "")
      .split(/\s+/)[0] || "This contact";
  const role = c.jobTitle ? `${c.jobTitle} at ${c.company}` : `at ${c.company}`;
  const momentum = c.nextStep
    ? `a follow-up is due ${c.nextStep}`
    : !c.everContacted
    ? "no outreach is logged yet"
    : c.lastContacted
    ? `last touched ${c.lastContacted}`
    : "no recent activity";
  const headline = `${first} — ${role}. ${
    momentum.charAt(0).toUpperCase() + momentum.slice(1)
  }.`;

  const reads: { label: string; text: string }[] = [
    { label: "Role", text: c.jobTitle ? `${c.jobTitle}.` : "Role not on file." },
    {
      label: "Style",
      text: c.engageTip ? `${c.buyingStyle} — ${c.engageTip}.` : `${c.buyingStyle}.`,
    },
    {
      label: "Momentum",
      text: c.nextStep
        ? `Follow-up due ${c.nextStep}.`
        : c.lastContacted
        ? `Last touched ${c.lastContacted}.`
        : "No outreach logged yet — open the relationship.",
    },
    {
      label: "Threading",
      text:
        c.siblingCount < 1
          ? "Only mapped contact at the account — widen the thread to de-risk."
          : `${c.siblingCount} other contact${
              c.siblingCount === 1 ? "" : "s"
            } mapped at ${c.company}.`,
    },
  ];

  const narrative = `${headline} Recommended next move: ${asClause(c.recommendation)}.`;

  return { headline, reads, recommendation: c.recommendation, narrative };
}

// Step timelines for persisted agent runs (V9). Each surface that lets the
// agent act records the same shape of step detail, so the run history reads
// consistently. Deterministic now; the same steps map to real LLM calls when
// ANTHROPIC_API_KEY is set.
// Agent digest (V9 #22) — a daily briefing the agent gives the rep: what it
// did, what needs them, and what to watch. Deterministic synthesis of run
// history + the next-best-action queue; LLM-narrated when ANTHROPIC_API_KEY set.
export interface AgentDigestData {
  didSummary: string;
  recent: string[];
  needsApproval: number;
  canHandle: number;
  cooling: number;
  atRisk: number;
}

export function buildDigest(input: {
  runs: AgentRun[];
  actions: AgentAction[];
}): AgentDigestData {
  const active = input.runs.filter((r) => !r.reverted);
  const byKind = (k: AgentRunKind) => active.filter((r) => r.kind === k).length;
  const plays = byKind("play");
  const autopilot = byKind("autopilot");
  const plans = byKind("plan");
  const acts = byKind("act");

  const parts: string[] = [];
  if (plays) parts.push(`${plays} play${plays === 1 ? "" : "s"}`);
  if (plans) parts.push(`${plans} plan${plans === 1 ? "" : "s"} executed`);
  if (autopilot)
    parts.push(`${autopilot} autopilot pass${autopilot === 1 ? "" : "es"}`);
  if (acts) parts.push(`${acts} one-click action${acts === 1 ? "" : "s"}`);
  const didSummary = parts.length
    ? `I've run ${parts.join(", ")} for you.`
    : "I haven't run anything yet — set a goal and I'll get to work.";

  const needsApproval = input.actions.filter(
    (a) => !DRAFTABLE.includes(a.kind)
  ).length;
  const canHandle = input.actions.filter((a) =>
    DRAFTABLE.includes(a.kind)
  ).length;
  const cooling = input.actions.filter((a) => a.kind === "reengage").length;
  const atRisk = input.actions.filter((a) => a.kind === "stabilize").length;

  return {
    didSummary,
    recent: active.slice(0, 3).map((r) => r.title),
    needsApproval,
    canHandle,
    cooling,
    atRisk,
  };
}

export function actRunSteps(verb: string, company: string): AgentRunStep[] {
  return [
    {
      label: "Reviewed account context",
      detail: `Pulled health, deals, and recent activity for ${company}`,
      status: "done",
    },
    { label: "Chose the next best action", detail: verb, status: "done" },
    {
      label: "Drafted the step",
      detail: "Prepared the work, ready for your review",
      status: "done",
    },
  ];
}

export function playRunSteps(company: string): AgentRunStep[] {
  return [
    {
      label: "Researched the account",
      detail: `Scanned ${company}'s profile, signals, and history`,
      status: "done",
    },
    {
      label: "Matched Freyr services",
      detail: "Ranked the most relevant services to lead with",
      status: "done",
    },
    {
      label: "Drafted the outreach",
      detail: "Wrote a tailored email and call angle",
      status: "done",
    },
    {
      label: "Saved to the account timeline",
      detail: "Ready for you to review and send — nothing sent",
      status: "done",
    },
    {
      label: "Waiting for your approval",
      detail: "Nothing goes out until you review and send it yourself",
      status: "gated",
    },
  ];
}

export function autopilotRunSteps(
  handled: string[],
  escalated: string[]
): AgentRunStep[] {
  return [
    ...handled.map((t) => ({
      label: t,
      detail: "Drafted and saved to the timeline — review and send when you're ready. Nothing sent.",
      status: "done" as const,
    })),
    ...escalated.map((t) => ({
      label: t,
      detail: "Needs your approval before anything is drafted or sent",
      status: "escalated" as const,
    })),
  ];
}

// Turn a free-text goal into a visible plan of steps (V8). Deterministic
// keyword routing now; an LLM planner refines this when ANTHROPIC_API_KEY is set.
export function planGoal(goal: string): string[] {
  const g = goal.toLowerCase();
  if (/re-?engage|stalled|cold|cooling|revive|dormant/.test(g)) {
    return [
      "Find accounts with no activity in 14+ days",
      "Draft a tailored re-engagement email for each",
      "Match a relevant Freyr service to re-open the conversation",
      "Queue for your compliance approval before sending",
    ];
  }
  if (/follow.?up|meeting|booked|recap/.test(g)) {
    return [
      "Pull accounts with a booked meeting or due follow-up",
      "Draft a recap with a concrete next step",
      "Schedule the send and set a reminder",
      "Surface anything that needs your approval",
    ];
  }
  if (/at.?risk|health|churn|save|stabili/.test(g)) {
    return [
      "Score account health across the book",
      "Flag at-risk accounts and the reason why",
      "Propose a recovery play per account",
      "Hand off high-stakes moves for your sign-off",
    ];
  }
  return [
    "Scan the pipeline for the highest-leverage moves",
    "Draft the outreach for the safe ones",
    "Run multi-step plays where they help",
    "Escalate anything that needs your approval",
  ];
}

// Which action kinds a goal targets (V9 plan execution) — mirrors planGoal's
// routing so "execute plan" acts on exactly the actions the plan described.
// null means "all kinds" (the general pipeline sweep).
export function goalActionKinds(goal: string): AgentActionKind[] | null {
  const g = goal.toLowerCase();
  if (/re-?engage|stalled|cold|cooling|revive|dormant/.test(g)) {
    return ["reengage"];
  }
  if (/follow.?up|meeting|booked|recap/.test(g)) {
    return ["followup", "send", "approve"];
  }
  if (/at.?risk|health|churn|save|stabili/.test(g)) {
    return ["stabilize"];
  }
  return null;
}

const PRIORITY: Record<AgentActionKind, number> = {
  approve: 0,
  send: 1,
  reengage: 2,
  stabilize: 3,
  followup: 4,
};

// Agent weekly review (V9 #40) — a Monday rollup of what changed this week and
// what's at stake. Deterministic; the header line is Claude-narrated when keyed.
export interface WeeklyReview {
  runsThisWeek: number;
  cooling: number;
  atRisk: number;
  openAtStake: number;
  topDeals: { company: string; value: number; stage: string; sessionId: string }[];
  changed: { title: string; created_at: string }[];
}

export function buildWeeklyReview(input: {
  runs: AgentRun[];
  deals: Deal[];
  atRisk: number;
}): WeeklyReview {
  const weekAgo = Date.now() - 7 * 86400000;
  const recent = input.runs.filter(
    (r) => !r.reverted && new Date(r.created_at).getTime() >= weekAgo
  );
  const open = input.deals.filter((d) => d.stage !== "Closed Lost");
  const cooling = open.filter((d) => d.staleDays > ROTTING_DAYS).length;
  const openAtStake = open.reduce((s, d) => s + d.value, 0);
  const topDeals = [...open]
    .sort((a, b) => b.value - a.value)
    .slice(0, 5)
    .map((d) => ({
      company: d.company,
      value: d.value,
      stage: d.stage,
      sessionId: d.sessionId,
    }));
  return {
    runsThisWeek: recent.length,
    cooling,
    atRisk: input.atRisk,
    openAtStake,
    topDeals,
    changed: recent.slice(0, 6).map((r) => ({
      title: r.title,
      created_at: r.created_at,
    })),
  };
}

// Agent activity grouped by account (V9 #55) — rolls up this week's runs per
// account so the rep can see, at a glance, where the agent has been working.
export interface AccountActivity {
  customer_id: string;
  company: string;
  runs: number;
  handled: number;
  sent: number;
  escalated: number;
  lastAt: string;
}

export function buildActivityByAccount(runs: AgentRun[]): {
  accounts: AccountActivity[];
  pipelineWide: number;
} {
  const weekAgo = Date.now() - 7 * 86400000;
  const recent = runs.filter(
    (r) => !r.reverted && new Date(r.created_at).getTime() >= weekAgo
  );
  const byAccount = new Map<string, AccountActivity>();
  let pipelineWide = 0;
  for (const r of recent) {
    if (!r.customer_id || !r.company) {
      // Pipeline-wide passes (e.g. autopilot) aren't tied to one account.
      pipelineWide++;
      continue;
    }
    const a =
      byAccount.get(r.customer_id) ||
      ({
        customer_id: r.customer_id,
        company: r.company,
        runs: 0,
        handled: 0,
        sent: 0,
        escalated: 0,
        lastAt: r.created_at,
      } as AccountActivity);
    a.runs++;
    if (r.outcome === "handled") a.handled++;
    else if (r.outcome === "sent") a.sent++;
    else if (r.outcome === "escalated") a.escalated++;
    if (new Date(r.created_at).getTime() > new Date(a.lastAt).getTime())
      a.lastAt = r.created_at;
    byAccount.set(r.customer_id, a);
  }
  const accounts = Array.from(byAccount.values()).sort(
    (x, y) =>
      y.runs - x.runs ||
      new Date(y.lastAt).getTime() - new Date(x.lastAt).getTime()
  );
  return { accounts, pipelineWide };
}

// Open pipeline value per account (V9 #75) — sums non-lost deal value by
// customer. Powers the autopilot high-value guardrail.
export function openValueByAccount(deals: Deal[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const d of deals) {
    if (d.stage === "Closed Lost") continue;
    m.set(d.customerId, (m.get(d.customerId) || 0) + d.value);
  }
  return m;
}

// This week's outcome breakdown for an already account-scoped run list (V9 #56)
// — small enough to surface inline on the account rail.
export function weeklyOutcomeSummary(runs: AgentRun[]): {
  runs: number;
  handled: number;
  sent: number;
  escalated: number;
} {
  const weekAgo = Date.now() - 7 * 86400000;
  const recent = runs.filter(
    (r) => !r.reverted && new Date(r.created_at).getTime() >= weekAgo
  );
  let handled = 0;
  let sent = 0;
  let escalated = 0;
  for (const r of recent) {
    if (r.outcome === "handled") handled++;
    else if (r.outcome === "sent") sent++;
    else if (r.outcome === "escalated") escalated++;
  }
  return { runs: recent.length, handled, sent, escalated };
}

// Agent impact leaderboard (V9 #57) — ranks accounts by how much the agent has
// worked them this quarter, joined with the current open pipeline at each. This
// is an *effort* view (where the agent invested), not a causation claim.
export interface AgentImpactRow {
  customer_id: string;
  company: string;
  runs: number;
  handled: number;
  sent: number;
  escalated: number;
  lastAt: string;
  openValue: number;
}

export type ImpactWindow = "week" | "quarter" | "all";

// null windowDays = all time (no lower bound).
export const IMPACT_WINDOW_DAYS: Record<ImpactWindow, number | null> = {
  week: 7,
  quarter: 90,
  all: null,
};

export function buildAgentImpact(input: {
  runs: AgentRun[];
  deals: Deal[];
  windowDays?: number | null;
}): {
  rows: AgentImpactRow[];
  totalRuns: number;
  accountsTouched: number;
  entriesLogged: number;
  pipelineWide: number;
} {
  const windowDays = input.windowDays === undefined ? 90 : input.windowDays;
  const cutoff = windowDays == null ? 0 : Date.now() - windowDays * 86400000;
  const recent = input.runs.filter(
    (r) => !r.reverted && new Date(r.created_at).getTime() >= cutoff
  );
  const openByAccount = new Map<string, number>();
  for (const d of input.deals) {
    if (d.stage === "Closed Lost") continue;
    openByAccount.set(
      d.customerId,
      (openByAccount.get(d.customerId) || 0) + d.value
    );
  }
  const byAccount = new Map<string, AgentImpactRow>();
  let pipelineWide = 0;
  let entriesLogged = 0;
  for (const r of recent) {
    entriesLogged += r.interaction_ids?.length ?? 0;
    if (!r.customer_id || !r.company) {
      pipelineWide++;
      continue;
    }
    const a =
      byAccount.get(r.customer_id) ||
      ({
        customer_id: r.customer_id,
        company: r.company,
        runs: 0,
        handled: 0,
        sent: 0,
        escalated: 0,
        lastAt: r.created_at,
        openValue: openByAccount.get(r.customer_id) || 0,
      } as AgentImpactRow);
    a.runs++;
    if (r.outcome === "handled") a.handled++;
    else if (r.outcome === "sent") a.sent++;
    else if (r.outcome === "escalated") a.escalated++;
    if (new Date(r.created_at).getTime() > new Date(a.lastAt).getTime())
      a.lastAt = r.created_at;
    byAccount.set(r.customer_id, a);
  }
  const rows = Array.from(byAccount.values()).sort(
    (x, y) => y.runs - x.runs || y.openValue - x.openValue
  );
  return {
    rows,
    totalRuns: recent.length,
    accountsTouched: byAccount.size,
    entriesLogged,
    pipelineWide,
  };
}

// Agent runs bucketed over time (V9 #59) — a small time series for the impact
// chart. week → 7 daily buckets; quarter → 13 weekly buckets; all → 12 monthly.
export function buildRunSeries(
  runs: AgentRun[],
  window: ImpactWindow
): { labels: string[]; counts: number[] } {
  const valid = runs.filter((r) => !r.reverted);
  const DOW = ["S", "M", "T", "W", "T", "F", "S"];
  const MON = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];

  if (window === "week") {
    const labels: string[] = [];
    const counts = Array(7).fill(0);
    const dayStarts: number[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      d.setHours(0, 0, 0, 0);
      dayStarts.push(d.getTime());
      labels.push(DOW[d.getDay()]);
    }
    for (const r of valid) {
      const t = new Date(r.created_at).getTime();
      for (let k = 0; k < 7; k++) {
        if (t >= dayStarts[k] && t < dayStarts[k] + 86400000) {
          counts[k]++;
          break;
        }
      }
    }
    return { labels, counts };
  }

  if (window === "quarter") {
    const week = 7 * 86400000;
    const labels: string[] = [];
    const counts = Array(13).fill(0);
    const starts: number[] = [];
    const now = Date.now();
    for (let i = 12; i >= 0; i--) {
      const start = now - (i + 1) * week + 1;
      starts.push(start);
      const d = new Date(start);
      labels.push(`${d.getMonth() + 1}/${d.getDate()}`);
    }
    for (const r of valid) {
      const t = new Date(r.created_at).getTime();
      for (let k = 0; k < 13; k++) {
        if (t >= starts[k] && t < starts[k] + week) {
          counts[k]++;
          break;
        }
      }
    }
    return { labels, counts };
  }

  // all → 12 calendar-month buckets ending this month
  const labels: string[] = [];
  const counts = Array(12).fill(0);
  const now = new Date();
  const keys: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${d.getMonth()}`);
    labels.push(MON[d.getMonth()]);
  }
  for (const r of valid) {
    const d = new Date(r.created_at);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const idx = keys.indexOf(key);
    if (idx >= 0) counts[idx]++;
  }
  return { labels, counts };
}

// Autopilot schedule (V9) — is a scheduled run due? Catch-up model: computed
// from a real cadence + last-run timestamp, surfaced on the rep's next visit.
const CADENCE_MS: Record<string, number> = {
  daily: 86400000,
  weekly: 7 * 86400000,
};

export function autopilotDue(
  cadence: string | null | undefined,
  lastRun: string | null | undefined
): boolean {
  if (!cadence || cadence === "off") return false;
  if (!lastRun) return true;
  const interval = CADENCE_MS[cadence];
  if (!interval) return false;
  return Date.now() - new Date(lastRun).getTime() >= interval;
}

// Same catch-up cadence math, reused for the daily-digest schedule (V9 #24).
export const cadenceDue = autopilotDue;

// Apply the rep's pinned lenses (V9 #26/#27) to a recommendation list, so the
// queue, inbox, dashboard, and digest all show the same focused view: a focus
// industry and/or "my accounts only". Returns { actions, hidden } so callers can
// show how many were set aside as outside the focus.
export interface FocusPrefs {
  focus_industry?: string | null;
  only_mine?: boolean;
}

export function focusActions(
  actions: AgentAction[],
  customers: Customer[],
  prefs: FocusPrefs | null | undefined
): { actions: AgentAction[]; hidden: number } {
  if (!prefs || (!prefs.focus_industry && !prefs.only_mine)) {
    return { actions, hidden: 0 };
  }
  const custById = Object.fromEntries(customers.map((c) => [c.id, c]));
  const keep = actions.filter((a) => {
    const c = custById[a.customerId];
    if (prefs.focus_industry && c?.industry !== prefs.focus_industry) return false;
    if (prefs.only_mine && ownerFor(c) !== CURRENT_REP) return false;
    return true;
  });
  return { actions: keep, hidden: actions.length - keep.length };
}

export function nextBestActions(input: {
  sessions: PitchSession[];
  customers: Customer[];
  contacts: Contact[];
  interactions: Interaction[];
}): AgentAction[] {
  const { sessions, customers, contacts, interactions } = input;
  const custById = Object.fromEntries(customers.map((c) => [c.id, c]));
  const deals = buildDeals(sessions, customers, contacts, interactions);
  const sentCustomers = new Set(
    interactions
      .filter((i) => /email sent/i.test(i.notes || ""))
      .map((i) => i.customer_id)
  );
  const out: AgentAction[] = [];

  // approvals + ready-to-send (the compliance loop)
  for (const s of sessions) {
    const co = custById[s.customer_id]?.company_name || "this account";
    if (s.review_status === "in_review") {
      out.push({
        id: `approve-${s.id}`,
        kind: "approve",
        title: `Approve the pitch for ${co}`,
        rationale: "Awaiting compliance sign-off before it can be sent.",
        href: `/sessions/${s.id}`,
        cta: "Review",
        customerId: s.customer_id,
        sessionId: s.id,
      });
    } else if (
      s.review_status === "approved" &&
      !sentCustomers.has(s.customer_id)
    ) {
      out.push({
        id: `send-${s.id}`,
        kind: "send",
        title: `Send the approved pitch to ${co}`,
        rationale: "Cleared by compliance — ready to go out.",
        href: `/sessions/${s.id}`,
        cta: "Open",
        customerId: s.customer_id,
        sessionId: s.id,
      });
    }
  }

  // cooling deals
  for (const d of deals) {
    if (d.staleDays > ROTTING_DAYS && d.stage !== "Closed Lost") {
      out.push({
        id: `reengage-${d.sessionId}`,
        kind: "reengage",
        title: `Re-engage ${d.company}`,
        rationale: `No activity in ${d.staleDays} days — the deal is going cold.`,
        href: `/deals/${d.sessionId}`,
        cta: "Open deal",
        customerId: d.customerId,
      });
    }
  }

  // at-risk health
  for (const c of customers) {
    const ints = interactions.filter((i) => i.customer_id === c.id);
    const cd = deals.filter((d) => d.customerId === c.id);
    const h = accountHealth({
      interactions: ints,
      deals: cd,
      contactCount: contacts.filter((x) => x.customer_id === c.id).length,
    });
    if (h.band === "at_risk") {
      out.push({
        id: `stabilize-${c.id}`,
        kind: "stabilize",
        title: `Stabilize ${c.company_name}`,
        rationale: h.factors[0]?.label || "Account health is at risk.",
        href: `/customers/${c.id}`,
        cta: "View",
        customerId: c.id,
      });
    }
  }

  // due follow-ups
  for (const i of interactions) {
    if (i.follow_up_date) {
      const co = custById[i.customer_id]?.company_name || "this account";
      out.push({
        id: `followup-${i.id}`,
        kind: "followup",
        title: `Follow up with ${co}`,
        rationale: `Follow-up scheduled for ${new Date(
          i.follow_up_date
        ).toLocaleDateString()}.`,
        href: "/tasks",
        cta: "Tasks",
        customerId: i.customer_id,
      });
    }
  }

  const seen = new Set<string>();
  return out
    .filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)))
    .sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind])
    .slice(0, 12);
}
