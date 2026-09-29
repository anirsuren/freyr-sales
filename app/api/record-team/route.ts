import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { getRole } from "@/lib/role";
import { setRecordTeam, type TeamedRecord } from "@/lib/recordTeams";
import {
  moduleWriteRefusal,
  recordWriteRefusal,
} from "@/lib/moduleAccessServer";
import { getDb } from "@/lib/db";
import { readOpportunities } from "@/lib/opportunities";
import { readMeetings } from "@/lib/meetings";
import { readSolutioning } from "@/lib/solutioning";

/** The real owner of a record, so the record-level check has something to read. */
async function recordOwnership(
  type: TeamedRecord,
  id: string
): Promise<{ id: string; owner?: string | null; owner_user_id?: string | null; created_by?: string | null }> {
  try {
    if (type === "customer") {
      const c = await getDb().customers.get(id);
      return c
        ? { id: c.id, owner: c.owner, owner_user_id: c.owner_user_id, created_by: c.created_by }
        : { id };
    }
    if (type === "opportunity") {
      const deal = (await readOpportunities()).opportunities.find((o) => o.id === id);
      return deal ? { id, owner: deal.owner ?? null } : { id };
    }
    if (type === "meeting") {
      const meeting = (await readMeetings()).meetings.find((m) => m.id === id);
      return meeting ? { id, owner: meeting.owner ?? null } : { id };
    }
    if (type === "submission" || type === "presentation" || type === "solutionRequest") {
      const request = (await readSolutioning()).requests.find((r) => r.id === id);
      return request ? { id, owner: request.owner ?? null } : { id };
    }
  } catch {
    /* A store that will not answer must not become a way in: fall through to
       the bare id, which recordWriteRefusal reads as unclaimed only when the
       record genuinely has nobody on it. */
  }
  return { id };
}

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

  /**
   * AND YOU CANNOT PUT YOURSELF ON SOMEBODY ELSE'S RECORD.
   *
   * This is the route that decides who is on a record, so without a record-level
   * check it is the way around every other record-level check: add yourself as
   * the owner here, and the account you could only view a second ago is yours to
   * edit. The module check above is not enough, because the whole point of
   * Suren's Sep 1 rule is that holding Edit on Customers no longer means holding
   * Edit on every customer.
   *
   * An UNCLAIMED record still accepts the first person to take it. That is how
   * anything ever gets an owner, and it matches what recordWriteRefusal answers
   * for a record nobody is on.
   */
  {
    /**
     * EVERY TYPE HANDS OVER ITS REAL OWNER, NOT JUST A CUSTOMER.
     *
     * Only `customer` was loaded; every other type was passed as a bare
     * `{ id }`. A record with no owner fields reads as UNCLAIMED, and an
     * unclaimed record accepts the first person to take it, so this route
     * handed any BD Member ownership of ANY opportunity, solutioning record or
     * meeting, and with it the edit rights that ownership carries. Proved on
     * Sep 29 by posting seed-opp-3, owned by Suren, as a BD Member: 200, and
     * the deal was theirs. The escalation the comment above describes was real
     * for four of the six types it guards.
     */
    const record = await recordOwnership(type, id);
    const denied = await recordWriteRefusal(owningModule, record);
    if (denied) return NextResponse.json({ error: denied }, { status: 403 });
  }

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
