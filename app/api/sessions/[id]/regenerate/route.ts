import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { generatePitches } from "@/lib/claude";
import { pushVersion } from "@/lib/versions";
import type { MatchingOutput, RecommendedService } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Re-run pitch generation for a session and persist the result.
// Returns the fresh pitches (live AI when ANTHROPIC_API_KEY is set; mock otherwise).
export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const db = getDb();
  const session = await db.pitchSessions.get(params.id);
  if (!session)
    return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const [customer, contact, kb] = await Promise.all([
    db.customers.get(session.customer_id),
    db.contacts.get(session.contact_id),
    db.freyrKb.get(),
  ]);

  const matchingOutput: MatchingOutput = {
    recommended_services: (session.recommended_services ||
      []) as RecommendedService[],
    customer_summary: customer?.enrichment_summary || "",
    contact_summary: contact?.enrichment_summary || "",
    recommended_tone: "Executive / Direct",
    things_to_avoid: [],
  };

  const pitches = await generatePitches({
    matchingOutput,
    contactProfile: contact?.raw_linkedin_data || {
      fullName: contact?.full_name,
      currentTitle: contact?.job_title,
      about: contact?.career_summary,
    },
    customerSummary: customer?.enrichment_summary || "",
    freyrKb: kb?.structured_kb,
  });

  const newFields = {
    pitch_5min_script: pitches.pitch_5min_script,
    pitch_email: JSON.stringify(pitches.pitch_email),
    pitch_call_script:
      typeof pitches.pitch_call_script === "string"
        ? pitches.pitch_call_script
        : JSON.stringify(pitches.pitch_call_script),
  };
  const pitch_versions = pushVersion(session, newFields, "regenerate");

  await db.pitchSessions.update(params.id, { ...newFields, pitch_versions });

  return NextResponse.json({ ok: true, pitches, versions: pitch_versions });
}
