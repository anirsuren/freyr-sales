import { NextRequest, NextResponse } from "next/server";
import { verifiedWorkflowActor } from "@/lib/workflowAuthorization";
import { agentFileStatus, removeAgentFile, statusView } from "@/lib/agentFiles";

export const dynamic = "force-dynamic";

/** Where a file is: uploading, reading, ready (with its summary) or failed; a reading whose server died is started again. Only its owner can ask. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await verifiedWorkflowActor(req);
  if (!actor) return NextResponse.json({ error: "Verified workspace access required." }, { status: 403 });
  const record = await agentFileStatus({ workspaceId: actor.workspaceId, userId: actor.userId }, (await params).id);
  if (!record) return NextResponse.json({ error: "No such file." }, { status: 404 });
  return NextResponse.json({ file: statusView(record) });
}

/** Take a file back before it is sent (the x on its chip). */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await verifiedWorkflowActor(req);
  if (!actor) return NextResponse.json({ error: "Verified workspace access required." }, { status: 403 });
  const removed = await removeAgentFile({ workspaceId: actor.workspaceId, userId: actor.userId }, (await params).id);
  return removed ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "No such file." }, { status: 404 });
}
