import { NextResponse } from "next/server";
import { getDb, type Db } from "@/lib/db";
import { nextBestActions, focusActions, DRAFTABLE } from "@/lib/agent";
import { buildDeals, formatMoney, ROTTING_DAYS } from "@/lib/pipeline";
import { accountHealth } from "@/lib/health";
import {
  answerAgentChat,
  findAccount,
  parseWhen,
  type ChatContext,
  type ChatTurn,
  type ChatAction,
} from "@/lib/agentChat";
import { agentConverseAgentic, type AgentToolDef } from "@/lib/claude";
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
  // `mock:true` forces the deterministic brain — used by the test suite so
  // assertions stay reproducible whether or not a key is set.
  const forceMock = body.mock === true;

  // Deterministic responder: the offline safety net. Runs for the test suite
  // (mock:true) and whenever the live agent is unavailable (no key) or errors,
  // so the chat is never silent. It detects actions by pattern as a best effort —
  // the real reasoning lives in the tool-using agent below.
  const deterministic = async () => {
    const action = base.action;
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
    return NextResponse.json({
      ok: true,
      reply: base.text,
      suggestions: base.suggestions,
      source: "mock",
    });
  };

  if (forceMock) return deterministic();

  // -----------------------------------------------------------------------
  // PRIMARY: the real tool-using agent. Claude gets the whole book and DECIDES
  // what to do — read deeper detail, list/filter, or take a real (human-led)
  // action — instead of us pattern-matching. It answers anything, in any
  // language. Falls through to the deterministic net if there's no key/it errors.
  // -----------------------------------------------------------------------
  const facts = buildFacts(ctx, deals, needsApproval, runs);
  const agentSystem =
    "You are Freyr's AI sales agent for Suren Dheen, a senior rep/CEO in regulatory life-sciences. " +
    "You are a sharp, decisive sales partner: warm, concise, plain English, NO jargon. " +
    "Reply in the SAME language the user writes in (Spanish in → Spanish out, etc.). " +
    "You are HUMAN-LED: you draft, prep, and recommend; Suren approves everything. You NEVER claim to have " +
    "sent an email, made a call, or contacted anyone. The only real writes you make are saving a draft, " +
    "setting a follow-up, and logging a touch the rep ALREADY had — each waits for Suren. " +
    "Ground every number, name, email, and figure ONLY in the data below or in tool results — never invent. " +
    "Use your tools: get_account_detail for depth on a named account, list_accounts to filter the book, " +
    "save_draft / set_followup / log_touch to take a real action, show_pitch to surface a prepared pitch. " +
    "When asked to draft/re-engage/reach out, WRITE the full draft yourself (a 'Subject:' line + 3–5 short " +
    "sentences signed 'Suren Dheen · Freyr'), show it, then offer to save it — don't ask permission first, " +
    "and never use bracketed placeholders like [First Name]. If the rep names an account you don't have, " +
    "say so plainly. Keep non-draft answers to 2–5 sentences.\n\n" +
    "LIVE PIPELINE (your grounding — full book):\n" +
    facts;
  const turns: { role: "user" | "assistant"; content: string }[] = [
    ...history.map((t) => ({
      role: (t.role === "agent" ? "assistant" : "user") as "user" | "assistant",
      content: t.text,
    })),
    { role: "user" as const, content: message },
  ];

  // Resolve whatever the model put in an `account` field to a real customer:
  // a company name (full or partial), an id, OR a CONTACT's name — reps say
  // "draft something for Priya" or "what's the latest with Lena Vogt" all the time.
  const resolveAccount = (q: unknown) => {
    const s = String(q || "").trim();
    if (!s) return null;
    const byCompany = findAccount(s, customers) || customers.find((c) => c.id === s);
    if (byCompany) return byCompany;
    const lc = s.toLowerCase();
    if (lc.length < 3) return null;
    const ct = contacts.find((x) => {
      const fn = x.full_name
        .toLowerCase()
        .replace(/^(dr|mr|mrs|ms|prof)\.?\s+/, "")
        .trim();
      if (!fn) return false;
      if (lc.includes(fn) || fn.includes(lc)) return true;
      return fn
        .split(/\s+/)
        .some((p) => p.length >= 4 && new RegExp(`\\b${p}\\b`).test(lc));
    });
    return ct ? customers.find((c) => c.id === ct.customer_id) || null : null;
  };
  const dateOf = (iso: string) => new Date(iso).getTime();

  const runTool = async (
    name: string,
    input: any
  ): Promise<{ content: string; did?: string }> => {
    const notFound = (q: unknown) => ({
      content: `No account matching "${q}". Accounts on the book: ${customers
        .map((c) => c.company_name)
        .join(", ")}.`,
    });

    if (name === "get_account_detail") {
      const c = resolveAccount(input?.account);
      if (!c) return notFound(input?.account);
      const cDeals = deals.filter((d) => d.customerId === c.id);
      const open = cDeals.filter((d) => d.stage !== "Closed Lost");
      const cContacts = contacts.filter((x) => x.customer_id === c.id);
      const cInts = interactions
        .filter((i) => i.customer_id === c.id)
        .sort((a, b) => dateOf(b.created_at) - dateOf(a.created_at));
      const health = accountHealth({
        interactions: cInts,
        deals: cDeals,
        contactCount: cContacts.length,
      });
      const content = [
        `Account: ${c.company_name} — ${c.industry}, ${c.geography}, size ${c.size_tier}`,
        `Enrichment: ${c.enrichment_summary || "n/a"}`,
        `Health: ${health.label} (${health.score}/100)`,
        `Open deals (${open.length}, ${formatMoney(
          open.reduce((s, d) => s + d.value, 0)
        )}): ${open
          .map((d) => `${d.stage} ${formatMoney(d.value)}, quiet ${d.staleDays}d`)
          .join("; ") || "none"}`,
        `Contacts (${cContacts.length}): ${cContacts
          .map(
            (x) =>
              `${x.full_name}, ${x.job_title}${x.email ? ` <${x.email}>` : ""}`
          )
          .join("; ") || "none mapped"}`,
        `Recent interactions: ${cInts
          .slice(0, 6)
          .map(
            (i) =>
              `${new Date(i.created_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })} ${i.outcome} — ${(i.notes || "").replace(/\s+/g, " ").slice(0, 100)}`
          )
          .join(" | ") || "none"}`,
      ].join("\n");
      return { content };
    }

    if (name === "list_accounts") {
      const filter = String(input?.filter || "all");
      const open = deals.filter((d) => d.stage !== "Closed Lost");
      const healthOf = (c: (typeof customers)[number]) =>
        accountHealth({
          interactions: interactions.filter((i) => i.customer_id === c.id),
          deals: deals.filter((d) => d.customerId === c.id),
          contactCount: contacts.filter((x) => x.customer_id === c.id).length,
        });
      let rows: string[] = [];
      if (filter === "at_risk") {
        rows = customers
          .filter((c) => healthOf(c).band === "at_risk")
          .map((c) => `${c.company_name} — health ${healthOf(c).score}/100`);
      } else if (filter === "cooling") {
        rows = open
          .filter((d) => d.staleDays > ROTTING_DAYS)
          .sort((a, b) => b.staleDays - a.staleDays)
          .map((d) => `${d.company} — ${formatMoney(d.value)}, quiet ${d.staleDays}d (${d.stage})`);
      } else if (filter === "biggest") {
        rows = [...open]
          .sort((a, b) => b.value - a.value)
          .slice(0, 8)
          .map((d) => `${d.company} — ${formatMoney(d.value)} (${d.stage})`);
      } else {
        rows = customers.map((c) => {
          const d = open.find((x) => x.customerId === c.id);
          return `${c.company_name} — ${d ? `${d.stage} ${formatMoney(d.value)}` : "no open deal"}, health ${healthOf(c).score}/100`;
        });
      }
      return { content: rows.length ? rows.join("\n") : `No accounts match "${filter}".` };
    }

    if (name === "show_pitch") {
      const c = resolveAccount(input?.account);
      if (!c) return notFound(input?.account);
      const result = showPitch(
        { customerId: c.id, company: c.company_name },
        sessions
      );
      return { content: result.reply, did: "show_pitch" };
    }

    if (name === "save_draft") {
      const c = resolveAccount(input?.account);
      if (!c) return notFound(input?.account);
      const result = await executeAction(
        db,
        {
          type: "save_draft",
          customerId: c.id,
          company: c.company_name,
          body: String(input?.body || ""),
        },
        contacts,
        history
      );
      return { content: result.reply, did: "save_draft" };
    }

    if (name === "set_followup") {
      const c = resolveAccount(input?.account);
      if (!c) return notFound(input?.account);
      const when = parseWhen(String(input?.when || "next week"));
      const result = await executeAction(
        db,
        {
          type: "set_followup",
          customerId: c.id,
          company: c.company_name,
          when: when.iso,
          label: when.label,
        },
        contacts,
        history
      );
      return { content: result.reply, did: "set_followup" };
    }

    if (name === "log_touch") {
      const c = resolveAccount(input?.account);
      if (!c) return notFound(input?.account);
      const outcome = ["interested", "meeting_booked", "in_progress"].includes(
        String(input?.outcome)
      )
        ? (input.outcome as "interested" | "meeting_booked" | "in_progress")
        : "in_progress";
      const result = await executeAction(
        db,
        {
          type: "log_touch",
          customerId: c.id,
          company: c.company_name,
          notes: String(input?.notes || "Logged a touch."),
          outcome,
        },
        contacts,
        history
      );
      return { content: result.reply, did: "log_touch" };
    }

    return { content: `Unknown tool: ${name}.` };
  };

  const agentResult = await agentConverseAgentic(
    agentSystem,
    turns,
    AGENT_TOOLS,
    runTool
  );
  if (agentResult && agentResult.text) {
    return NextResponse.json({
      ok: true,
      reply: linkifyAccounts(agentResult.text, customers),
      suggestions: base.suggestions,
      source: "claude-agent",
      did: agentResult.dids[0],
    });
  }

  // No key, or the live agent errored → deterministic fallback.
  return deterministic();
}

// Tools the live agent can call. Reads (detail/list/pitch) keep it grounded;
// writes (draft/follow-up/log) are the only real side effects, and every one is
// human-led — saved for Suren to review, never sent.
const AGENT_TOOLS: AgentToolDef[] = [
  {
    name: "get_account_detail",
    description:
      "Full detail on ONE account: health score, every deal, all contacts (name, title, email), and recent interaction history. Use for any specific or in-depth question about a named account.",
    input_schema: {
      type: "object",
      properties: {
        account: {
          type: "string",
          description: "Company name; partial is fine (e.g. 'bionex').",
        },
      },
      required: ["account"],
    },
  },
  {
    name: "list_accounts",
    description:
      "List accounts matching a filter, with key stats. Use for portfolio-level questions.",
    input_schema: {
      type: "object",
      properties: {
        filter: {
          type: "string",
          enum: ["at_risk", "cooling", "biggest", "all"],
          description:
            "at_risk = unhealthy; cooling = open deal gone quiet; biggest = by open value; all = everything.",
        },
      },
      required: ["filter"],
    },
  },
  {
    name: "save_draft",
    description:
      "Save an outreach draft onto an account's timeline for Suren to review and send. NEVER sends. Provide the full draft body including a 'Subject:' line.",
    input_schema: {
      type: "object",
      properties: {
        account: { type: "string" },
        body: { type: "string", description: "Full draft incl. 'Subject:' line." },
      },
      required: ["account", "body"],
    },
  },
  {
    name: "set_followup",
    description: "Set a follow-up reminder on an account.",
    input_schema: {
      type: "object",
      properties: {
        account: { type: "string" },
        when: {
          type: "string",
          description:
            "Natural language: 'next week', 'in 3 days', 'Friday', 'June 30'.",
        },
      },
      required: ["account", "when"],
    },
  },
  {
    name: "log_touch",
    description:
      "Log a call/meeting/email the rep ALREADY had with an account (a past touch). Do NOT use for future intentions.",
    input_schema: {
      type: "object",
      properties: {
        account: { type: "string" },
        notes: { type: "string" },
        outcome: {
          type: "string",
          enum: ["interested", "meeting_booked", "in_progress"],
        },
      },
      required: ["account", "notes"],
    },
  },
  {
    name: "show_pitch",
    description:
      "Surface the pitch already prepared and stored for an account (subject + email body). Use when asked to show/pull up/review a pitch. Present the returned pitch to the rep verbatim — don't paraphrase it.",
    input_schema: {
      type: "object",
      properties: { account: { type: "string" } },
      required: ["account"],
    },
  },
];

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
