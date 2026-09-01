import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { getRole } from "@/lib/role";
import { setRecordTeam, type TeamedRecord } from "@/lib/recordTeams";
import { moduleWriteRefusal } from "@/lib/moduleAccessServer";

export const dynamic = "force-dynamic";

/** Which module each record type belongs to, so the check is the module's. */
const MODULE_OF: Record<TeamedRecord, string> = {
  customer: "/customers",
  contract: "/contracts",
  offering: "/offerings",
  opportunity: "/opportunities",
  submission: "/solutioning",
  presentation: "/solutioning",
  solutionRequest: "/solutioning",
  meeting: "/meetings",
};

/**
 * SET WHO OWNS A RECORD AND WHO ELSE IS ON IT.
 *
 * Gated on being able to CHANGE the module the record lives in. It used to be
 * gated on being able to OPEN it, with the note that this "is not a permission
 * and nothing reads it to decide what somebody may open" — which stopped being
 * true when lib/recordAccess started reading these teams to answer mayView and
 * mayEdit on a record. Signed in as a BD Member I made myself the owner of
 * somebody else's deal in one call (found Aug 30 walking every role).
 *
 * The privilege table still decides, the same as everywhere else. This only
 * stops a read-level answer standing in for a write.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Bad request." }, { status: 400 });

  const type = String(body.type ?? "") as TeamedRecord;
  const id = String(body.id ?? "");
  const owningModule = MODULE_OF[type];
  if (!owningModule || !id)
    return NextResponse.json({ error: "Which record?" }, { status: 400 });

  const refusal = await moduleWriteRefusal(owningModule);
  if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });

  try {
    const me = await getCurrentUser();
    const state = await setRecordTeam({
      type,
      id,
      owner: body.owner ? String(body.owner) : undefined,
      members: body.members as string[] | undefined,
      by: me.name,
    });
    return NextResponse.json({ ok: true, state });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "That did not save." },
      { status: 400 }
    );
  }
}
