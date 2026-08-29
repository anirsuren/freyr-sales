import { NextRequest, NextResponse } from "next/server";
import { bumpUsage } from "@/lib/usageCounters";
import { getDb } from "@/lib/db";
import { answerAccountQuestion, type AccountContext } from "@/lib/agent";
import { agentAnswer } from "@/lib/claude";
import { verifiedRequestMemberScope } from "@/lib/memberScope";
import { repIdentityBlock } from "@/lib/repIdentity";
import { readMemberProfile } from "@/lib/memberProfile";

export const dynamic = "force-dynamic";

// Per-account agent chat (V9 #45). GET returns the persisted thread; POST uses
// Claude in both live and sample-data workspaces and persists the conversation.
// The deterministic responder is reserved for the explicitly forced test mode;
// a real provider failure is surfaced as a failure, never as a fake AI answer.
export async function GET(req: NextRequest) {
  const scope = await verifiedRequestMemberScope(req);
  if (!scope) {
    return NextResponse.json(
      { error: "Verified workspace access required." },
      { status: 403 }
    );
  }
  const { searchParams } = new URL(req.url);
  const customerId = String(searchParams.get("customerId") || "");
  if (!customerId) {
    return NextResponse.json({ error: "Missing customerId" }, { status: 400 });
  }
  const db = getDb();
  return NextResponse.json({
    messages: await db.agentChats.list(scope, customerId),
  });
}

export async function DELETE(req: NextRequest) {
  const scope = await verifiedRequestMemberScope(req);
  if (!scope) {
    return NextResponse.json(
      { error: "Verified workspace access required." },
      { status: 403 }
    );
  }
  const body = (await req.json().catch(() => ({}))) ?? {};
  const customerId = String(body.customerId || "");
  if (!customerId) {
    return NextResponse.json({ error: "Missing customerId" }, { status: 400 });
  }
  const db = getDb();
  await db.agentChats.clear(scope, customerId);
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const scope = await verifiedRequestMemberScope(req);
  if (!scope) {
    return NextResponse.json(
      { error: "Verified workspace access required." },
      { status: 403 }
    );
  }
  const body = (await req.json().catch(() => ({}))) ?? {};
  const customerId = String(body.customerId || "");
  const question = String(body.question || "").trim();
  const context = (body.context || {}) as AccountContext;
  if (!customerId || !question || !context.company) {
    return NextResponse.json({ error: "Missing question or context" }, { status: 400 });
  }
  // Counted for the monthly note (Anir, Aug 18). After validation, so a
  // malformed request never counts as an interaction.
  bumpUsage(scope.userId, "agent");

  const db = getDb();

  // Read the thread BEFORE storing this turn, so the transcript we hand the
  // model is the conversation up to now and this question isn't duplicated.
  // Without this the agent answered every message cold: ask "what about the
  // renewal?" straight after a question about Helix and it had no idea which
  // renewal you meant (Anir, Jul 25: "it should have all the context ... at
  // least from that chat").
  const priorTurns = await db.agentChats.list(scope, customerId);
  await db.agentChats.create(scope, {
    customer_id: customerId,
    role: "me",
    text: question,
  });

  // Recent turns only — the account facts below carry the heavy context, and an
  // unbounded transcript would grow every reply's cost for little benefit.
  const transcript = priorTurns
    .slice(-8)
    .map((turn) => `${turn.role === "me" ? "You" : "Agent"}: ${turn.text}`)
    .join("\n");

  const [prefs, memberProfile] = await Promise.all([
    db.agentPrefs.get(scope),
    readMemberProfile(scope).catch(() => ({ title: "", signature: "" })),
  ]);
  const identity = repIdentityBlock(
    {
      name: context.owner || null,
      title: memberProfile.title || prefs?.linkedin_headline || null,
    },
    prefs
  );

  const grounded = answerAccountQuestion(question, context);
  const system =
    "You are Freyr's AI sales agent answering a rep's question about ONE account. " +
    "Be concise (1-3 sentences), specific, and grounded ONLY in the facts provided. " +
    "Never invent numbers. If the facts don't cover it, say what you'd check next. " +
    "Earlier turns of this conversation are provided: resolve follow-ups like " +
    '"what about them?" against that history rather than asking the rep to repeat themselves.' +
    (identity ? `\n\n${identity}` : "");
  const facts = [
    `Account: ${context.company}`,
    `Health: ${context.healthLabel} (${context.healthScore}/100)`,
    `Open value: ${context.openValue}`,
    `Deals: ${context.dealCount}`,
    `Contacts: ${context.contactCount}${context.topContact ? ` (e.g. ${context.topContact})` : ""}`,
    context.owner ? `Owner: ${context.owner}` : null,
    context.competitor ? `Competitor: ${context.competitor}` : null,
    context.lastActivity ? `Last activity: ${context.lastActivity}` : null,
    context.topAction ? `Top recommended action: ${context.topAction}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const llm = await agentAnswer(
    system,
    [
      `Account facts:\n${facts}`,
      transcript ? `Earlier in this conversation:\n${transcript}` : null,
      `Rep's question: ${question}`,
    ]
      .filter(Boolean)
      .join("\n\n")
  );
  const testFallback =
    process.env.AGENT_FORCE_MOCK === "1" ? grounded : null;
  const answer = llm || testFallback;
  if (!answer) {
    return NextResponse.json(
      { error: "The assistant is unreachable right now." },
      { status: 503 }
    );
  }
  const source: "claude" | "mock" = llm ? "claude" : "mock";

  await db.agentChats.create(scope, {
    customer_id: customerId,
    role: "agent",
    text: answer,
    source,
  });

  return NextResponse.json({ answer, source });
}
