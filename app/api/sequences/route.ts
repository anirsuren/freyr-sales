import { NextResponse } from "next/server";
import {
  createSequence,
  listSequences,
  type SequenceChannel,
  type SequenceStep,
} from "@/lib/sequences";

export async function GET() {
  return NextResponse.json({ ok: true, sequences: listSequences() });
}

function validSteps(value: unknown): SequenceStep[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((step) => {
      const raw = step as Partial<SequenceStep>;
      const day = Number(raw.day);
      const channel = raw.channel as SequenceChannel;
      const label = String(raw.label || "").trim();
      if (!Number.isFinite(day) || day < 0 || !["email", "call", "wait"].includes(channel) || !label) {
        return null;
      }
      return { day: Math.round(day), channel, label };
    })
    .filter((step): step is SequenceStep => !!step)
    .sort((a, b) => a.day - b.day);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  const description = String(body.description || "").trim();
  const steps = validSteps(body.steps);
  if (!name) {
    return NextResponse.json({ ok: false, error: "Give the sequence a name." }, { status: 400 });
  }
  if (!steps.length) {
    return NextResponse.json({ ok: false, error: "Add at least one valid step." }, { status: 400 });
  }
  const sequence = createSequence({ name, description, steps });
  return NextResponse.json({ ok: true, sequence });
}
