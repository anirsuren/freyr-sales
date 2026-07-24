import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getDataMode } from "@/lib/dataMode";
import { generatePitches } from "@/lib/claude";
import { pushVersion } from "@/lib/versions";
import type { MatchingOutput, RecommendedService } from "@/lib/types";
import {
  isWorkflowOwnerOrManager,
  verifiedWorkflowActor,
} from "@/lib/workflowAuthorization";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Re-run pitch generation for a session and persist the result.
// Returns the fresh pitches (live AI when ANTHROPIC_API_KEY is set; mock otherwise).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await verifiedWorkflowActor(req);
  if (!actor) {
    return NextResponse.json(
      { error: "Verified workspace access required." },
      { status: 403 }
    );
  }
  const db = getDb();
  const session = await db.pitchSessions.get((await params).id);
  if (!session)
    return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const [customer, contact, kb] = await Promise.all([
    db.customers.get(session.customer_id),
    db.contacts.get(session.contact_id),
    db.freyrKb.get(),
  ]);
  if (!customer || !contact) {
    return NextResponse.json(
      { error: "The pitch account or contact was not found." },
      { status: 404 }
    );
  }
  if (
    getDataMode() === "live" &&
    !isWorkflowOwnerOrManager(
      actor,
      customer.owner_user_id,
      customer.owner
    )
  ) {
    return NextResponse.json(
      { error: "You can regenerate pitches only for accounts assigned to you." },
      { status: 403 }
    );
  }

  const matchingOutput: MatchingOutput = {
    recommended_services: (session.recommended_services ||
      []) as RecommendedService[],
    customer_summary: customer.enrichment_summary || "",
    contact_summary: contact.enrichment_summary || "",
    recommended_tone: "Executive / Direct",
    things_to_avoid: [],
  };

  const pitches = await generatePitches({
    matchingOutput,
    contactProfile: contact.raw_linkedin_data || {
      fullName: contact.full_name,
      currentTitle: contact.job_title,
      about: contact.career_summary,
    },
    customerSummary: customer.enrichment_summary || "",
    freyrKb: kb?.structured_kb,
    senderName: actor.name,
  });

  const newFields = {
    pitch_5min_script: pitches.pitch_5min_script,
    pitch_email: JSON.stringify(pitches.pitch_email),
    pitch_call_script:
      typeof pitches.pitch_call_script === "string"
        ? pitches.pitch_call_script
        : JSON.stringify(pitches.pitch_call_script),
  };
  const pitch_versions = pushVersion(session, newFields, "regenerate");

  await db.pitchSessions.update((await params).id, {
    ...newFields,
    pitch_versions,
    review_status: "draft",
    reviewer: null,
    review_note: null,
    reviewed_at: null,
  });

  return NextResponse.json({
    ok: true,
    pitches,
    review_status: "draft",
    versions: pitch_versions,
  });
}
