import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { getRole } from "@/lib/role";
import { canAccessModule } from "@/lib/moduleAccess";
import { setRecordTeam, type TeamedRecord } from "@/lib/recordTeams";
import { canOpenModule } from "@/lib/moduleAccessServer";

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
 * Gated on the module the record lives in — if you can open the customer you
 * can say who is on the customer — and nothing more. This stores who is on a
 * thing; it is not a permission and nothing reads it to decide what somebody
 * may open.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Bad request." }, { status: 400 });

  const type = String(body.type ?? "") as TeamedRecord;
  const id = String(body.id ?? "");
  const owningModule = MODULE_OF[type];
  if (!owningModule || !id)
    return NextResponse.json({ error: "Which record?" }, { status: 400 });

  if (!(await canOpenModule(owningModule)))
    return NextResponse.json(
      { error: "Not available on this account." },
      { status: 403 }
    );

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
