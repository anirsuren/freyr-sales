import { verifiedRequestMemberScope } from "@/lib/memberScope";
import { canOpenModule } from "@/lib/moduleAccessServer";
import { readAgentAccountContext } from "@/lib/agentAccountContext";
import { NextRequest, NextResponse } from "next/server";
import { buildAccountBriefing } from "@/lib/agent";
import { narrateBriefing } from "@/lib/claude";

export const dynamic = "force-dynamic";

// Agent account briefing (V9 #71) — the agent's proactive research synthesis for
// an account. Deterministic structure + a narrated headline (Claude when keyed,
// deterministic fallback otherwise). Never breaks the mock-first path.
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
  const customerId = String(body.customerId || "");
  if (!customerId) {
    return NextResponse.json({ error: "Missing context" }, { status: 400 });
  }
  const context = await readAgentAccountContext(customerId);
  if (!context)
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  const briefing = buildAccountBriefing(context);
  const narrated = await narrateBriefing(briefing);
  return NextResponse.json({
    ok: true,
    briefing,
    narrative: narrated || briefing.narrative,
    source: narrated ? "claude" : "mock",
  });
}
