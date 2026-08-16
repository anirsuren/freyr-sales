import { NextRequest, NextResponse } from "next/server";
import { verifiedRequestMemberScope } from "@/lib/memberScope";
import { getCurrentUser } from "@/lib/currentUser";
import { isManagerOrAdmin } from "@/lib/moduleAccess";
import { getDataMode } from "@/lib/dataMode";
import {
  addGoal,
  addGoalType,
  addGroup,
  addSubgoal,
  assignGoal,
  logActual,
  verifyActual,
  sendBackActual,
  readPerformance,
  removeActual,
  updateActual,
  removeGoal,
  removeGroup,
  updateGroup,
  removeSubgoal,
  setVerified,
  unassignGoal,
  assignGoalToGroup,
  setGroupGoalExclusion,
  unassignGoalFromGroup,
  updateGoal,
  updateSubgoal,
} from "@/lib/performance";
import {
  visibleNamesFor,
  type GoalMeasure,
  type GoalUnit,
  type PerformanceState,
} from "@/lib/performanceShared";

export const dynamic = "force-dynamic";

/**
 * The tail of the write queue (see the comment in POST). Hung on globalThis so
 * a dev-server hot reload of this module cannot hand two requests two separate
 * "empty" queues and put us straight back where we started.
 */
declare global {
  // eslint-disable-next-line no-var
  var __FREYR_PERFORMANCE_WRITE_QUEUE__: Promise<void> | undefined;
}
let performanceWriteQueue: Promise<void> =
  globalThis.__FREYR_PERFORMANCE_WRITE_QUEUE__ ?? Promise.resolve();

// THREE KINDS OF PEOPLE WALK IN (Suren, Aug 12): the org head sees everything,
// a group owner sees exactly their group ("Rukmini should not have access to
// other groups"), and an individual sees their own goals. Managers and admins
// keep the full plan; everyone else gets a SCOPED copy of the state and a
// short list of allowed operations. Mock mode never accepts writes.

/** The names this caller may see and act for. Managers/admins → null (all). */
function callerScope(
  state: PerformanceState,
  meName: string,
  manager: boolean
): Set<string> | null {
  if (manager) return null;
  return visibleNamesFor(state, meName);
}

/** A copy of the state with other people's numbers removed. The goal catalog
 *  itself stays whole — the Goal Master is how anyone picks up more goals. */
function scopeState(state: PerformanceState, visible: Set<string>): PerformanceState {
  const has = (name: string) => visible.has(name.trim());
  // The groups this caller may see at all; a group assignment is scoped the
  // same way its group is, so a rep never learns a goal was handed to a
  // department they are not in.
  const visibleGroups = state.groups.filter(
    (g) => has(g.head) || g.members.some((m) => has(m))
  );
  const visibleGroupIds = new Set(visibleGroups.map((g) => g.id));
  return {
    types: state.types,
    goals: state.goals.map((g) => ({
      ...g,
      subgoals: g.subgoals.map((s) => ({
        ...s,
        people: s.people.filter((p) => has(p.name)),
      })),
      assignments: (g.assignments ?? []).filter((a) => has(a.person)),
      groupAssignments: (g.groupAssignments ?? []).filter((a) =>
        visibleGroupIds.has(a.groupId)
      ),
    })),
    groups: visibleGroups,
    actuals: state.actuals.filter((a) => has(a.person)),
  };
}

export async function GET(req: NextRequest) {
  const scope = await verifiedRequestMemberScope(req);
  if (!scope) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const me = await getCurrentUser();
  const state = await readPerformance();
  const visible = callerScope(state, me.name, isManagerOrAdmin(me.role));
  return NextResponse.json({
    state: visible ? scopeState(state, visible) : state,
  });
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
  const manager = isManagerOrAdmin(me.role);
  const body = await req.json().catch(() => ({}));
  const op = String(body.op ?? "");

  // What a non-manager may do, and only inside their own circle: log their
  // numbers, pick up goals for themselves (a head, for their group), and a
  // head may verify their people. Everything that shapes the plan itself —
  // goals, subgoals, targets, groups — stays with managers and admins.
  if (!manager) {
    const SELF_OPS = new Set([
      "log-actual",
      "assign-goal",
      "unassign-goal",
      "set-verified",
      // Entry verification carries no body.person; the store itself checks
      // that the caller heads a group containing the entry's person.
      "verify-actual",
      "send-back-actual",
      // Your own claim is yours to fix or withdraw until somebody locks it
      // (Anir, Aug 15: "if I was the one who did this, I should be able to
      // delete it"). The store checks per entry that it is yours or that you
      // head the group of the person it belongs to, and refuses either once
      // the entry is verified.
      "update-actual",
      "remove-actual",
    ]);
    if (!SELF_OPS.has(op)) {
      return NextResponse.json(
        { error: "Only managers and admins can change the goal plan." },
        { status: 403 }
      );
    }
    const state = await readPerformance();
    const visible = visibleNamesFor(state, me.name);
    const person = String(body.person ?? "");
    const entryOps =
      op === "verify-actual" ||
      op === "send-back-actual" ||
      op === "update-actual" ||
      op === "remove-actual";
    if (!entryOps && (!person || !visible.has(person.trim()))) {
      return NextResponse.json(
        { error: "You can only do that for yourself or people in your group." },
        { status: 403 }
      );
    }
    if (op === "set-verified") {
      // Verifying is a leadership act: a group head signs off their people,
      // never themself alone acting as their own referee.
      const heads = state.groups.some(
        (g) => g.head.trim().toLowerCase() === me.name.trim().toLowerCase()
      );
      if (!heads) {
        return NextResponse.json(
          { error: "Only group owners, managers and admins verify numbers." },
          { status: 403 }
        );
      }
    }
  }

  // ONE WRITER AT A TIME. Every op below is read-modify-write over a single
  // catalog row: read the whole state, change one thing, write the whole state
  // back. Two people saving in the same moment both read the same "before",
  // and the second write erases the first — with a 200 and a success toast on
  // both screens. Measured: six simultaneous saves, six 200s, one survivor.
  //
  // Offerings already solved this with a promise queue in
  // commitOfferingsChange; this is the same idea at the one boundary every
  // performance write passes through, so the ops themselves stay untouched.
  const previousWrite = performanceWriteQueue;
  let releaseWrite: () => void = () => undefined;
  performanceWriteQueue = new Promise<void>((resolve) => {
    releaseWrite = resolve;
  });
  globalThis.__FREYR_PERFORMANCE_WRITE_QUEUE__ = performanceWriteQueue;
  await previousWrite.catch(() => undefined);

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
      case "assign-goal":
        await assignGoal({
          goalId: String(body.goalId ?? ""),
          person: String(body.person ?? ""),
          ...(body.target !== undefined ? { target: Number(body.target) } : {}),
          addedBy: me.name,
        });
        break;
      case "assign-goal-group":
        await assignGoalToGroup({
          goalId: String(body.goalId ?? ""),
          groupId: String(body.groupId ?? ""),
          ...(body.target !== undefined ? { target: Number(body.target) } : {}),
          addedBy: me.name,
        });
        break;
      case "set-group-goal-exclusion":
        await setGroupGoalExclusion({
          goalId: String(body.goalId ?? ""),
          groupId: String(body.groupId ?? ""),
          person: String(body.person ?? ""),
          excluded: body.excluded === true,
        });
        break;
      case "unassign-goal-group":
        await unassignGoalFromGroup({
          goalId: String(body.goalId ?? ""),
          groupId: String(body.groupId ?? ""),
        });
        break;
      case "unassign-goal":
        await unassignGoal({
          goalId: String(body.goalId ?? ""),
          person: String(body.person ?? ""),
        });
        break;
      case "verify-actual":
        await verifyActual({ actualId: String(body.actualId ?? ""), by: me.name });
        break;
      case "send-back-actual":
        await sendBackActual({
          actualId: String(body.actualId ?? ""),
          by: me.name,
          note: body.note ? String(body.note) : undefined,
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
          customer: body.customer ? String(body.customer) : undefined,
          customerId: body.customerId ? String(body.customerId) : undefined,
          dealId: body.dealId ? String(body.dealId) : undefined,
          dealLabel: body.dealLabel ? String(body.dealLabel) : undefined,
          evidence: Array.isArray(body.evidence) ? body.evidence : undefined,
          addedBy: me.name,
        });
        break;
      case "update-actual":
        await updateActual({
          actualId: String(body.actualId ?? ""),
          amount:
            body.amount === undefined || body.amount === null
              ? undefined
              : Number(body.amount),
          date: body.date ? String(body.date) : undefined,
          note: body.note === undefined ? undefined : String(body.note ?? ""),
          customer:
            body.customer === undefined ? undefined : String(body.customer ?? ""),
          customerId: body.customerId ? String(body.customerId) : undefined,
          dealId: body.dealId ? String(body.dealId) : undefined,
          dealLabel:
            body.dealLabel === undefined ? undefined : String(body.dealLabel ?? ""),
          by: me.name,
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
      case "update-group":
        await updateGroup({
          groupId: String(body.groupId ?? ""),
          ...(body.name !== undefined ? { name: String(body.name) } : {}),
          ...(body.head !== undefined ? { head: String(body.head) } : {}),
          ...(Array.isArray(body.members)
            ? { members: body.members.map(String) }
            : {}),
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
  } finally {
    releaseWrite();
  }
  const state = await readPerformance();
  const visible = callerScope(state, me.name, manager);
  return NextResponse.json({
    ok: true,
    state: visible ? scopeState(state, visible) : state,
  });
}
