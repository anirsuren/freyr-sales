import { NextResponse } from "next/server";
import { buildAccountBriefing, type AccountContext } from "@/lib/agent";
import { narrateBriefing } from "@/lib/claude";

export const dynamic = "force-dynamic";

// Agent account briefing (V9 #71) — the agent's proactive research synthesis for
// an account. Deterministic structure + a narrated headline (Claude when keyed,
// deterministic fallback otherwise). Never breaks the mock-first path.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const context = body.context as AccountContext | undefined;
  if (!context || !context.company) {
    return NextResponse.json({ error: "Missing context" }, { status: 400 });
  }
  const briefing = buildAccountBriefing(context);
  const narrated = await narrateBriefing(briefing);
  return NextResponse.json({
    ok: true,
    briefing,
    narrative: narrated || briefing.narrative,
    source: narrated ? "claude" : "mock",
  });
}
