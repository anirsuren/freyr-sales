import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getDataMode } from "@/lib/dataMode";
import { notifyTelegram } from "@/lib/telegram";
import {
  isWorkflowManager,
  isWorkflowOwnerOrManager,
  verifiedWorkflowActor,
} from "@/lib/workflowAuthorization";
import type { ReviewStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const ACTION_TO_STATUS: Record<string, ReviewStatus> = {
  submit: "in_review",
  approve: "approved",
  request_changes: "changes_requested",
};

// Compliance approval workflow (V2 #7): move a pitch through
// draft -> in_review -> approved / changes_requested, recording the reviewer
// and an optional note. Gates the "Send to CRM" action client-side.
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
  const body = (await req.json().catch(() => ({}))) ?? {};
  const status = ACTION_TO_STATUS[String(body.action)];
  if (!status) {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
  if (status !== "in_review" && !isWorkflowManager(actor)) {
    return NextResponse.json(
      { error: "Manager access is required to approve or return pitches." },
      { status: 403 }
    );
  }

  const db = getDb();
  const session = await db.pitchSessions.get((await params).id);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  const customer = await db.customers.get(session.customer_id);
  if (!customer) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
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
      {
        error:
          "You can submit pitches only for accounts assigned to you.",
      },
      { status: 403 }
    );
  }

  const reviewer =
    status === "in_review" ? null : actor.name;
  const updated = await db.pitchSessions.update((await params).id, {
    review_status: status,
    reviewer,
    review_note: body.note ? String(body.note).slice(0, 1000) : null,
    reviewed_at: status === "in_review" ? null : new Date().toISOString(),
  });

  const verb =
    status === "in_review"
      ? "submitted for compliance review"
      : status === "approved"
      ? "approved"
      : "sent back for changes";
  notifyTelegram(
    `📋 <b>Pitch ${verb}</b>\n${customer.company_name}`
  );

  return NextResponse.json({ ok: true, session: updated });
}
