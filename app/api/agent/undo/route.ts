import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { notifyTelegram } from "@/lib/telegram";
import {
  isWorkflowManager,
  isWorkflowOwner,
  verifiedWorkflowActor,
} from "@/lib/workflowAuthorization";
import { rejectRealModeAgentMutation } from "@/lib/agentMutationPolicy";

export const dynamic = "force-dynamic";

// Run undo (V9). Reverts an auto-handled run — deletes the timeline entries the
// agent created and marks the run reverted, so a rep stays in control of
// anything the agent did without approval. Human-approved sends aren't undoable
// here (the play already went out); only act / autopilot runs are.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const runId = String(body.runId || "");
  if (!runId) {
    return NextResponse.json({ error: "Missing runId" }, { status: 400 });
  }

  const db = getDb();
  const run = await db.agentRuns.get(runId);
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  const actor = await verifiedWorkflowActor(req);
  if (!actor) {
    return NextResponse.json(
      { error: "Verified workspace access required." },
      { status: 403 }
    );
  }
  const denied = rejectRealModeAgentMutation();
  if (denied) return denied;
  if (
    !isWorkflowManager(actor) &&
    !isWorkflowOwner(actor, run.created_by_user_id, run.created_by)
  ) {
    return NextResponse.json(
      { error: "Only the person who created this run or a manager can undo it." },
      { status: 403 }
    );
  }
  if (run.kind === "play") {
    return NextResponse.json(
      { error: "Sent plays can't be undone" },
      { status: 400 }
    );
  }
  if (run.reverted) {
    return NextResponse.json({ ok: true, alreadyReverted: true });
  }

  let removed = 0;
  for (const id of run.interaction_ids || []) {
    if (await db.interactions.remove(id)) removed++;
  }

  await db.agentRuns.update(runId, {
    reverted: true,
    summary: `Reverted. ${removed} step(s) rolled back.`,
  });

  notifyTelegram(
    `🤖 <b>Agent run reverted</b>\n${run.title} - ${removed} step(s) rolled back.`
  );

  return NextResponse.json({ ok: true, removed });
}
