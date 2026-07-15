import { NextResponse } from "next/server";
import { getSequence, removeSequence, updateSequence, type SequenceStep } from "@/lib/sequences";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = (await params).id;
  if (!getSequence(id)) {
    return NextResponse.json({ ok: false, error: "Sequence not found." }, { status: 404 });
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
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const removed = removeSequence((await params).id);
  return NextResponse.json(
    removed ? { ok: true } : { ok: false, error: "Sequence not found." },
    { status: removed ? 200 : 404 }
  );
}
