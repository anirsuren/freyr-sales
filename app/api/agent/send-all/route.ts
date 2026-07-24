import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { notifyTelegram } from "@/lib/telegram";
import { sendEmail } from "@/lib/email";
import { getDataMode } from "@/lib/dataMode";
import { hasEmail } from "@/lib/env";
import {
  approvedPitchEmail,
  isDeliverableEmail,
} from "@/lib/approvedPitchEmail";
import type { AgentRunStep } from "@/lib/types";
import {
  isWorkflowManager,
  verifiedWorkflowActor,
} from "@/lib/workflowAuthorization";

export const dynamic = "force-dynamic";

// Bulk send (V9). Sends every compliance-approved pitch that hasn't gone out
// yet, in one pass. Mirrors the per-session send (logs an "Email sent"
// interaction + delivers via the configured channel, mock when no key) so the
// audit trail is identical. Only approved pitches are eligible — the gate holds.
export async function POST(request: NextRequest) {
  const actor = await verifiedWorkflowActor(request);
  if (!actor) {
    return NextResponse.json(
      { error: "Verified workspace access required." },
      { status: 403 }
    );
  }
  if (!isWorkflowManager(actor)) {
    return NextResponse.json(
      { error: "Manager access is required to send the workspace review queue." },
      { status: 403 }
    );
  }
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
  if (ready.length && getDataMode() === "live" && !hasEmail()) {
    return NextResponse.json(
      { error: "Email delivery is not configured. Nothing was sent." },
      { status: 503 }
    );
  }

  const steps: AgentRunStep[] = [];
  const failures: Array<{
    sessionId: string;
    company: string;
    error: string;
  }> = [];
  let delivered = 0;
  for (const s of ready) {
    const co = custById[s.customer_id]?.company_name || "Account";
    const to = String(contactById[s.contact_id]?.email || "").trim();
    const approved = approvedPitchEmail(s.pitch_email);
    if (!approved) {
      const error = "Approved pitch has no valid stored subject and body.";
      failures.push({ sessionId: s.id, company: co, error });
      steps.push({ label: `Skipped ${co}`, detail: error, status: "skipped" });
      continue;
    }
    if (!isDeliverableEmail(to)) {
      const error = "Pitch contact does not have a valid email address.";
      failures.push({ sessionId: s.id, company: co, error });
      steps.push({ label: `Skipped ${co}`, detail: error, status: "skipped" });
      continue;
    }

    const sent = await sendEmail({
      to,
      subject: approved.subject,
      body: approved.body,
    });
    if (!sent.ok || (getDataMode() === "live" && sent.skipped)) {
      const error = sent.error || "Email provider did not deliver the message.";
      failures.push({ sessionId: s.id, company: co, error });
      steps.push({ label: `Failed for ${co}`, detail: error, status: "skipped" });
      continue;
    }

    // The external delivery happens first. Only a confirmed provider success
    // (or the intentional mock preview) may create an "Email sent" audit entry.
    await db.interactions.create({
      pitch_session_id: s.id,
      customer_id: s.customer_id,
      contact_id: s.contact_id,
      outcome: "in_progress",
      notes: `Email sent: “${approved.subject}”`,
      follow_up_date: null,
      logged_by: actor.name,
    });
    delivered++;
    steps.push({
      label: `Sent to ${co}`,
      detail: `“${approved.subject}”`,
      status: "done",
    });
  }

  if (delivered || failures.length) {
    const summary = `${delivered} delivered${
      failures.length ? ` · ${failures.length} failed` : ""
    }.`;
    await db.agentRuns.create({
      kind: "act",
      created_by_user_id: actor.userId,
      created_by: actor.name,
      title: `Bulk pitch delivery: ${delivered} sent${
        failures.length ? `, ${failures.length} failed` : ""
      }`,
      customer_id: null,
      company: null,
      outcome:
        delivered && failures.length
          ? "mixed"
          : delivered
            ? "sent"
            : "escalated",
      summary,
      steps,
    });
    if (delivered) {
      notifyTelegram(
        `✉️ <b>Bulk send</b>\n${delivered} approved pitch(es) delivered${
          failures.length ? `; ${failures.length} failed` : ""
        }.`
      );
    }
  }

  return NextResponse.json({
    ok: failures.length === 0,
    sent: delivered,
    failed: failures.length,
    failures,
    ...(failures.length
      ? {
          error: `${delivered} delivered; ${failures.length} could not be sent.`,
        }
      : {}),
  });
}
