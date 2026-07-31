import { NextResponse } from "next/server";
import { answerAccountQuestion, type AccountContext } from "@/lib/agent";
import { agentAnswer } from "@/lib/claude";

export const dynamic = "force-dynamic";

// Per-account "Ask the agent" (V9). The workspace data can be live or sample,
// but the answer always comes from Claude. Only the explicitly forced test mode
// uses the deterministic responder.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const question = String(body.question || "").trim();
  const context = (body.context || {}) as AccountContext;
  if (!question || !context.company) {
    return NextResponse.json({ error: "Missing question or context" }, { status: 400 });
  }

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
  const answer =
    llm || (process.env.AGENT_FORCE_MOCK === "1" ? grounded : null);
  if (!answer) {
    return NextResponse.json(
      { error: "The assistant is unreachable right now." },
      { status: 503 }
    );
  }

  return NextResponse.json({
    answer,
    source: llm ? "claude" : "mock",
  });
}
