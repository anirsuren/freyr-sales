import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { notifyTelegram } from "@/lib/telegram";
import { SEQUENCES, CHANNEL_LABEL } from "@/lib/sequences";
import { buildDeals, ROTTING_DAYS } from "@/lib/pipeline";
import type { AgentRunStep } from "@/lib/types";

export const dynamic = "force-dynamic";

// Sequence auto-run (V9 #20). One play that runs a sequence end to end: it
// ENROLLS every cooling account not yet in the sequence, then ADVANCES everyone
// already enrolled who is due a touch — logging each step and recording a single
// transparent agent run. The full re-engagement motion in one click. Mock-first.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const sequenceId = String(body.sequenceId || "reengage");
  const seq = SEQUENCES.find((s) => s.id === sequenceId);
  if (!seq) {
    return NextResponse.json({ error: "Unknown sequence" }, { status: 400 });
  }
  const lastIdx = seq.steps.length - 1;

  const db = getDb();
  const [sessions, customers, contacts, interactions, enrollments] =
    await Promise.all([
      db.pitchSessions.list(),
      db.customers.list(),
      db.contacts.list(),
      db.interactions.list(),
      db.sequenceEnrollments.list(),
    ]);
  const custById = Object.fromEntries(customers.map((c) => [c.id, c]));
  const contactFor = (cid: string) =>
    contacts.find((c) => c.customer_id === cid)?.id;

  const steps: AgentRunStep[] = [];
  let advanced = 0;
  let completed = 0;
  let enrolled = 0;

  // 1) Advance everyone already in the sequence who isn't finished.
  for (const e of enrollments.filter((x) => x.sequence_id === sequenceId)) {
    if (e.step_index >= lastIdx) continue;
    const nextIdx = e.step_index + 1;
    const step = seq.steps[nextIdx];
    await db.sequenceEnrollments.update(e.id, { step_index: nextIdx });
    const co = custById[e.customer_id]?.company_name || "Account";
    const cid = contactFor(e.customer_id);
    const isDone = nextIdx >= lastIdx;
    if (cid) {
      await db.interactions.create({
        pitch_session_id: null,
        customer_id: e.customer_id,
        contact_id: cid,
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

  // 2) Enroll cooling accounts not yet in the sequence.
  const inCadence = new Set(
    enrollments
      .filter((x) => x.sequence_id === sequenceId)
      .map((x) => x.customer_id)
  );
  const deals = buildDeals(sessions, customers, contacts, interactions);
  const candSeen = new Set<string>();
  const cooling = deals.filter(
    (d) =>
      d.staleDays > ROTTING_DAYS &&
      d.stage !== "Closed Lost" &&
      !inCadence.has(d.customerId) &&
      (candSeen.has(d.customerId) ? false : (candSeen.add(d.customerId), true))
  );
  for (const d of cooling) {
    await db.sequenceEnrollments.create({
      customer_id: d.customerId,
      sequence_id: sequenceId,
      step_index: 0,
      enrolled_by: "Freyr Agent",
    });
    const cid = contactFor(d.customerId);
    if (cid) {
      await db.interactions.create({
        pitch_session_id: null,
        customer_id: d.customerId,
        contact_id: cid,
        outcome: "in_progress",
        notes: `🤖 Agent enrolled ${d.company} in the “${seq.name}” sequence`,
        follow_up_date: null,
        logged_by: "Freyr Agent",
      });
    }
    enrolled++;
    steps.push({
      label: `Enrolled ${d.company}`,
      detail: `Started the “${seq.name}” sequence at step 1`,
      status: "done",
    });
  }

  const summary = `Enrolled ${enrolled} · advanced ${advanced}${
    completed ? ` · completed ${completed}` : ""
  }.`;
  let runId: string | null = null;
  if (advanced || enrolled) {
    const run = await db.agentRuns.create({
      kind: "plan",
      title: `Ran the ${seq.name} sequence`,
      customer_id: null,
      company: null,
      outcome: "handled",
      summary,
      steps,
    });
    runId = run?.id || null;
    notifyTelegram(
      `🤖 <b>Sequence auto-run</b>\n${seq.name}: enrolled ${enrolled}, advanced ${advanced}${
        completed ? `, completed ${completed}` : ""
      }.`
    );
  }

  return NextResponse.json({
    ok: true,
    enrolled,
    advanced,
    completed,
    runId,
    title: `Prepped the “${seq.name}” sequence`,
    summary,
    steps,
  });
}
