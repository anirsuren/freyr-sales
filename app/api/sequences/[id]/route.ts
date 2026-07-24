import { NextRequest, NextResponse } from "next/server";
import { getSequence, removeSequence, updateSequence, type SequenceStep } from "@/lib/sequences";
import {
  isWorkflowOwnerOrAdmin,
  verifiedWorkflowActor,
} from "@/lib/workflowAuthorization";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = (await params).id;
  const existing = getSequence(id);
  if (!existing) {
    return NextResponse.json({ ok: false, error: "Sequence not found." }, { status: 404 });
  }
  const actor = await verifiedWorkflowActor(request);
  if (!actor) {
    return NextResponse.json(
      { ok: false, error: "Verified workspace access required." },
      { status: 403 }
    );
  }
  if (
    existing.workspace_id &&
    existing.workspace_id !== actor.workspaceId
  ) {
    return NextResponse.json(
      { ok: false, error: "Sequence not found." },
      { status: 404 }
    );
  }
  if (
    !isWorkflowOwnerOrAdmin(
      actor,
      existing.owner_user_id,
      existing.owner
    )
  ) {
    return NextResponse.json(
      { ok: false, error: "Only the sequence owner or an admin can change it." },
      { status: 403 }
    );
  }
  const body = await request.json().catch(() => ({}));
  const steps = Array.isArray(body.steps)
    ? body.steps
        .map((step: Partial<SequenceStep>) => ({
          day: Math.max(0, Math.round(Number(step.day) || 0)),
          channel: step.channel,
          label: String(step.label || "").trim(),
        }))
        .filter((step: SequenceStep) => ["email", "call", "wait"].includes(step.channel) && step.label)
        .sort((a: SequenceStep, b: SequenceStep) => a.day - b.day)
    : undefined;
  const sequence = updateSequence(id, {
    ...(typeof body.name === "string" ? { name: body.name } : {}),
    ...(typeof body.description === "string" ? { description: body.description } : {}),
    ...(steps?.length ? { steps } : {}),
    ...(body.status === "active" || body.status === "paused" ? { status: body.status } : {}),
  });
  return NextResponse.json({ ok: true, sequence });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = (await params).id;
  const existing = getSequence(id);
  if (!existing) {
    return NextResponse.json(
      { ok: false, error: "Sequence not found." },
      { status: 404 }
    );
  }
  const actor = await verifiedWorkflowActor(request);
  if (!actor) {
    return NextResponse.json(
      { ok: false, error: "Verified workspace access required." },
      { status: 403 }
    );
  }
  if (
    existing.workspace_id &&
    existing.workspace_id !== actor.workspaceId
  ) {
    return NextResponse.json(
      { ok: false, error: "Sequence not found." },
      { status: 404 }
    );
  }
  if (
    !isWorkflowOwnerOrAdmin(
      actor,
      existing.owner_user_id,
      existing.owner
    )
  ) {
    return NextResponse.json(
      { ok: false, error: "Only the sequence owner or an admin can delete it." },
      { status: 403 }
    );
  }
  const removed = removeSequence(id);
  return NextResponse.json(
    removed ? { ok: true } : { ok: false, error: "Sequence not found." },
    { status: removed ? 200 : 404 }
  );
}
