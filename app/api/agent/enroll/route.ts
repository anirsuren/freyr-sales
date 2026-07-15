import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { notifyTelegram } from "@/lib/telegram";
import { getSequence } from "@/lib/sequences";
import type { AgentRunStep } from "@/lib/types";

export const dynamic = "force-dynamic";

// Sequences agent surface (V9 #15). The agent enrolls one or more accounts into
// a sequence as part of a play — persisted, so they show on Sequences and the
// account timeline. Mock-first; dedupes against existing enrollments.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const sequenceId = String(body.sequenceId || "reengage");
  const ids: string[] = Array.isArray(body.customerIds)
    ? body.customerIds.map(String)
    : body.customerId
    ? [String(body.customerId)]
    : [];

  const seq = getSequence(sequenceId);
  if (!seq || ids.length === 0) {
    return NextResponse.json({ error: "Nothing to enroll" }, { status: 400 });
  }

  const db = getDb();
  const [customers, contacts, existing] = await Promise.all([
    db.customers.list(),
    db.contacts.list(),
    db.sequenceEnrollments.list(),
  ]);
  const custById = Object.fromEntries(customers.map((c) => [c.id, c]));
  const already = new Set(
    existing
      .filter((e) => e.sequence_id === sequenceId)
      .map((e) => e.customer_id)
  );

  const steps: AgentRunStep[] = [];
  const enrolled: string[] = [];
  for (const cid of ids) {
    if (already.has(cid) || !custById[cid]) continue;
    await db.sequenceEnrollments.create({
      customer_id: cid,
      sequence_id: sequenceId,
      step_index: 0,
      enrolled_by: "Freyr Agent",
    });
    const co = custById[cid].company_name;
    const contactId = contacts.find((c) => c.customer_id === cid)?.id;
    if (contactId) {
      await db.interactions.create({
        pitch_session_id: null,
        customer_id: cid,
        contact_id: contactId,
        outcome: "in_progress",
        notes: `🤖 Agent enrolled ${co} in the “${seq.name}” sequence`,
        follow_up_date: null,
        logged_by: "Freyr Agent",
      });
    }
    enrolled.push(co);
    steps.push({
      label: `Enrolled ${co}`,
      detail: `Started the “${seq.name}” sequence at step 1`,
      status: "done",
    });
  }

  if (enrolled.length) {
    await db.agentRuns.create({
      kind: "act",
      title: `Enrolled ${enrolled.length} account${
        enrolled.length === 1 ? "" : "s"
      } in “${seq.name}”`,
      customer_id: ids.length === 1 ? ids[0] : null,
      company: ids.length === 1 ? custById[ids[0]]?.company_name || null : null,
      outcome: "handled",
      summary: `${enrolled.length} account${
        enrolled.length === 1 ? "" : "s"
      } started the ${seq.name} sequence.`,
      steps,
    });
    notifyTelegram(
      `🤖 <b>Agent enrolled ${enrolled.length} account(s)</b>\n${seq.name}`
    );
  }

  return NextResponse.json({ ok: true, enrolled: enrolled.length });
}
