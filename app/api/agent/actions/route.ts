import { NextRequest, NextResponse } from "next/server";
import { verifiedWorkflowActor } from "@/lib/workflowAuthorization";
import { cancelProposal, executeProposal, type ActionContext } from "@/lib/agentActions";
import { pendingProposals } from "@/lib/agentActionStore";
import { internalAppOrigin } from "@/lib/internalOrigin";

export const dynamic = "force-dynamic";

/**
 * THE BUTTONS UNDER A PROPOSAL. "Do it" and "Not now" on the web card land
 * here. Pressing a button IS the confirmation, so no request-order guard is
 * needed: the person saw the card, then pressed. The action still runs
 * through the app's own route as the person, with the cookies on this request.
 */

async function context(request: NextRequest): Promise<ActionContext | null> {
  const actor = await verifiedWorkflowActor(request);
  if (!actor) return null;
  return {
    scope: { workspaceId: actor.workspaceId, userId: actor.userId },
    actorName: actor.name,
    cookie: request.headers.get("cookie") ?? "",
    internalOrigin: internalAppOrigin(),
    channel: "web",
  };
}

export async function GET(request: NextRequest) {
  const ctx = await context(request);
  if (!ctx) return NextResponse.json({ error: "Verified workspace access required." }, { status: 403 });
  try {
    const pending = await pendingProposals(ctx.scope);
    return NextResponse.json({ pending: pending.map((p) => ({ id: p.id, action: p.action, summary: p.summary, status: p.status, createdAt: p.createdAt, expiresAt: p.expiresAt })) });
  } catch {
    return NextResponse.json({ error: "Pending actions are unavailable right now." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  if (process.env.AGENT_ACTIONS_DISABLED === "1") {
    return NextResponse.json({ ok: false, error: "Agent actions are switched off on this workspace." }, { status: 503 });
  }
  const ctx = await context(request);
  if (!ctx) return NextResponse.json({ error: "Verified workspace access required." }, { status: 403 });
  const body = (await request.json().catch(() => null)) as { id?: unknown; decision?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  const decision = body?.decision === "confirm" || body?.decision === "cancel" ? body.decision : null;
  if (!id || !decision) return NextResponse.json({ error: "Say which proposal and whether to do it." }, { status: 400 });
  try {
    if (decision === "cancel") {
      const proposal = await cancelProposal(id, ctx);
      if (!proposal) return NextResponse.json({ error: "No such proposal." }, { status: 404 });
      return NextResponse.json({ ok: true, status: proposal.status, text: proposal.status === "cancelled" ? `Cancelled: ${proposal.summary}` : `That proposal was already ${proposal.status}.` });
    }
    const result = await executeProposal(id, ctx);
    if (!result.ok) {
      return NextResponse.json({ ok: false, status: result.proposal?.status ?? "failed", error: result.error, text: result.error }, { status: result.proposal ? 200 : 404 });
    }
    return NextResponse.json({ ok: true, status: "done", text: result.text, link: result.link ?? null });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "That did not work." }, { status: 500 });
  }
}
