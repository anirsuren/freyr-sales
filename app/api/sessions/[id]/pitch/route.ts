import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getDataMode } from "@/lib/dataMode";
import { pushVersion } from "@/lib/versions";
import type { PitchSession } from "@/lib/types";
import {
  isWorkflowOwnerOrManager,
  verifiedWorkflowActor,
} from "@/lib/workflowAuthorization";

export const dynamic = "force-dynamic";

// Persist edited pitch content (5-min script / email / call script).
// Each save is also snapshotted into the session's version history.
export async function PATCH(
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
  const body = (await req.json().catch(() => ({}))) ?? {};
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
      { error: "You can edit pitches only for accounts assigned to you." },
      { status: 403 }
    );
  }

  const patch: Partial<PitchSession> = {};
  if (typeof body.pitch_5min_script === "string")
    patch.pitch_5min_script = body.pitch_5min_script;
  if (body.pitch_email !== undefined)
    patch.pitch_email =
      typeof body.pitch_email === "string"
        ? body.pitch_email
        : JSON.stringify(body.pitch_email);
  if (typeof body.pitch_call_script === "string")
    patch.pitch_call_script = body.pitch_call_script;

  if (Object.keys(patch).length === 0)
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });

  patch.pitch_versions = pushVersion(
    session,
    {
      pitch_5min_script: patch.pitch_5min_script ?? session.pitch_5min_script,
      pitch_email: patch.pitch_email ?? session.pitch_email,
      pitch_call_script: patch.pitch_call_script ?? session.pitch_call_script,
    },
    "manual"
  );
  // Compliance approval is tied to the exact stored copy. Any content mutation
  // must return the pitch to draft so changed material cannot reuse an old sign-off.
  patch.review_status = "draft";
  patch.reviewer = null;
  patch.review_note = null;
  patch.reviewed_at = null;

  const updated = await db.pitchSessions.update((await params).id, patch);
  if (!updated)
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  return NextResponse.json({
    ok: true,
    review_status: "draft",
    versions: patch.pitch_versions,
  });
}
