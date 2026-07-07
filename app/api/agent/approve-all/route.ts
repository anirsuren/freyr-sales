import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { notifyTelegram } from "@/lib/telegram";
import type { AgentRunStep } from "@/lib/types";

export const dynamic = "force-dynamic";

// Bulk approve (V9 #17). Clears the inbox's approval lane in one pass: approves
// every pitch currently in compliance review, recording the reviewer and a
// transparent agent run. Mirrors the per-session approve so the audit trail is
// identical — just batched.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const reviewer = String(body.reviewer || "Suren Dheen");

  const db = getDb();
  const [sessions, customers] = await Promise.all([
    db.pitchSessions.list(),
    db.customers.list(),
  ]);
  const custById = Object.fromEntries(customers.map((c) => [c.id, c]));
  const pending = sessions.filter((s) => s.review_status === "in_review");

  const now = new Date().toISOString();
  const steps: AgentRunStep[] = [];
  for (const s of pending) {
    await db.pitchSessions.update(s.id, {
      review_status: "approved",
      reviewer,
      reviewed_at: now,
    });
    steps.push({
      label: `Approved ${custById[s.customer_id]?.company_name || "a pitch"}`,
      detail: "Cleared compliance — now ready to send",
      status: "done",
    });
  }

  if (pending.length) {
    await db.agentRuns.create({
      kind: "act",
      title: `Approved ${pending.length} pitch${pending.length === 1 ? "" : "es"} in bulk`,
      customer_id: null,
      company: null,
      outcome: "handled",
      summary: `${pending.length} pitch${pending.length === 1 ? "" : "es"} cleared compliance.`,
      steps,
    });
    notifyTelegram(
      `📋 <b>Bulk approve</b>\n${pending.length} pitch(es) cleared compliance — ready to send.`
    );
  }

  return NextResponse.json({ ok: true, approved: pending.length });
}
