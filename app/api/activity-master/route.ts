import { NextRequest, NextResponse } from "next/server";
import { verifiedRequestMemberScope } from "@/lib/memberScope";
import { getCurrentUser } from "@/lib/currentUser";
import { isManagerOrAdmin } from "@/lib/moduleAccess";
import { getDataMode } from "@/lib/dataMode";
import {
  addMasterActivity,
  readActivityMaster,
  removeMasterActivity,
  updateMasterActivity,
} from "@/lib/activityMaster";

/**
 * THE ACTIVITY MASTER over HTTP.
 *
 * Reading is open to anyone signed in — the customer page needs the mappings
 * to say "this counts toward Renewals" at logging time. Changing which goal an
 * activity feeds routes money, so writes are managers and admins, the same
 * line the performance route draws. Mock never accepts a write.
 */

export async function GET(req: NextRequest) {
  const scope = await verifiedRequestMemberScope(req);
  if (!scope) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const state = await readActivityMaster();
  return NextResponse.json({ state });
}

export async function POST(req: NextRequest) {
  const scope = await verifiedRequestMemberScope(req);
  if (!scope) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (getDataMode() === "mock") {
    return NextResponse.json(
      { error: "Sample data is read-only. Switch to Real mode to change the master." },
      { status: 403 }
    );
  }
  const me = await getCurrentUser();
  if (!isManagerOrAdmin(me.role)) {
    return NextResponse.json(
      { error: "Only managers and admins change the activity master." },
      { status: 403 }
    );
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  try {
    const op = String(body.op ?? "");
    const state =
      op === "update"
        ? await updateMasterActivity({
            id: String(body.id ?? ""),
            contribution:
              body.contribution === undefined
                ? undefined
                : String(body.contribution),
            goalIds: body.goalIds,
          })
        : op === "add"
          ? await addMasterActivity({
              label: String(body.label ?? ""),
              color: body.color ? String(body.color) : undefined,
              contribution:
                body.contribution === undefined
                  ? undefined
                  : String(body.contribution),
              goalIds: body.goalIds,
            })
          : op === "remove"
            ? await removeMasterActivity(String(body.id ?? ""))
            : null;
    if (!state) {
      return NextResponse.json({ error: "Unknown operation." }, { status: 400 });
    }
    return NextResponse.json({ state });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "That didn't save." },
      { status: 400 }
    );
  }
}
