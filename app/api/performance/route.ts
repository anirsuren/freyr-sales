import { NextRequest, NextResponse } from "next/server";
import { verifiedRequestMemberScope } from "@/lib/memberScope";
import { getCurrentUser } from "@/lib/currentUser";
import { getDataMode } from "@/lib/dataMode";
import {
  addGoal,
  addGoalType,
  addGroup,
  addSubgoal,
  logActual,
  readPerformance,
  removeActual,
  removeGoal,
  removeGroup,
  removeSubgoal,
  setVerified,
  updateGoal,
  updateSubgoal,
} from "@/lib/performance";
import type { GoalMeasure, GoalUnit } from "@/lib/performanceShared";

export const dynamic = "force-dynamic";

// Performance management is everyone's mirror: anyone signed in reads it and
// logs their own numbers. Mock mode shows the sample workspace and never
// accepts writes.

export async function GET(req: NextRequest) {
  const scope = await verifiedRequestMemberScope(req);
  if (!scope) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const state = await readPerformance();
  return NextResponse.json({ state });
}

function unit(v: unknown): GoalUnit {
  return v === "currency" || v === "percent" ? v : "count";
}

function measure(v: unknown): GoalMeasure {
  return v === "level" ? "level" : "total";
}

export async function POST(req: NextRequest) {
  const scope = await verifiedRequestMemberScope(req);
  if (!scope) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (getDataMode() !== "live") {
    return NextResponse.json(
      { error: "Mock mode shows sample goals only. Switch to Real to change them." },
      { status: 400 }
    );
  }
  const me = await getCurrentUser();
  const body = await req.json().catch(() => ({}));
  const op = String(body.op ?? "");

  try {
    switch (op) {
      case "add-type":
        await addGoalType(String(body.name ?? ""));
        break;
      case "add-goal":
        await addGoal({
          name: String(body.name ?? ""),
          type: String(body.type ?? ""),
          unit: unit(body.unit),
          measure: measure(body.measure),
          year: Number(body.year) || new Date().getFullYear(),
          target: Number(body.target) || 0,
          pickedForOrg: body.pickedForOrg === true,
          addedBy: me.name,
        });
        break;
      case "update-goal":
        await updateGoal(String(body.goalId ?? ""), {
          ...(body.name !== undefined ? { name: String(body.name) } : {}),
          ...(body.type !== undefined ? { type: String(body.type) } : {}),
          ...(body.unit !== undefined ? { unit: unit(body.unit) } : {}),
          ...(body.measure !== undefined
            ? { measure: measure(body.measure) }
            : {}),
          ...(body.year !== undefined ? { year: Number(body.year) } : {}),
          ...(body.target !== undefined ? { target: Number(body.target) } : {}),
          ...(body.pickedForOrg !== undefined
            ? { pickedForOrg: body.pickedForOrg === true }
            : {}),
        });
        break;
      case "remove-goal":
        await removeGoal(String(body.goalId ?? ""));
        break;
      case "add-subgoal":
        await addSubgoal({
          goalId: String(body.goalId ?? ""),
          name: String(body.name ?? ""),
          target: Number(body.target) || 0,
          owners: Array.isArray(body.owners) ? body.owners.map(String) : [],
          people: Array.isArray(body.people)
            ? body.people.map((p: { name?: unknown; target?: unknown }) => ({
                name: String(p?.name ?? ""),
                target: Number(p?.target) || 0,
              }))
            : [],
        });
        break;
      case "update-subgoal":
        await updateSubgoal({
          goalId: String(body.goalId ?? ""),
          subgoalId: String(body.subgoalId ?? ""),
          ...(body.name !== undefined ? { name: String(body.name) } : {}),
          ...(body.target !== undefined ? { target: Number(body.target) } : {}),
          ...(body.owners !== undefined
            ? {
                owners: Array.isArray(body.owners)
                  ? body.owners.map(String)
                  : [],
              }
            : {}),
          ...(body.people !== undefined
            ? {
                people: Array.isArray(body.people)
                  ? body.people.map(
                      (p: {
                        name?: unknown;
                        target?: unknown;
                        verified?: unknown;
                      }) => ({
                        name: String(p?.name ?? ""),
                        target: Number(p?.target) || 0,
                        ...(p?.verified !== undefined
                          ? { verified: p.verified === true }
                          : {}),
                      })
                    )
                  : [],
              }
            : {}),
        });
        break;
      case "remove-subgoal":
        await removeSubgoal(
          String(body.goalId ?? ""),
          String(body.subgoalId ?? "")
        );
        break;
      case "set-verified":
        await setVerified({
          goalId: String(body.goalId ?? ""),
          subgoalId: body.subgoalId ? String(body.subgoalId) : undefined,
          person: body.person ? String(body.person) : undefined,
          verified: body.verified === true,
        });
        break;
      case "log-actual":
        await logActual({
          goalId: String(body.goalId ?? ""),
          subgoalId: body.subgoalId ? String(body.subgoalId) : null,
          person: String(body.person ?? ""),
          amount: Number(body.amount),
          date: body.date ? String(body.date) : undefined,
          note: body.note ? String(body.note) : undefined,
          addedBy: me.name,
        });
        break;
      case "remove-actual":
        await removeActual(String(body.actualId ?? ""));
        break;
      case "add-group":
        await addGroup({
          name: String(body.name ?? ""),
          head: String(body.head ?? ""),
          members: Array.isArray(body.members) ? body.members.map(String) : [],
          addedBy: me.name,
        });
        break;
      case "remove-group":
        await removeGroup(String(body.groupId ?? ""));
        break;
      default:
        return NextResponse.json({ error: "Unknown operation." }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "That didn't save." },
      { status: 400 }
    );
  }
  const state = await readPerformance();
  return NextResponse.json({ ok: true, state });
}
