import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { answerAccountQuestion, type AccountContext } from "@/lib/agent";
import { agentAnswer } from "@/lib/claude";

export const dynamic = "force-dynamic";

// Per-account agent chat (V9 #45). GET returns the persisted thread; POST answers
// the question (Claude when keyed, deterministic otherwise) AND persists both the
// rep's message and the agent's reply, so the conversation survives navigation.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const customerId = String(searchParams.get("customerId") || "");
  if (!customerId) {
    return NextResponse.json({ error: "Missing customerId" }, { status: 400 });
  }
  const db = getDb();
  return NextResponse.json({ messages: await db.agentChats.list(customerId) });
}

export async function DELETE(req: Request) {
  const body = await req.json().catch(() => ({}));
  const customerId = String(body.customerId || "");
  if (!customerId) {
    return NextResponse.json({ error: "Missing customerId" }, { status: 400 });
  }
  const db = getDb();
  await db.agentChats.clear(customerId);
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const customerId = String(body.customerId || "");
  const question = String(body.question || "").trim();
  const context = (body.context || {}) as AccountContext;
  if (!customerId || !question || !context.company) {
    return NextResponse.json({ error: "Missing question or context" }, { status: 400 });
  }

  const db = getDb();
  await db.agentChats.create({ customer_id: customerId, role: "me", text: question });

  const grounded = answerAccountQuestion(question, context);
  const system =
    "You are Freyr's AI sales agent answering a rep's question about ONE account. " +
    "Be concise (1-3 sentences), specific, and grounded ONLY in the facts provided. " +
    "Never invent numbers. If the facts don't cover it, say what you'd check next.";
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
    `Account facts:\n${facts}\n\nRep's question: ${question}`
  );
  const answer = llm || grounded;
  const source: "claude" | "mock" = llm ? "claude" : "mock";

  await db.agentChats.create({
    customer_id: customerId,
    role: "agent",
    text: answer,
    source,
  });

  return NextResponse.json({ answer, source });
}
