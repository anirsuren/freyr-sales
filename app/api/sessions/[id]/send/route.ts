import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { notifyTelegram } from "@/lib/telegram";
import { sendEmail } from "@/lib/email";
import { getDataMode } from "@/lib/dataMode";
import { hasEmail } from "@/lib/env";

export const dynamic = "force-dynamic";

// Send (or schedule) the pitch email (V3 #1/#3). Logs the send as an
// interaction so it shows on the Activity feed + account timeline. Real SMTP
// activates with mail credentials; mock mode records the intent.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
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
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return NextResponse.json({ error: "A valid recipient email is required" }, { status: 400 });
  }
  if (getDataMode() === "live" && (!hasEmail() || scheduleAt)) {
    return NextResponse.json(
      { error: scheduleAt ? "Scheduled delivery is not configured." : "Email delivery is not configured. Nothing was sent." },
      { status: 503 }
    );
  }

  const db = getDb();
  const session = await db.pitchSessions.get((await params).id);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Deliver immediately via the configured channel (mock when no key).
  let channel: string | undefined;
  if (!scheduleAt) {
    const sent = await sendEmail({
      to,
      subject,
      body: String(body.body || ""),
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
      ? `Email scheduled (“${subject}”) for ${scheduleAt}`
      : `Email sent: “${subject}”`,
    follow_up_date: null,
    logged_by: "Suren Dheen",
  });

  const customer = await db.customers.get(session.customer_id);
  notifyTelegram(
    `✉️ <b>${scheduleAt ? "Email scheduled" : "Email sent"}</b>\n${
      customer?.company_name || "Account"
    } · to ${to}\n“${subject}”`
  );

  return NextResponse.json({ ok: true, scheduled: !!scheduleAt, channel });
}
