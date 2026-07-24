import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { notifyTelegram } from "@/lib/telegram";
import { OUTCOME_META } from "@/lib/utils";
import { authenticatedRequestActorName } from "@/lib/requestPrincipal";
import { getDataMode } from "@/lib/dataMode";
import {
  isWorkflowOwnerOrManager,
  verifiedWorkflowActor,
} from "@/lib/workflowAuthorization";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [actorName, actor] = await Promise.all([
    authenticatedRequestActorName(req),
    verifiedWorkflowActor(req),
  ]);
  if (!actor) {
    return NextResponse.json(
      { error: "Verified workspace access required." },
      { status: 403 }
    );
  }
  const body = await req.json().catch(() => ({}));
  const db = getDb();

  const session = await db.pitchSessions.get((await params).id);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  // The route identifies the pitch session, so its CRM links are authoritative.
  // Caller-supplied customer/contact ids could otherwise create an interaction
  // attached to unrelated records while claiming this pitch session.
  const customerId = session.customer_id;
  const contactId = session.contact_id;

  if (!body.outcome || !customerId || !contactId) {
    return NextResponse.json(
      { error: "outcome is required" },
      { status: 400 }
    );
  }

  const customer = await db.customers.get(customerId);
  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
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
      { error: "You can log outcomes only for accounts assigned to you." },
      { status: 403 }
    );
  }

  const interaction = await db.interactions.create({
    pitch_session_id: (await params).id,
    customer_id: customerId,
    contact_id: contactId,
    outcome: body.outcome,
    notes: body.notes || null,
    follow_up_date: body.follow_up_date || null,
    logged_by: actorName,
  });

  const contact = await db.contacts.get(contactId);
  const label = OUTCOME_META[body.outcome]?.label || body.outcome;
  notifyTelegram(
    `📞 <b>Outcome logged: ${label}</b>\n${customer?.company_name || ""} · ${
      contact?.full_name || ""
    }${body.notes ? `\n“${body.notes}”` : ""}`
  );

  return NextResponse.json({ ok: true, interaction });
}
