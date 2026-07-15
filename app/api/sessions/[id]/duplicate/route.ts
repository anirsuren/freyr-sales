import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

// Duplicate a session for a similar prospect — copies the pitch content and
// recommended services into a fresh session (new id + timestamp, no history).
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = getDb();
  const session = await db.pitchSessions.get((await params).id);
  if (!session)
    return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const copy = await db.pitchSessions.create({
    customer_id: session.customer_id,
    contact_id: session.contact_id,
    kb_version: session.kb_version,
    recommended_services: session.recommended_services,
    pitch_email: session.pitch_email,
    pitch_5min_script: session.pitch_5min_script,
    pitch_call_script: session.pitch_call_script,
    additional_context: session.additional_context,
  });

  return NextResponse.json({ ok: true, id: copy.id });
}
