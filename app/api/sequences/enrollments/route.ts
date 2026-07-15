import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSequence } from "@/lib/sequences";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const sequenceId = String(body.sequenceId || "");
  const customerIds = Array.isArray(body.customerIds)
    ? body.customerIds.map(String)
    : [];
  const sequence = getSequence(sequenceId);
  if (!sequence || !customerIds.length) {
    return NextResponse.json({ ok: false, error: "Choose a sequence and at least one account." }, { status: 400 });
  }
  const db = getDb();
  const [customers, contacts, existing] = await Promise.all([
    db.customers.list(),
    db.contacts.list(),
    db.sequenceEnrollments.list(),
  ]);
  const customerById = new Map(customers.map((customer) => [customer.id, customer]));
  const enrolled = new Set(
    existing
      .filter((item) => item.sequence_id === sequenceId)
      .map((item) => item.customer_id)
  );
  let created = 0;
  for (const customerId of customerIds) {
    const customer = customerById.get(customerId);
    if (!customer || enrolled.has(customerId)) continue;
    await db.sequenceEnrollments.create({
      customer_id: customerId,
      sequence_id: sequenceId,
      step_index: 0,
      enrolled_by: "Suren Dheen",
    });
    const contact = contacts.find((item) => item.customer_id === customerId);
    if (contact) {
      await db.interactions.create({
        pitch_session_id: null,
        customer_id: customerId,
        contact_id: contact.id,
        outcome: "in_progress",
        notes: `Enrolled ${customer.company_name} in the “${sequence.name}” sequence`,
        follow_up_date: null,
        logged_by: "Suren Dheen",
      });
    }
    created++;
  }
  return NextResponse.json({ ok: true, enrolled: created });
}

export async function DELETE(request: Request) {
  const body = await request.json().catch(() => ({}));
  const enrollmentId = String(body.enrollmentId || "");
  if (!enrollmentId) {
    return NextResponse.json({ ok: false, error: "Enrollment is required." }, { status: 400 });
  }
  const removed = await getDb().sequenceEnrollments.remove(enrollmentId);
  return NextResponse.json(
    removed ? { ok: true } : { ok: false, error: "Enrollment not found." },
    { status: removed ? 200 : 404 }
  );
}
