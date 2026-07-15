import { NextRequest, NextResponse } from "next/server";
import { createCampaign, listCampaigns } from "@/lib/campaigns";
import { getOffering } from "@/lib/offerings";
import { descSnippet, FREYR_CONTEXT } from "@/lib/outreach";
import type { CampaignObjective } from "@/lib/campaigns";

export async function GET() {
  return NextResponse.json({ ok: true, campaigns: listCampaigns() });
}

// Create a campaign. When subject/body are omitted, drafts starter content
// from the selected offering (the rep edits before queuing — Suren: "people
// can edit it and then make it a campaign content").
export async function POST(req: NextRequest) {
  let body: {
    name?: string;
    offeringId?: string;
    subject?: string;
    body?: string;
    recipientContactIds?: string[];
    objective?: CampaignObjective;
    owner?: string;
    audienceSummary?: string;
    scheduledAt?: string | null;
    preview?: boolean;
    queue?: boolean;
  } = {};
  try {
    body = await req.json();
  } catch {}
  if (!body.name?.trim()) {
    return NextResponse.json(
      { ok: false, error: "Give the campaign a name." },
      { status: 400 }
    );
  }
  const offering = body.offeringId ? getOffering(body.offeringId) : null;

  let subject = (body.subject || "").trim();
  let content = (body.body || "").trim();
  if (offering && (!subject || !content)) {
    // Campaign starter — one-to-many, so no per-person opener. Grounded in the
    // offering's real description; the rep edits before anything is queued.
    const snippet = descSnippet(offering);
    subject = subject || `${offering.offering_name} for your regulatory team`;
    content =
      content ||
      [
        `Hi there,`,
        ``,
        `If ${
          (offering.offering_category || "regulatory work").toLowerCase()
        } is on your team's plate, ${offering.offering_name} is worth two minutes of your time.`,
        ``,
        snippet ? `In one line: ${snippet}` : FREYR_CONTEXT,
        ``,
        `${
          /current/i.test(offering.current_availability)
            ? "It's available today"
            : offering.current_availability
            ? `Availability: ${offering.current_availability}`
            : "It's part of the Freya platform"
        } — happy to show you how teams like yours use it in 15 minutes.`,
        ``,
        `Would next week work for a quick call?`,
        ``,
        `Best,`,
        `Suren Dheen`,
        `Freyr Solutions`,
      ].join("\n");
  }
  if (!subject) subject = body.name.trim();
  if (!content) content = FREYR_CONTEXT;

  if (body.preview) {
    return NextResponse.json({ ok: true, draft: { subject, body: content } });
  }

  const campaign = createCampaign({
    name: body.name.trim(),
    offering_id: offering?.id || null,
    offering_name: offering?.offering_name || "",
    subject,
    body: content,
    recipient_contact_ids: Array.isArray(body.recipientContactIds)
      ? body.recipientContactIds.filter((x): x is string => typeof x === "string")
      : [],
    objective: body.objective,
    owner: body.owner,
    audience_summary: body.audienceSummary,
    scheduled_at: body.scheduledAt || null,
  });
  if (body.queue) {
    campaign.status = "queued";
    campaign.queued_at = new Date().toISOString();
  }
  return NextResponse.json({ ok: true, campaign });
}
