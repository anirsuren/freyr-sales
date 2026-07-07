import { NextResponse } from "next/server";
import { planGoal } from "@/lib/agent";
import { agentAnswer } from "@/lib/claude";

export const dynamic = "force-dynamic";

// Goal → plan steps (V9). Mock-first: with ANTHROPIC_API_KEY the agent drafts
// the plan via Claude; without a key (or on any error) it falls back to the
// deterministic `planGoal`, so the planner never goes dark.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const goal = String(body.goal || "").trim();
  if (!goal) {
    return NextResponse.json({ error: "Missing goal" }, { status: 400 });
  }

  const fallback = planGoal(goal);

  const system =
    "You are Freyr's AI sales agent (regulatory-affairs GTM). Turn the rep's " +
    "goal into 3-5 concrete, ordered steps you would take to achieve it. The " +
    "last step must hand anything that leaves the building to the rep for " +
    "approval. Return ONLY the steps, one per line, no numbering or preamble.";
  const llm = await agentAnswer(system, `Goal: ${goal}`);

  let steps = fallback;
  let source: "claude" | "mock" = "mock";
  if (llm) {
    const parsed = llm
      .split("\n")
      .map((l) => l.replace(/^\s*[-*\d.)]+\s*/, "").trim())
      .filter(Boolean)
      .slice(0, 6);
    if (parsed.length >= 2) {
      steps = parsed;
      source = "claude";
    }
  }

  return NextResponse.json({ steps, source });
}
