import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import type { AgentPrefs } from "@/lib/types";

export const dynamic = "force-dynamic";

// Agent preferences (V9 #25). The standing memory the agent's autopilot respects
// on every run. GET reads them; PUT updates the pinned ones. Mock-first.
export async function GET() {
  const db = getDb();
  return NextResponse.json({ prefs: await db.agentPrefs.get() });
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => ({}));
  const patch: Partial<AgentPrefs> = {};
  if ("focus_industry" in body) {
    patch.focus_industry = body.focus_industry
      ? String(body.focus_industry)
      : null;
  }
  if ("only_mine" in body) patch.only_mine = !!body.only_mine;
  if ("autopilot_reengage" in body)
    patch.autopilot_reengage = !!body.autopilot_reengage;
  if ("autopilot_stabilize" in body)
    patch.autopilot_stabilize = !!body.autopilot_stabilize;
  if ("autopilot_max_value" in body) {
    const v = Number(body.autopilot_max_value);
    patch.autopilot_max_value =
      body.autopilot_max_value == null || !Number.isFinite(v) || v <= 0
        ? null
        : v;
  }
  if ("draft_tone" in body && ["warm", "formal", "brief"].includes(body.draft_tone))
    patch.draft_tone = body.draft_tone as AgentPrefs["draft_tone"];
  if (
    "autopilot_cadence" in body &&
    ["off", "daily", "weekly"].includes(body.autopilot_cadence)
  )
    patch.autopilot_cadence = body.autopilot_cadence as AgentPrefs["autopilot_cadence"];
  if ("autopilot_last_run" in body)
    patch.autopilot_last_run = body.autopilot_last_run
      ? String(body.autopilot_last_run)
      : null;
  if (
    "digest_cadence" in body &&
    ["off", "daily", "weekly"].includes(body.digest_cadence)
  )
    patch.digest_cadence = body.digest_cadence as AgentPrefs["digest_cadence"];
  if ("digest_last_sent" in body)
    patch.digest_last_sent = body.digest_last_sent
      ? String(body.digest_last_sent)
      : null;

  const db = getDb();
  const prefs = await db.agentPrefs.update(patch);
  return NextResponse.json({ ok: true, prefs });
}
