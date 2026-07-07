import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { pushVersion } from "@/lib/versions";
import type { PitchSession } from "@/lib/types";

export const dynamic = "force-dynamic";

// Persist edited pitch content (5-min script / email / call script).
// Each save is also snapshotted into the session's version history.
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const body = await req.json().catch(() => ({}));
  const db = getDb();

  const session = await db.pitchSessions.get(params.id);
  if (!session)
    return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const patch: Partial<PitchSession> = {};
  if (typeof body.pitch_5min_script === "string")
    patch.pitch_5min_script = body.pitch_5min_script;
  if (body.pitch_email !== undefined)
    patch.pitch_email =
      typeof body.pitch_email === "string"
        ? body.pitch_email
        : JSON.stringify(body.pitch_email);
  if (typeof body.pitch_call_script === "string")
    patch.pitch_call_script = body.pitch_call_script;

  if (Object.keys(patch).length === 0)
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });

  patch.pitch_versions = pushVersion(
    session,
    {
      pitch_5min_script: patch.pitch_5min_script ?? session.pitch_5min_script,
      pitch_email: patch.pitch_email ?? session.pitch_email,
      pitch_call_script: patch.pitch_call_script ?? session.pitch_call_script,
    },
    "manual"
  );

  const updated = await db.pitchSessions.update(params.id, patch);
  if (!updated)
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  return NextResponse.json({ ok: true, versions: patch.pitch_versions });
}
