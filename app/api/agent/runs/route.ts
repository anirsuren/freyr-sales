import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

// Persisted agent run history (V9). Lists every run the agent has recorded —
// one-click handles, full plays, and autopilot passes — newest first, each with
// its step-by-step detail. Mock-first; Supabase-backed when keys are set.
export async function GET() {
  const db = getDb();
  const runs = await db.agentRuns.list();
  return NextResponse.json({ runs });
}
