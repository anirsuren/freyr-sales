import { NextRequest, NextResponse } from "next/server";
import { getCampaign, updateCampaign } from "@/lib/campaigns";
import { hasEmail } from "@/lib/env";
import {
  isWorkflowOwnerOrAdmin,
  verifiedWorkflowActor,
} from "@/lib/workflowAuthorization";
import { moduleWriteRefusal } from "@/lib/moduleAccessServer";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const campaign = getCampaign((await params).id);
  if (!campaign)
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, campaign });
}

// PATCH: edit content/recipients, or { queue: true } to queue the blast.
// Sending stays honest: without an email key nothing is delivered — the
// campaign sits "queued" until the channel is connected.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  /* WRITE IS ITS OWN PERMISSION (Suren, Aug 29). Refuses before the
     handler reads a body, so a person who may READ this module cannot
     change it. Falls through to the old role rules while the privilege
     table is not being enforced. */
  {
    const refusal = await moduleWriteRefusal("/campaigns");
    if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });
  }

  const id = (await params).id;
  const existing = getCampaign(id);
  if (!existing)
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  const actor = await verifiedWorkflowActor(req);
  if (!actor) {
    return NextResponse.json(
      { ok: false, error: "Verified workspace access required." },
      { status: 403 }
    );
  }
  if (
    existing.workspace_id &&
    existing.workspace_id !== actor.workspaceId
  ) {
    return NextResponse.json(
      { ok: false, error: "Not found" },
      { status: 404 }
    );
  }
  if (
    !isWorkflowOwnerOrAdmin(
      actor,
      existing.owner_user_id,
      existing.owner
    )
  ) {
    return NextResponse.json(
      { ok: false, error: "Only the campaign owner or an admin can change it." },
      { status: 403 }
    );
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {}

  const patch: any = {};
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
  if (typeof body.subject === "string") patch.subject = body.subject;
  if (typeof body.body === "string") patch.body = body.body;
  if (Array.isArray(body.recipientContactIds))
    patch.recipient_contact_ids = body.recipientContactIds.filter(
      (x: unknown): x is string => typeof x === "string"
    );
  if (typeof body.objective === "string") patch.objective = body.objective;
  if (typeof body.audienceSummary === "string") patch.audience_summary = body.audienceSummary;
  if (typeof body.scheduledAt === "string" || body.scheduledAt === null)
    patch.scheduled_at = body.scheduledAt;
  if (body.queue) {
    patch.status = "queued";
    patch.queued_at = new Date().toISOString();
  }

  const campaign = updateCampaign(id, patch);
  if (!campaign)
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({
    ok: true,
    campaign,
    emailChannelLive: hasEmail(),
  });
}
