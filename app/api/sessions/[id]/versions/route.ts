import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { makeVersion } from "@/lib/versions";

export const dynamic = "force-dynamic";

// Returns the pitch version history for a session. Synthesizes an "initial"
// snapshot from the current content when nothing has been saved yet.
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const db = getDb();
  const session = await db.pitchSessions.get(params.id);
  if (!session)
    return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const versions =
    session.pitch_versions && session.pitch_versions.length
      ? session.pitch_versions
      : [makeVersion(session, "initial", session.created_at)];

  return NextResponse.json({ versions });
}
