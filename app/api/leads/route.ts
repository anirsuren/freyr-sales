import { NextRequest, NextResponse } from "next/server";
import { verifiedRequestMemberScope } from "@/lib/memberScope";
import { getCurrentUser } from "@/lib/currentUser";
import { getDataMode } from "@/lib/dataMode";
import { canAccessModule } from "@/lib/moduleAccess";
import {
  markLeadConverted,
  readLeads,
  removeLead,
  saveLead,
} from "@/lib/leads";

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
  return canAccessModule("/leads", me.role)
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
  const scope = await verifiedRequestMemberScope(req);
  if (!scope) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const shut = await closed();
  if (shut) return shut;
  if (getDataMode() !== "live") {
    return NextResponse.json(
      { error: "Mock mode shows sample leads only. Switch to Real to work them." },
      { status: 400 }
    );
  }
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
