import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getDataMode } from "@/lib/dataMode";
import {
  isWorkflowOwnerOrManager,
  verifiedWorkflowActor,
} from "@/lib/workflowAuthorization";

export const dynamic = "force-dynamic";

// Duplicate a session for a similar prospect — copies the pitch content and
// recommended services into a fresh session (new id + timestamp, no history).
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
  const customer = await db.customers.get(session.customer_id);
  if (!customer)
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  if (
    getDataMode() === "live" &&
    !isWorkflowOwnerOrManager(
      actor,
      customer.owner_user_id,
      customer.owner
    )
  ) {
    return NextResponse.json(
      { error: "You can duplicate pitches only for accounts assigned to you." },
      { status: 403 }
    );
  }

  const copy = await db.pitchSessions.create({
    customer_id: session.customer_id,
    contact_id: session.contact_id,
    kb_version: session.kb_version,
    recommended_services: session.recommended_services,
    pitch_email: session.pitch_email,
    pitch_5min_script: session.pitch_5min_script,
    pitch_call_script: session.pitch_call_script,
    additional_context: session.additional_context,
    review_status: "draft",
    reviewer: null,
    review_note: null,
    reviewed_at: null,
  });

  return NextResponse.json({ ok: true, id: copy.id });
}
