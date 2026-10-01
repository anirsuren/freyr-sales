import { NextRequest, NextResponse } from "next/server";
import { verifiedWorkflowActor } from "@/lib/workflowAuthorization";
import { canOpenModule } from "@/lib/moduleAccessServer";
import { createAgentFileUpload, statusView } from "@/lib/agentFiles";

export const dynamic = "force-dynamic";

/**
 * A FILE FOR THE AGENT, STEP ONE: a record and a signed URL the browser PUTs
 * the bytes to directly (no app-server hop, so a long video never passes
 * through this container). Step two is POST /api/agent/files/{id}/read.
 */
export async function POST(req: NextRequest) {
  const actor = await verifiedWorkflowActor(req);
  if (!actor) return NextResponse.json({ error: "Verified workspace access required." }, { status: 403 });
  if (!(await canOpenModule("/agent"))) return NextResponse.json({ error: "Not available on this account." }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { name?: unknown; size?: unknown; type?: unknown; conversationId?: unknown } | null;
  if (!body || typeof body.name !== "string") return NextResponse.json({ error: "Name the file." }, { status: 400 });
  try {
    const { record, uploadUrl, uploadHeaders } = await createAgentFileUpload(
      { workspaceId: actor.workspaceId, userId: actor.userId },
      {
        name: body.name,
        size: Number(body.size),
        type: typeof body.type === "string" ? body.type : "",
        conversationId: typeof body.conversationId === "string" ? body.conversationId : undefined,
      },
    );
    return NextResponse.json({ file: statusView(record), uploadUrl, uploadHeaders });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not start the upload." }, { status: 400 });
  }
}
