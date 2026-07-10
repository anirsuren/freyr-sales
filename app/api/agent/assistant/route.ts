import { NextResponse } from "next/server";
import { agentAnswer } from "@/lib/claude";

export const dynamic = "force-dynamic";

// The always-on assistant dock (Anir, Jul 8: "the agent is always there in the
// bottom right… it'll know what page I'm on, what I'm looking at, and answer
// questions on the side"). Page-agnostic and stateless — the client sends the
// page it's on plus whatever the rep is looking at, and we answer grounded in
// that. Claude when a key is set; a genuinely useful deterministic reply
// otherwise (never a dead "I can't answer that").
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const question = String(body.question || "").trim();
  const pageLabel = String(body.pageLabel || "Freyr");
  const subject = String(body.subject || "").trim(); // e.g. the account/contact on screen
  const path = String(body.path || "");
  const pageContext = String(body.pageContext || "").slice(0, 6000);
  if (!question) {
    return NextResponse.json({ error: "Missing question" }, { status: 400 });
  }

  const where = subject
    ? `${pageLabel} — specifically ${subject}`
    : pageLabel;

  const system =
    "You are Freyr's always-on sales assistant, embedded in the app. You are given " +
    "the exact text currently visible on the rep's screen under PAGE CONTENT — treat " +
    "it as the ground truth about what they're looking at and answer their question " +
    "directly from it. IMPORTANT: never say you can't access the record, pull the " +
    "data, or see the page — the relevant details are handed to you in PAGE CONTENT, " +
    "so read them and answer. Only if a specific fact is genuinely absent from PAGE " +
    "CONTENT should you say what you'd open to get it. You help with sales " +
    "intelligence: account health, next best actions, pitch and email drafting, " +
    "pipeline, contacts, offerings, campaigns and voice outreach. Be concise (1-5 " +
    "sentences), specific, plain-English — no jargon, no filler. Never invent numbers " +
    "that aren't in PAGE CONTENT.";
  const user =
    `The rep is on: ${where} (route ${path}).\n\n` +
    (pageContext
      ? `PAGE CONTENT (exactly what is on their screen right now):\n"""\n${pageContext}\n"""\n\n`
      : "") +
    `Their question: ${question}`;

  const llm = await agentAnswer(system, user);

  // Deterministic fallback that still uses the page content, so a keyless run
  // never produces a dead "I can't access that."
  const ctxLead = pageContext
    ? pageContext.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 6).join(" · ")
    : "";
  const fallback =
    subject
      ? `Here's what's on screen for ${subject}${ctxLead ? `: ${ctxLead}` : ""}. Ask me to pull its health, draft an intro or follow-up, or line up outreach and I'll get it ready to review.`
      : `You're on ${pageLabel}${ctxLead ? `: ${ctxLead}` : ""}. Point me at any account, contact, or deal and I'll dig in, prioritize, or draft outreach.`;

  return NextResponse.json({
    answer: llm || fallback,
    source: llm ? "claude" : "mock",
  });
}
