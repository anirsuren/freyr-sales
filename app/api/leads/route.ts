import { NextRequest, NextResponse } from "next/server";
import { verifiedRequestMemberScope } from "@/lib/memberScope";
import { getCurrentUser } from "@/lib/currentUser";
import { canAccessModule } from "@/lib/moduleAccess";
import {
  markLeadConverted,
  readLeads,
  removeLead,
  saveLead,
} from "@/lib/leads";
import { canOpenModule, moduleWriteRefusal } from "@/lib/moduleAccessServer";

export const dynamic = "force-dynamic";

/**
 * LEADS API. One route, op-switched, the same shape as Solutioning.
 *
 * The module is admin-only for now (lib/moduleAccess NEW_MODULES_ADMIN_ONLY),
 * and the endpoint enforces that itself rather than trusting the page guard —
 * hiding a nav item is a curtain, this is the lock.
 */
async function closed(): Promise<NextResponse | null> {
  const me = await getCurrentUser();
  return (await canOpenModule("/leads"))
    ? null
    : NextResponse.json({ error: "Not available on this account." }, { status: 403 });
}

export async function GET(req: NextRequest) {
  const scope = await verifiedRequestMemberScope(req);
  if (!scope) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const shut = await closed();
  if (shut) return shut;
  return NextResponse.json({ state: await readLeads() });
}

export async function POST(req: NextRequest) {
  /* WRITE IS ITS OWN PERMISSION (Suren, Aug 29). Refuses before the
     handler reads a body, so a person who may READ this module cannot
     change it. Falls through to the old role rules while the privilege
     table is not being enforced. */
  {
    const refusal = await moduleWriteRefusal("/leads");
    if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });
  }

  const scope = await verifiedRequestMemberScope(req);
  if (!scope) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const shut = await closed();
  if (shut) return shut;
  /* Mock writes go to the mock row and can never reach real data, so there is
     nothing to refuse (Anir, Aug 26: "all the same functionality should be on
     mock mode, but it shouldn't affect real data"). See readLeads. */
  const me = await getCurrentUser();
  const body = (await req.json().catch(() => ({}))) ?? {};
  const op = String(body.op ?? "");

  try {
    if (op === "save") {
      const lead = await saveLead(body.lead ?? {}, me.name);
      return NextResponse.json({ ok: true, lead, state: await readLeads() });
    }
    if (op === "delete") {
      await removeLead(String(body.id ?? ""));
      return NextResponse.json({ ok: true, state: await readLeads() });
    }
    if (op === "convert") {
      const lead = await markLeadConverted(
        String(body.id ?? ""),
        String(body.opportunityId ?? ""),
        me.name
      );
      if (!lead) {
        return NextResponse.json({ error: "That lead is gone." }, { status: 404 });
      }
      return NextResponse.json({ ok: true, lead, state: await readLeads() });
    }
    return NextResponse.json({ error: `Unknown op "${op}".` }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "That didn't save." },
      { status: 400 }
    );
  }
}
