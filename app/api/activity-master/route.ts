import { NextRequest, NextResponse } from "next/server";
import { verifiedRequestMemberScope } from "@/lib/memberScope";
import { getCurrentUser } from "@/lib/currentUser";
import { visiblePeople } from "@/lib/performanceShared";
import { getDataMode } from "@/lib/dataMode";
import {
  addMasterActivity,
  readActivityMaster,
  removeMasterActivity,
  updateMasterActivity,
} from "@/lib/activityMaster";
import { readPerformance } from "@/lib/performance";

/**
 * THE ACTIVITY MASTER over HTTP.
 *
 * Reading is open to anyone signed in — the customer page needs the mappings
 * to say "this counts toward Renewals" at logging time. Changing which goal an
 * activity feeds routes money, so writes are ADMINS ONLY (Suren, Aug 17
 * answers: "should only admins be able to change the activity master —
 * yes exactly"). Mock never accepts a write.
 */

export async function GET(req: NextRequest) {
  const scope = await verifiedRequestMemberScope(req);
  if (!scope) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const state = await readActivityMaster();
  // The goals ride along, light, so the customer page can SAY which goal an
  // activity feeds ("this counts toward Renewals") without pulling the whole
  // performance store. And who is asking, because the credit for an activity
  // goes to whoever logs it (Suren: "that guy adds an activity, then against
  // his name that goal goes").
  const me = await getCurrentUser();
  const perf = await readPerformance().catch(() => null);
  // Who this person may log credit FOR (Suren, Aug 17 answers: "only the
  // admin guys and the group owners can do it — otherwise the individual
  // only"). visiblePeople already draws that exact line: admin = everyone,
  // group head = their group, everyone else = just themself.
  const people = perf
    ? visiblePeople(perf, me.name, me.role)
    : [me.name];
  return NextResponse.json({
    state,
    goals: (perf?.goals ?? []).map((g) => ({
      id: g.id,
      name: g.name,
      unit: g.unit,
      year: g.year,
      type: g.type,
    })),
    me: { name: me.name, role: me.role },
    people,
  });
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
  if (me.role !== "admin") {
    return NextResponse.json(
      { error: "Only admins change the activity master." },
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
            countsFrom:
              body.countsFrom === undefined ? undefined : String(body.countsFrom),
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
              countsFrom:
                body.countsFrom === undefined ? undefined : String(body.countsFrom),
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
