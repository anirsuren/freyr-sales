import { NextRequest, NextResponse } from "next/server";
import { verifiedRequestMemberScope } from "@/lib/memberScope";
import { getCurrentUser } from "@/lib/currentUser";
import { isManagerOrAdmin } from "@/lib/moduleAccess";
import { getDataMode } from "@/lib/dataMode";
import { addTarget, readTargets, removeTarget, updateTarget } from "@/lib/targets";

/**
 * TARGET ACCOUNTS over HTTP. Reading is anyone signed in; changing who owns a
 * pursuit or dropping a target is managers and admins, the same line the
 * customers list draws. Mock never accepts a write.
 */

export async function GET(req: NextRequest) {
  const scope = await verifiedRequestMemberScope(req);
  if (!scope) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  return NextResponse.json({ state: await readTargets() });
}

export async function POST(req: NextRequest) {
  const scope = await verifiedRequestMemberScope(req);
  if (!scope) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (getDataMode() === "mock") {
    return NextResponse.json(
      { error: "Sample data is read-only. Switch to Real mode to work the target list." },
      { status: 403 }
    );
  }
  const me = await getCurrentUser();
  if (!isManagerOrAdmin(me.role)) {
    return NextResponse.json(
      { error: "Only managers and admins change the target list." },
      { status: 403 }
    );
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  try {
    const op = String(body.op ?? "");
    if (op === "add") {
      if (!String(body.name ?? "").trim()) {
        return NextResponse.json(
          { error: "The company name is the one thing a target must have." },
          { status: 400 }
        );
      }
      const state = await addTarget({
        name: body.name,
        domain: body.domain,
        hq: body.hq,
        tier: body.tier,
        owner: body.owner,
        potential: body.potential,
        quarter: body.quarter,
        degreeOfConnection: body.degreeOfConnection,
        companyRevenue: body.companyRevenue,
        notes: body.notes,
      });
      return NextResponse.json({ state });
    }
    if (op === "update") {
      const state = await updateTarget(String(body.id ?? ""), {
        owner: body.owner === undefined ? undefined : String(body.owner),
        tier: body.tier === undefined ? undefined : String(body.tier),
        quarter: body.quarter === undefined ? undefined : String(body.quarter),
        notes: body.notes === undefined ? undefined : String(body.notes),
      });
      return NextResponse.json({ state });
    }
    if (op === "remove") {
      const state = await removeTarget(String(body.id ?? ""));
      return NextResponse.json({ state });
    }
    return NextResponse.json({ error: "Unknown operation." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "That didn't save." },
      { status: 400 }
    );
  }
}
