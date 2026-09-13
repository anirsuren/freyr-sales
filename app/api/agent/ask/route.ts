import { verifiedRequestMemberScope } from "@/lib/memberScope";
import { canOpenModule } from "@/lib/moduleAccessServer";
import { readAgentAccountContext } from "@/lib/agentAccountContext";
import { NextRequest, NextResponse } from "next/server";
import { answerAccountQuestion } from "@/lib/agent";
import { agentAnswer } from "@/lib/claude";

export const dynamic = "force-dynamic";

// Per-account "Ask the agent" (V9). The workspace data can be live or sample,
// but the answer always comes from Claude. Only the explicitly forced test mode
// uses the deterministic responder.
export async function POST(req: NextRequest) {
  if (!(await verifiedRequestMemberScope(req))) {
    return NextResponse.json(
      { error: "Verified workspace access required." },
      { status: 403 },
    );
  }
  if (!(await canOpenModule("/customers"))) {
    return NextResponse.json(
      { error: "Customers are not available on this account." },
      { status: 403 },
    );
  }
  const body = (await req.json().catch(() => ({}))) ?? {};
  const question = String(body.question || "").trim();
  const customerId = String(body.customerId || "");
  if (!question || !customerId) {
    return NextResponse.json(
      { error: "Missing question or context" },
      { status: 400 },
    );
  }

  const context = await readAgentAccountContext(customerId);
  if (!context)
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  const grounded = answerAccountQuestion(question, context);

  const system =
    "You are Freyr's AI sales agent answering a rep's question about ONE account. " +
    "Be concise (1-3 sentences), specific, and grounded ONLY in the facts provided. " +
    "Counts and estimates cover only sources this user can access, not necessarily the entire account. Never infer that hidden records do not exist. Never invent numbers. If the facts don't cover it, say what you'd check next.";
  const facts = [
    `Account: ${context.company}`,
    `Health estimate from visible records: ${context.healthLabel} (${context.healthScore}/100)`,
    `Visible pipeline value: ${context.openValue}`,
    `Visible deals: ${context.dealCount}`,
    `Visible contacts: ${context.contactCount}${context.topContact ? ` (e.g. ${context.topContact})` : ""}`,
    context.owner ? `Owner: ${context.owner}` : null,
    context.competitor ? `Competitor: ${context.competitor}` : null,
    context.lastActivity ? `Last activity: ${context.lastActivity}` : null,
    context.topAction ? `Top recommended action: ${context.topAction}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const llm = await agentAnswer(
    system,
    `Account facts:\n${facts}\n\nRep's question: ${question}`,
  );
  const answer =
    llm || (process.env.AGENT_FORCE_MOCK === "1" ? grounded : null);
  if (!answer) {
    return NextResponse.json(
      { error: "The assistant is unreachable right now." },
      { status: 503 },
    );
  }

  return NextResponse.json({
    answer,
    source: llm ? "claude" : "mock",
  });
}
