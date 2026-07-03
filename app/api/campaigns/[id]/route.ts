import { NextRequest, NextResponse } from "next/server";
import { getCampaign, updateCampaign } from "@/lib/campaigns";
import { hasEmail } from "@/lib/env";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const campaign = getCampaign(params.id);
  if (!campaign)
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, campaign });
}

// PATCH: edit content/recipients, or { queue: true } to queue the blast.
// Sending stays honest: without an email key nothing is delivered — the
// campaign sits "queued" until the channel is connected.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
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
  if (body.queue) {
    patch.status = "queued";
    patch.queued_at = new Date().toISOString();
  }

  const campaign = updateCampaign(params.id, patch);
  if (!campaign)
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({
    ok: true,
    campaign,
    emailChannelLive: hasEmail(),
  });
}
