import { NextResponse } from "next/server";
import { getDb, type Db } from "@/lib/db";
import { nextBestActions, focusActions, DRAFTABLE } from "@/lib/agent";
import { buildDeals, formatMoney, ROTTING_DAYS } from "@/lib/pipeline";
import { accountHealth } from "@/lib/health";
import {
  answerAgentChat,
  type ChatContext,
  type ChatTurn,
  type ChatAction,
} from "@/lib/agentChat";
import { agentConverse } from "@/lib/claude";
import type { Contact, PitchSession } from "@/lib/types";

export const dynamic = "force-dynamic";

// The agent chat (V11). One conversational endpoint that can ANSWER or ACT.
// - Builds live pipeline context every call (always grounded in real data).
// - If the message asks the agent to DO something (save a draft, set a
//   follow-up, log a call), it executes a real write and reports back exactly
//   what happened — it never claims to have sent anything outward.
// - For conversation, Claude is the primary voice when ANTHROPIC_API_KEY is set
//   (it gets the live facts + full history as real message turns); otherwise the
//   deterministic brain answers so the chat is never silent.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const message = String(body.message || "").trim();
  if (!message) {
    return NextResponse.json({ error: "Missing message" }, { status: 400 });
  }
  // Recent turns for continuity (e.g. "save it" → the account we just drafted for).
  const history: ChatTurn[] = Array.isArray(body.history)
    ? body.history
        .filter(
          (t: any) =>
            t && (t.role === "user" || t.role === "agent") && typeof t.text === "string"
        )
        .slice(-10)
        .map((t: any) => ({ role: t.role, text: t.text }))
    : [];

  const db = getDb();
  const [sessions, customers, contacts, interactions, runs, prefs] =
    await Promise.all([
      db.pitchSessions.list(),
      db.customers.list(),
      db.contacts.list(),
      db.interactions.list(),
      db.agentRuns.list(),
      db.agentPrefs.get(),
    ]);
  const deals = buildDeals(sessions, customers, contacts, interactions);
  const { actions } = focusActions(
    nextBestActions({ sessions, customers, contacts, interactions }),
    customers,
    prefs
  );
  const needsApproval = actions.filter((a) => !DRAFTABLE.includes(a.kind)).length;
  const companyById = Object.fromEntries(
    customers.map((c) => [c.id, c.company_name])
  );

  const ctx: ChatContext = {
    customers,
    contacts,
    deals,
    interactions,
    runs,
    needsApproval,
    topActions: actions.map((a) => ({
      title: a.title,
      rationale: a.rationale,
      kind: a.kind,
      company: companyById[a.customerId] || "",
    })),
  };

  const base = answerAgentChat(message, ctx, history);

  const action = base.action;
  // 1a) Show an account's real, already-prepared pitch (read-only).
  if (action?.type === "show_pitch") {
    const result = showPitch(action, sessions);
    return NextResponse.json({
      ok: true,
      reply: result.reply,
      suggestions: result.suggestions,
      source: "pitch",
      did: "show_pitch",
    });
  }

  // 1b) The agent decided to DO something → execute it and report truthfully.
  //     Actions never go through the LLM (they must be reliable and honest).
  if (action) {
    const result = await executeAction(db, action, contacts, history);
    return NextResponse.json({
      ok: true,
      reply: result.reply,
      suggestions: result.suggestions,
      source: "action",
      did: action.type,
    });
  }

  // 2) Conversation. Claude drives when keyed; deterministic brain otherwise.
  const facts = buildFacts(ctx, deals, needsApproval, runs);
  const system =
    "You are Freyr's AI sales agent for Suren, the CEO (non-technical, regulatory/life-sciences). " +
    "Be a decisive, action-oriented sales partner: warm, concise, plain English, NO jargon. " +
    "Strongly prefer DOING over asking — only ask a clarifying question if you genuinely cannot proceed. " +
    "You are human-led: you draft, recommend, and prep; Suren approves everything, and you NEVER " +
    "claim to have sent an email, called anyone, or contacted a customer. " +
    "You CAN take real actions in the app: save a draft onto an account, set a follow-up, or log a call. " +
    "If Suren asks for one of those, confirm you'll do it (the app carries it out). " +
    "DRAFTING: when asked to draft, write, re-engage, reach out to, nudge, or follow up with an account, " +
    "WRITE THE FULL DRAFT IMMEDIATELY — do NOT ask questions first. Start with a 'Subject:' line, then " +
    "3–5 short sentences, signed 'Suren Dheen · Freyr'. " +
    "Assume the aim is to open a conversation about how Freyr helps clinical-stage life-sciences teams hit " +
    "FDA/EMA submission timelines without adding headcount. Never use bracketed placeholders like " +
    "[First Name]; if you don't know the name, write 'Hi there'. When Suren says 'make it shorter / more " +
    "formal / warmer', rewrite the SAME draft in that style and keep the 'Subject:' line. " +
    "After a draft, offer to save it. " +
    "Ground every number, name, and figure ONLY in the LIVE DATA below — never invent accounts, deals, " +
    "or amounts; if you don't have something, say so. Keep non-draft replies to 2–5 sentences.\n\n" +
    "LIVE DATA (current pipeline):\n" +
    facts;
  const turns: { role: "user" | "assistant"; content: string }[] = [
    ...history.map((t) => ({
      role: (t.role === "agent" ? "assistant" : "user") as "user" | "assistant",
      content: t.text,
    })),
    { role: "user" as const, content: message },
  ];
  // `mock:true` forces the deterministic brain — used by the test suite and the
  // conversation harness so they stay reproducible whether or not a key is set.
  const forceMock = body.mock === true;
  const llm = forceMock ? null : await agentConverse(system, turns);

  return NextResponse.json({
    ok: true,
    // Make account names clickable in Claude's reply too (the deterministic brain
    // already deep-links; this keeps the click-through UX when real AI answers).
    reply: llm ? linkifyAccounts(llm, customers) : base.text,
    suggestions: base.suggestions,
    source: llm ? "claude" : "mock",
  });
}

// Deep-link the first mention of each account in free-form (Claude) text, longest
// names first, unwrapping any surrounding ** so the link renders cleanly. The
// (?<!\[) guard avoids relinking text that's already inside a markdown link.
function linkifyAccounts(
  text: string,
  customers: { id: string; company_name: string }[]
): string {
  let out = text;
  const sorted = [...customers].sort(
    (a, b) => b.company_name.length - a.company_name.length
  );
  for (const c of sorted) {
    const esc = c.company_name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(?<!\\[)(\\*\\*)?${esc}(\\*\\*)?`);
    out = out.replace(re, `[${c.company_name}](/customers/${c.id})`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Execute a real action and return a truthful confirmation.
// ---------------------------------------------------------------------------
async function executeAction(
  db: Db,
  action: Exclude<ChatAction, { type: "show_pitch" }>,
  contacts: Contact[],
  history: ChatTurn[]
): Promise<{ reply: string; suggestions: string[] }> {
  const contact = contacts.find((c) => c.customer_id === action.customerId);
  const contactId = contact?.id || "";

  if (action.type === "save_draft") {
    const draft = action.body || lastDraftFromHistory(history) || "Draft outreach.";
    const interaction = await db.interactions.create({
      customer_id: action.customerId,
      contact_id: contactId,
      pitch_session_id: null,
      outcome: "in_progress",
      notes: `✍️ Draft outreach (NOT sent — saved for your review):\n\n${draft}`,
      follow_up_date: null,
      logged_by: "Agent",
    });
    await db.agentRuns.create({
      kind: "act",
      title: `Saved a draft for ${action.company}`,
      customer_id: action.customerId,
      company: action.company,
      outcome: "handled",
      summary: `Wrote outreach and saved it to ${action.company}'s timeline for your review. Nothing was sent.`,
      steps: [
        { label: "Wrote the draft", status: "done" },
        { label: `Saved it to ${action.company}'s timeline`, status: "done" },
        { label: "Left it for you to review and send", status: "gated" },
      ],
      interaction_ids: [interaction.id],
    });
    return {
      reply: `Done — I saved the draft to ${action.company}'s timeline. It's marked as a draft for you to review and send; I didn't send anything. Want me to set a follow-up reminder too?\n\n[View it on ${action.company} →](/customers/${action.customerId})`,
      suggestions: [
        `Set a follow-up with ${action.company} next week`,
        `Tell me about ${action.company}`,
        "What should I focus on today?",
      ],
    };
  }

  if (action.type === "set_followup") {
    const interaction = await db.interactions.create({
      customer_id: action.customerId,
      contact_id: contactId,
      pitch_session_id: null,
      outcome: "in_progress",
      notes: `🔔 Follow-up reminder set by the agent (${action.label}).`,
      follow_up_date: action.when,
      logged_by: "Agent",
    });
    await db.agentRuns.create({
      kind: "act",
      title: `Set a follow-up with ${action.company}`,
      customer_id: action.customerId,
      company: action.company,
      outcome: "handled",
      summary: `Scheduled a follow-up with ${action.company} for ${action.label}.`,
      steps: [
        { label: `Scheduled the follow-up (${action.label})`, status: "done" },
        { label: `Added it to ${action.company}'s timeline`, status: "done" },
      ],
      interaction_ids: [interaction.id],
    });
    return {
      reply: `Set — I'll keep ${action.company} on your radar for ${prettyWhen(action.when)} (${action.label}). It's on the account timeline and in your to-dos. Want me to draft what you'll send then?\n\n[View it on ${action.company} →](/customers/${action.customerId})`,
      suggestions: [
        `Draft an email to ${action.company}`,
        "Who needs a follow-up?",
        "What should I focus on today?",
      ],
    };
  }

  // log_touch
  const interaction = await db.interactions.create({
    customer_id: action.customerId,
    contact_id: contactId,
    pitch_session_id: null,
    outcome: action.outcome,
    notes: `📝 ${action.notes}`,
    follow_up_date: null,
    logged_by: "Suren Dheen",
  });
  await db.agentRuns.create({
    kind: "act",
    title: `Logged a touch on ${action.company}`,
    customer_id: action.customerId,
    company: action.company,
    outcome: "handled",
    summary: `Logged your note on ${action.company}.`,
    steps: [{ label: "Saved your note to the timeline", status: "done" }],
    interaction_ids: [interaction.id],
  });
  return {
    reply: `Logged it on ${action.company}'s timeline. Want me to set a follow-up so it doesn't slip?\n\n[View it on ${action.company} →](/customers/${action.customerId})`,
    suggestions: [
      `Set a follow-up with ${action.company} next week`,
      `Tell me about ${action.company}`,
      "What should I focus on today?",
    ],
  };
}

// Read-only: surface the account's real, already-prepared pitch.
function showPitch(
  action: { customerId: string; company: string },
  sessions: PitchSession[]
): { reply: string; suggestions: string[] } {
  const session = sessions.find((s) => s.customer_id === action.customerId);
  if (!session) {
    return {
      reply: `There's no pitch prepared for ${action.company} yet — want me to draft one now?`,
      suggestions: [
        `Draft an email to ${action.company}`,
        `Tell me about ${action.company}`,
        "What should I focus on today?",
      ],
    };
  }
  let email: { subject_lines?: string[]; body?: string } = {};
  try {
    email =
      typeof session.pitch_email === "string"
        ? JSON.parse(session.pitch_email)
        : ((session.pitch_email as any) || {});
  } catch {}
  const subject = email.subject_lines?.[0] || "Introducing Freyr";
  const body = (email.body || "").trim() || "Pitch content is being prepared.";
  return {
    reply:
      `Here's the pitch queued for ${action.company} — this is what's waiting for your approval:\n\n` +
      `**Subject: ${subject}**\n\n${body}\n\n` +
      `There's also a 5-minute script and a cold-call script saved on the account. Want me to tighten this, change the tone, or set a follow-up? I won't send anything without your OK.`,
    suggestions: [
      "Make it shorter",
      `Set a follow-up with ${action.company} next week`,
      "What should I focus on today?",
    ],
  };
}

function lastDraftFromHistory(history: ChatTurn[]): string | null {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role !== "agent") continue;
    const idx = history[i].text.search(/subject:/i);
    if (idx !== -1)
      return history[i].text
        .slice(idx)
        .replace(/\n+Want me to[\s\S]*$/i, "")
        .trim();
  }
  return null;
}

function prettyWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "soon";
  }
}

// A compact, grounded snapshot of the pipeline for Claude to reason over.
function buildFacts(
  ctx: ChatContext,
  deals: ReturnType<typeof buildDeals>,
  needsApproval: number,
  runs: ChatContext["runs"]
): string {
  const open = deals.filter((d) => d.stage !== "Closed Lost");
  const openValue = open.reduce((s, d) => s + d.value, 0);
  const weighted = Math.round(openValue * 0.45);
  const cooling = open.filter((d) => d.staleDays > ROTTING_DAYS);
  const atRisk = ctx.customers.filter((c) => {
    const ints = ctx.interactions.filter((i) => i.customer_id === c.id);
    const cDeals = deals.filter((d) => d.customerId === c.id);
    const contactCount = ctx.contacts.filter((x) => x.customer_id === c.id).length;
    return accountHealth({ interactions: ints, deals: cDeals, contactCount }).band === "at_risk";
  });
  const top = [...open].sort((a, b) => b.value - a.value).slice(0, 5);
  const recent = runs.filter((r) => !r.reverted).slice(0, 5);
  const now = Date.now();
  const pending = ctx.topActions.filter((a) => a.kind === "approve" || a.kind === "send");

  // Per-account roster so the agent can answer specifics (contact, stage, last
  // touch, health) for ANY account instead of saying it doesn't have the data.
  const dealByCust: Record<string, (typeof deals)[number]> = {};
  for (const d of deals) if (!dealByCust[d.customerId]) dealByCust[d.customerId] = d;
  const roster = ctx.customers.map((c) => {
    const d = dealByCust[c.id];
    const contact = ctx.contacts.find((x) => x.customer_id === c.id);
    const ints = ctx.interactions
      .filter((i) => i.customer_id === c.id)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const lastDays = ints[0]
      ? `${Math.max(0, Math.floor((now - new Date(ints[0].created_at).getTime()) / 86400000))}d ago`
      : "no activity yet";
    const health = accountHealth({
      interactions: ints,
      deals: deals.filter((x) => x.customerId === c.id),
      contactCount: ctx.contacts.filter((x) => x.customer_id === c.id).length,
    });
    return (
      `- ${c.company_name} (${c.industry}, ${c.geography}) — ` +
      `${d ? `${d.stage}, ${formatMoney(d.value)}` : "no open deal"}; ` +
      `contact ${contact ? `${contact.full_name}, ${contact.job_title}${contact.email ? ` <${contact.email}>` : ""}` : "none mapped"}; ` +
      `health ${health.label}; last touch ${lastDays}`
    );
  });

  return [
    `PIPELINE: ${open.length} open deals worth ${formatMoney(openValue)} (≈${formatMoney(weighted)} weighted by stage).`,
    `PENDING APPROVALS (${pending.length}): ${pending.map((a) => a.title).join("; ") || "none"}.`,
    `TO-DO / FOCUS ACTIONS: ${ctx.topActions.slice(0, 10).map((a) => a.title).join("; ") || "none"}.`,
    `COOLING DEALS (${cooling.length}): ${cooling.slice(0, 6).map((d) => `${d.company} ${formatMoney(d.value)} quiet ${d.staleDays}d`).join("; ") || "none"}.`,
    `AT-RISK ACCOUNTS (${atRisk.length}): ${atRisk.slice(0, 6).map((c) => c.company_name).join("; ") || "none"}.`,
    `BIGGEST OPEN DEALS: ${top.map((d) => `${d.company} ${formatMoney(d.value)} (${d.stage})`).join("; ") || "none"}.`,
    `RECENT AGENT ACTIONS: ${recent.map((r) => r.title).join("; ") || "none"}.`,
    `ACCOUNTS (${ctx.customers.length} total, ${ctx.contacts.length} contacts):`,
    ...roster,
    `NOTE: a per-account pitch is already prepared and stored on each account with a session — if asked to show/pull up a pitch, say you'll pull it up (the app shows the real pitch).`,
  ].join("\n");
}
