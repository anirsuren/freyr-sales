import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/currentUser";
import { verifiedRequestMemberScope } from "@/lib/memberScope";

export const dynamic = "force-dynamic";

// Persisted agent run history (V9). Lists the runs the agent has recorded for
// the person asking, newest first, each with its step-by-step detail.
//
// YOUR RUNS, NOT THE WORKSPACE'S (found in the Sep 26 audit): this answered
// every run in the workspace to any signed-in member. An admin still sees all
// of them; everyone else sees the ones they started.
export async function GET(req: NextRequest) {
  const scope = await verifiedRequestMemberScope(req);
  if (!scope) {
    return NextResponse.json(
      { error: "Verified workspace access required." },
      { status: 403 }
    );
  }
  const [me, runs] = await Promise.all([getCurrentUser(), getDb().agentRuns.list()]);
  const visible =
    me.role === "admin"
      ? runs
      : runs.filter((run) => run.created_by_user_id === scope.userId);
  return NextResponse.json({ runs: visible });
}
