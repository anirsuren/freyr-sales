import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { notifyTelegram } from "@/lib/telegram";
import { sendEmail } from "@/lib/email";
import type { AgentRunStep } from "@/lib/types";

export const dynamic = "force-dynamic";

// Bulk send (V9). Sends every compliance-approved pitch that hasn't gone out
// yet, in one pass. Mirrors the per-session send (logs an "Email sent"
// interaction + delivers via the configured channel, mock when no key) so the
// audit trail is identical. Only approved pitches are eligible — the gate holds.
export async function POST() {
  const db = getDb();
  const [sessions, customers, contacts, interactions] = await Promise.all([
    db.pitchSessions.list(),
    db.customers.list(),
    db.contacts.list(),
    db.interactions.list(),
  ]);
  const custById = Object.fromEntries(customers.map((c) => [c.id, c]));
  const contactById = Object.fromEntries(contacts.map((c) => [c.id, c]));
  const alreadySent = new Set(
    interactions
      .filter((i) => /email sent/i.test(i.notes || ""))
      .map((i) => i.customer_id)
  );

  const ready = sessions.filter(
    (s) => s.review_status === "approved" && !alreadySent.has(s.customer_id)
  );

  const steps: AgentRunStep[] = [];
  for (const s of ready) {
    const co = custById[s.customer_id]?.company_name || "Account";
    const to = contactById[s.contact_id]?.email || "";
    let subject = `Freyr — partnering with ${co}`;
    try {
      const parsed = JSON.parse(String(s.pitch_email));
      if (parsed?.subject_lines?.[0]) subject = parsed.subject_lines[0];
    } catch {}

    await db.interactions.create({
      pitch_session_id: s.id,
      customer_id: s.customer_id,
      contact_id: s.contact_id,
      outcome: "in_progress",
      notes: `Email sent: “${subject}”`,
      follow_up_date: null,
      logged_by: "Freyr Agent",
    });
    if (to) await sendEmail({ to, subject, body: "" });

    steps.push({
      label: `Sent to ${co}`,
      detail: `“${subject}”`,
      status: "done",
    });
  }

  if (ready.length) {
    await db.agentRuns.create({
      kind: "act",
      title: `Sent ${ready.length} approved pitch${ready.length === 1 ? "" : "es"} in bulk`,
      customer_id: null,
      company: null,
      outcome: "sent",
      summary: `${ready.length} approved pitch${ready.length === 1 ? "" : "es"} delivered.`,
      steps,
    });
    notifyTelegram(
      `✉️ <b>Bulk send</b>\n${ready.length} approved pitch(es) delivered.`
    );
  }

  return NextResponse.json({ ok: true, sent: ready.length });
}
