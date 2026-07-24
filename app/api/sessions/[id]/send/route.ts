import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { notifyTelegram } from "@/lib/telegram";
import { sendEmail } from "@/lib/email";
import { getDataMode } from "@/lib/dataMode";
import { hasEmail } from "@/lib/env";
import {
  approvedPitchEmail,
  isDeliverableEmail,
  matchesApprovedPitchEmail,
} from "@/lib/approvedPitchEmail";
import {
  isWorkflowOwnerOrManager,
  verifiedWorkflowActor,
} from "@/lib/workflowAuthorization";

export const dynamic = "force-dynamic";

// Send (or schedule) the pitch email (V3 #1/#3). Logs the send as an
// interaction so it shows on the Activity feed + account timeline. Real SMTP
// activates with mail credentials; mock mode records the intent.
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
  const body = await req.json().catch(() => ({}));
  const requestedRecipient = String(body.to || "").trim();
  const scheduleAt = body.scheduleAt ? String(body.scheduleAt) : null;

  const db = getDb();
  const session = await db.pitchSessions.get((await params).id);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if (session.review_status !== "approved") {
    return NextResponse.json(
      { error: "This pitch must be approved before it can be sent." },
      { status: 409 }
    );
  }

  const [customer, contact] = await Promise.all([
    db.customers.get(session.customer_id),
    db.contacts.get(session.contact_id),
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
      { error: "You can send pitches only for accounts assigned to you." },
      { status: 403 }
    );
  }

  const recipient = String(contact.email || "").trim();
  if (!isDeliverableEmail(recipient)) {
    return NextResponse.json(
      { error: "The session contact does not have a valid email address." },
      { status: 400 }
    );
  }
  if (
    requestedRecipient &&
    requestedRecipient.toLowerCase() !== recipient.toLowerCase()
  ) {
    return NextResponse.json(
      { error: "The recipient must match the contact on this pitch." },
      { status: 400 }
    );
  }
  const approved = approvedPitchEmail(session.pitch_email, body.subject);
  if (
    !approved ||
    !matchesApprovedPitchEmail(approved, body.subject, body.body)
  ) {
    return NextResponse.json(
      {
        error:
          "The email no longer matches the approved pitch. Save the changes and submit it for approval again.",
      },
      { status: 409 }
    );
  }
  if (getDataMode() === "live" && (!hasEmail() || scheduleAt)) {
    return NextResponse.json(
      { error: scheduleAt ? "Scheduled delivery is not configured." : "Email delivery is not configured. Nothing was sent." },
      { status: 503 }
    );
  }

  // Deliver immediately via the configured channel (mock when no key).
  let channel: string | undefined;
  if (!scheduleAt) {
    const sent = await sendEmail({
      to: recipient,
      subject: approved.subject,
      body: approved.body,
    });
    if (!sent.ok || (getDataMode() === "live" && sent.skipped)) {
      return NextResponse.json({ error: sent.error || "Email was not sent." }, { status: 502 });
    }
    channel = sent.channel;
  }

  // Only record the action after delivery succeeds (or after the intentional
  // mock-mode preview). A provider error must never create a false "sent" event.
  await db.interactions.create({
    pitch_session_id: (await params).id,
    customer_id: session.customer_id,
    contact_id: session.contact_id,
    outcome: "in_progress",
    notes: scheduleAt
      ? `Email scheduled (“${approved.subject}”) for ${scheduleAt}`
      : `Email sent: “${approved.subject}”`,
    follow_up_date: null,
    logged_by: actor.name,
  });

  notifyTelegram(
    `✉️ <b>${scheduleAt ? "Email scheduled" : "Email sent"}</b>\n${
      customer.company_name
    } · to ${recipient}\n“${approved.subject}”`
  );

  return NextResponse.json({ ok: true, scheduled: !!scheduleAt, channel });
}
