import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { authenticatedRequestActorName } from "@/lib/requestPrincipal";
import { getSequence } from "@/lib/sequences";
import { getDataMode } from "@/lib/dataMode";
import {
  isWorkflowOwnerOrManager,
  verifiedWorkflowActor,
} from "@/lib/workflowAuthorization";

export async function POST(request: NextRequest) {
  const [actorName, actor] = await Promise.all([
    authenticatedRequestActorName(request),
    verifiedWorkflowActor(request),
  ]);
  if (!actor) {
    return NextResponse.json(
      { ok: false, error: "Verified workspace access required." },
      { status: 403 }
    );
  }
  const body = await request.json().catch(() => ({}));
  const sequenceId = String(body.sequenceId || "");
  const customerIds: string[] = Array.isArray(body.customerIds)
    ? body.customerIds.map(String)
    : [];
  const sequence = getSequence(sequenceId);
  if (!sequence || !customerIds.length) {
    return NextResponse.json({ ok: false, error: "Choose a sequence and at least one account." }, { status: 400 });
  }
  if (
    getDataMode() === "live" &&
    ((sequence.workspace_id && sequence.workspace_id !== actor.workspaceId) ||
      !isWorkflowOwnerOrManager(
        actor,
        sequence.owner_user_id,
        sequence.owner
      ))
  ) {
    return NextResponse.json(
      { ok: false, error: "You can enroll accounts only in sequences you own." },
      { status: 403 }
    );
  }
  const db = getDb();
  const [customers, contacts, existing] = await Promise.all([
    db.customers.list(),
    db.contacts.list(),
    db.sequenceEnrollments.list(),
  ]);
  const customerById = new Map(customers.map((customer) => [customer.id, customer]));
  if (
    getDataMode() === "live" &&
    customerIds.some((customerId) => {
      const customer = customerById.get(customerId);
      return (
        !customer ||
        !isWorkflowOwnerOrManager(
          actor,
          customer.owner_user_id,
          customer.owner
        )
      );
    })
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: "You can enroll only accounts assigned to you.",
      },
      { status: 403 }
    );
  }
  const enrolled = new Set(
    existing
      .filter((item) => item.sequence_id === sequenceId)
      .map((item) => item.customer_id)
  );
  /**
   * TWO DIFFERENT SKIPS USED TO LOOK THE SAME (found Aug 16, sweeping this API
   * for writes that quietly do nothing). An account already on the sequence is
   * a legitimate no-op — enrolling twice should not be an error — but an id
   * that matches no account at all is not a no-op, it is a miss. Both fell
   * through the same `continue` and the answer was 200 {ok:true, enrolled:0}
   * either way, so a caller enrolling a stale id was told it worked.
   */
  const unknown = customerIds.filter((id) => !customerById.has(id));
  if (unknown.length === customerIds.length) {
    return NextResponse.json(
      {
        ok: false,
        error:
          unknown.length === 1
            ? "That account no longer exists, so there was nothing to enroll."
            : "None of those accounts exist any more, so there was nothing to enroll.",
      },
      { status: 404 }
    );
  }

  let created = 0;
  let alreadyOn = 0;
  for (const customerId of customerIds) {
    const customer = customerById.get(customerId);
    if (!customer) continue;
    if (enrolled.has(customerId)) {
      alreadyOn++;
      continue;
    }
    await db.sequenceEnrollments.create({
      customer_id: customerId,
      sequence_id: sequenceId,
      step_index: 0,
      enrolled_by: actorName,
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
        logged_by: actorName,
      });
    }
    created++;
  }
  // Say what actually happened, not just that the call returned.
  return NextResponse.json({
    ok: true,
    enrolled: created,
    alreadyEnrolled: alreadyOn,
    unknown: unknown.length,
  });
}

export async function DELETE(request: NextRequest) {
  const actor = await verifiedWorkflowActor(request);
  if (!actor) {
    return NextResponse.json(
      { ok: false, error: "Verified workspace access required." },
      { status: 403 }
    );
  }
  const body = await request.json().catch(() => ({}));
  const enrollmentId = String(body.enrollmentId || "");
  if (!enrollmentId) {
    return NextResponse.json({ ok: false, error: "Enrollment is required." }, { status: 400 });
  }
  const db = getDb();
  const enrollment = await db.sequenceEnrollments.get(enrollmentId);
  if (!enrollment) {
    return NextResponse.json(
      { ok: false, error: "Enrollment not found." },
      { status: 404 }
    );
  }
  const [sequence, customer] = await Promise.all([
    Promise.resolve(getSequence(enrollment.sequence_id)),
    db.customers.get(enrollment.customer_id),
  ]);
  if (
    getDataMode() === "live" &&
    (!sequence ||
      !customer ||
      (sequence.workspace_id && sequence.workspace_id !== actor.workspaceId) ||
      !isWorkflowOwnerOrManager(
        actor,
        sequence.owner_user_id,
        sequence.owner
      ) ||
      !isWorkflowOwnerOrManager(
        actor,
        customer.owner_user_id,
        customer.owner
      ))
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: "You can remove only enrollments for your own accounts and sequences.",
      },
      { status: 403 }
    );
  }
  const removed = await db.sequenceEnrollments.remove(enrollmentId);
  return NextResponse.json(
    removed ? { ok: true } : { ok: false, error: "Enrollment not found." },
    { status: removed ? 200 : 404 }
  );
}
