import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { notifyTelegram } from "@/lib/telegram";
import { sendEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

// Send (or schedule) the pitch email (V3 #1/#3). Logs the send as an
// interaction so it shows on the Activity feed + account timeline. Real SMTP
// activates with mail credentials; mock mode records the intent.
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const body = await req.json().catch(() => ({}));
  const subject = String(body.subject || "").trim();
  const to = String(body.to || "").trim();
  const scheduleAt = body.scheduleAt ? String(body.scheduleAt) : null;

  if (!subject || !to) {
    return NextResponse.json(
      { error: "subject and recipient are required" },
      { status: 400 }
    );
  }

  const db = getDb();
  const session = await db.pitchSessions.get(params.id);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  await db.interactions.create({
    pitch_session_id: params.id,
    customer_id: session.customer_id,
    contact_id: session.contact_id,
    outcome: "in_progress",
    notes: scheduleAt
      ? `Email scheduled (“${subject}”) for ${scheduleAt}`
      : `Email sent: “${subject}”`,
    follow_up_date: null,
    logged_by: "Suren Dheen",
  });

  // Deliver immediately via the configured channel (mock when no key).
  let channel: string | undefined;
  if (!scheduleAt) {
    const sent = await sendEmail({
      to,
      subject,
      body: String(body.body || ""),
    });
    channel = sent.channel;
  }

  const customer = await db.customers.get(session.customer_id);
  notifyTelegram(
    `✉️ <b>${scheduleAt ? "Email scheduled" : "Email sent"}</b>\n${
      customer?.company_name || "Account"
    } · to ${to}\n“${subject}”`
  );

  return NextResponse.json({ ok: true, scheduled: !!scheduleAt, channel });
}
