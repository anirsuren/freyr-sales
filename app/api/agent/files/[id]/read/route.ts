import { NextRequest, NextResponse } from "next/server";
import { verifiedWorkflowActor } from "@/lib/workflowAuthorization";
import { canOpenModule } from "@/lib/moduleAccessServer";
import { startAgentFileRead, statusView } from "@/lib/agentFiles";

export const dynamic = "force-dynamic";

/** Step two, once the bytes are up: read it in the background. Poll GET /api/agent/files/{id} for when it is ready. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await verifiedWorkflowActor(req);
  if (!actor) return NextResponse.json({ error: "Verified workspace access required." }, { status: 403 });
  if (!(await canOpenModule("/agent"))) return NextResponse.json({ error: "Not available on this account." }, { status: 403 });
  try {
    const record = await startAgentFileRead({ workspaceId: actor.workspaceId, userId: actor.userId }, (await params).id);
    return NextResponse.json({ file: statusView(record) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not read that file." }, { status: 400 });
  }
}
