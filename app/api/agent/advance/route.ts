import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { notifyTelegram } from "@/lib/telegram";
import { SEQUENCES, CHANNEL_LABEL } from "@/lib/sequences";
import type { AgentRunStep, SequenceEnrollment } from "@/lib/types";

export const dynamic = "force-dynamic";

// Sequence step advance (V9 #19). The agent executes a sequence: it advances an
// enrolled account to its next step, logging the touch (channel + label) to the
// account timeline, and marks the sequence complete at the last step. Accepts a
// single enrollmentId, or { sequenceId, all: true } to advance every active
// enrollment in a sequence. Mock-first; persisted so progress survives.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const db = getDb();
  const [enrollments, customers, contacts] = await Promise.all([
    db.sequenceEnrollments.list(),
    db.customers.list(),
    db.contacts.list(),
  ]);
  const custById = Object.fromEntries(customers.map((c) => [c.id, c]));

  let targets: SequenceEnrollment[] = [];
  if (body.enrollmentId) {
    targets = enrollments.filter((e) => e.id === String(body.enrollmentId));
  } else if (body.sequenceId) {
    targets = enrollments.filter((e) => e.sequence_id === String(body.sequenceId));
  }

  const steps: AgentRunStep[] = [];
  let advanced = 0;
  let completed = 0;
  for (const e of targets) {
    const seq = SEQUENCES.find((s) => s.id === e.sequence_id);
    if (!seq) continue;
    const lastIdx = seq.steps.length - 1;
    if (e.step_index >= lastIdx) continue; // already at the end

    const nextIdx = e.step_index + 1;
    const step = seq.steps[nextIdx];
    await db.sequenceEnrollments.update(e.id, { step_index: nextIdx });

    const co = custById[e.customer_id]?.company_name || "Account";
    const contactId = contacts.find((c) => c.customer_id === e.customer_id)?.id;
    const isDone = nextIdx >= lastIdx;
    if (contactId) {
      await db.interactions.create({
        pitch_session_id: null,
        customer_id: e.customer_id,
        contact_id: contactId,
        outcome: "in_progress",
        notes: isDone
          ? `🤖 Agent completed the “${seq.name}” sequence for ${co}`
          : `🤖 Agent advanced ${co} to step ${nextIdx + 1} (${CHANNEL_LABEL[step.channel]}): ${step.label}`,
        follow_up_date: null,
        logged_by: "Freyr Agent",
      });
    }
    advanced++;
    if (isDone) completed++;
    steps.push({
      label: `${co} → step ${nextIdx + 1} of ${seq.steps.length}`,
      detail: isDone ? `Completed the ${seq.name} sequence` : step.label,
      status: "done",
    });
  }

  if (advanced) {
    await db.agentRuns.create({
      kind: "act",
      title: `Advanced ${advanced} sequence step${advanced === 1 ? "" : "s"}`,
      customer_id:
        targets.length === 1 ? targets[0].customer_id : null,
      company:
        targets.length === 1
          ? custById[targets[0].customer_id]?.company_name || null
          : null,
      outcome: "handled",
      summary: `${advanced} step${advanced === 1 ? "" : "s"} advanced${
        completed ? `, ${completed} sequence${completed === 1 ? "" : "s"} completed` : ""
      }.`,
      steps,
    });
    notifyTelegram(
      `🤖 <b>Sequence advanced</b>\n${advanced} step(s)${
        completed ? ` · ${completed} completed` : ""
      }`
    );
  }

  return NextResponse.json({ ok: true, advanced, completed });
}
