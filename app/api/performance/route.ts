import { NextRequest, NextResponse } from "next/server";
import { verifiedRequestMemberScope } from "@/lib/memberScope";
import { getCurrentUser } from "@/lib/currentUser";
import { isManagerOrAdmin } from "@/lib/moduleAccess";
import { getDataMode } from "@/lib/dataMode";
import { listWorkspaceAccess } from "@/lib/accessStore";
import { readOpportunities, updateOpportunity } from "@/lib/opportunities";
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
  assignSubgoalToGroup,
  setRates,
  setGoalMilestones,
  unassignSubgoalFromGroup,
  unassignGoalFromGroup,
  updateGoal,
  updateSubgoal,
} from "@/lib/performance";
import {
  canVerifyEntry,
  visibleNamesFor,
  type GoalMeasure,
  type GoalUnit,
  type PerformanceState,
} from "@/lib/performanceShared";

export const dynamic = "force-dynamic";

// Imported for its global queue declaration and to share one line with every
// other performance writer.
import "@/lib/performanceQueue";
import { moduleWriteRefusal } from "@/lib/moduleAccessServer";


// THREE KINDS OF PEOPLE WALK IN (Suren, Aug 12): the org head sees everything,
// a group owner sees exactly their group ("Rukmini should not have access to
// other groups"), and an individual sees their own goals. Managers and admins
// keep the full plan; everyone else gets a SCOPED copy of the state and a
// short list of allowed operations. Mock mode never accepts writes.

/**
 * The names this caller may SEE. Org head → null (all).
 *
 * Suren's three tiers, restored (Anir, Aug 16: "if its whatever he said its
 * fine" — it was not). The rule above says a group owner "sees exactly their
 * group", but the code handed the whole workspace to anyone with the manager
 * role, collapsing the org-head tier and the group-owner tier into one. Only
 * the org head — admin — is the top tier; a manager is a group owner and sees
 * their own group, which is what visibleNamesFor already returns.
 *
 * This is about SEEING only. What a manager may DO is unchanged: shaping the
 * plan (goals, subgoals, targets, groups) still belongs to managers and
 * admins, and the goal catalog itself is never scoped, so a manager can still
 * run the plan they are responsible for.
 */
function callerScope(
  state: PerformanceState,
  meName: string,
  orgHead: boolean
): Set<string> | null {
  if (orgHead) return null;
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
    /* The FX table is workspace facts, not somebody's numbers — dropping it
       here made every scoped screen (and its CSV) count a converted entry as
       zero the moment a save responded (Aug 23 audit). */
    rates: state.rates,
  };
}

export async function GET(req: NextRequest) {
  const scope = await verifiedRequestMemberScope(req);
  if (!scope) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const me = await getCurrentUser();
  /* Sample mode stands the viewer in for a sample rep (see readPerformance),
     and this route has to agree with the server-rendered page — otherwise the
     first save would swap a state where the viewer carries nothing back over
     the one they were looking at. */
  const state = await readPerformance(
    getDataMode() === "live" ? undefined : me.name
  );
  /* MANAGERS SEE THE ORG, exactly as the page itself decides (found by the
     Aug 23 audit): app/performance/[tab]/page.tsx server-renders a manager
     the FULL state — "managers and admins see everything" — but this route
     scoped everyone below admin. So a manager's very first save answered
     with group-scoped data, setState swapped it in, and other people's
     numbers silently VANISHED from the Org screen until a reload. One rule,
     both doors, the page's rule. */
  const visible = callerScope(
    state,
    me.name,
    me.role === "admin" || me.role === "bd_owner"
  );
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
  /* WRITE IS ITS OWN PERMISSION (Suren, Aug 29). Refuses before the
     handler reads a body, so a person who may READ this module cannot
     change it. Falls through to the old role rules while the privilege
     table is not being enforced. */
  {
    const refusal = await moduleWriteRefusal("/performance");
    if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });
  }

  const scope = await verifiedRequestMemberScope(req);
  if (!scope) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  /**
   * MOCK IS WRITABLE, and it always should have been.
   *
   * Anir, Aug 26: "all the same functionality (add, edit etc.) should be on
   * mock mode, but it shouldn't affect real data." Sep 2, again: "i should
   * still be able to add edit and delete shit if i really want."
   *
   * What stood here refused EVERY write the moment the session was in Mock, so
   * adding a goal, editing a target, assigning one, logging a result against it
   * and deleting it all answered "Mock mode shows sample goals only". It made
   * sense while it lasted: mock reads were a freshly computed sample and the
   * mock row was never read back, so a write really would have gone nowhere
   * and told the person it had worked. readPerformance seeds and reads that row
   * now, so a mock write lands and shows up, exactly as Revenue Accruals has
   * behaved since Aug 26.
   *
   * NOTHING ABOUT WHO MAY WRITE CHANGES. moduleWriteRefusal above and the
   * manager rules below are untouched, and every write still goes to
   * `performance-management:mock` — a different row from the live plan, which
   * is what makes this safe rather than merely convenient. The rest of this
   * route was already built for it: assertRealPerson below deliberately
   * returns early outside live mode.
   */
  const me = await getCurrentUser();
  const manager = isManagerOrAdmin(me.role);
  /* `?? {}` as well as the catch: a body of literally `null` PARSES fine, so
     the catch never fires and the first property read threw a 500 while every
     other malformed body returned a clean 400 (found by the Aug 22 fuzz). */
  const body = (await req.json().catch(() => ({}))) ?? {};
  const op = String(body.op ?? "");

  /**
   * A GOAL CANNOT BE GIVEN TO SOMEBODY WHO DOES NOT WORK HERE (found testing,
   * Aug 19: assigning "Nobody McGhost" was accepted).
   *
   * The pickers only ever offer real colleagues, so this never happened
   * through the UI — but the server took any string, and a typo'd or stale
   * name became a phantom assignee: someone who can never log in, never log a
   * result, never be verified, and whose unverified row holds the group's
   * sign-off open forever.
   *
   * Checked against the workspace directory, plus the names already in the
   * plan so nothing that already exists is suddenly rejected.
   */
  const assertRealPerson = async (name: string) => {
    const clean = name.trim();
    if (!clean) throw new Error("Which person?");
    const workspace = process.env.FREYR_WORKSPACE_ID;
    if (getDataMode() !== "live" || !workspace) return;
    const directory = await listWorkspaceAccess(workspace).catch(() => null);
    if (!directory) return; // directory unreachable: do not block real work
    const known = new Set(
      directory.members
        .filter((m) => m.active)
        .map((m) => m.name.trim().toLowerCase())
    );
    const state = await readPerformance();
    for (const g of state.goals) {
      for (const a of g.assignments ?? []) known.add(a.person.trim().toLowerCase());
      for (const sub of g.subgoals)
        for (const p of sub.people) known.add(p.name.trim().toLowerCase());
    }
    for (const g of state.groups) {
      known.add(g.head.trim().toLowerCase());
      for (const m of g.members) known.add(m.trim().toLowerCase());
    }
    if (!known.has(clean.toLowerCase())) {
      throw new Error(`${clean} is not in this workspace.`);
    }
  };
  /** A non-fatal note for the toast, e.g. a member counted in two groups. */
  let warning: string | undefined;

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
      // A goal's OWNER may set its schedule without being a manager (Anir,
      // Aug 16: "I should be able to set the milestones... or whoever the
      // owner is"). The store checks ownership per goal and refuses anyone
      // else, so this cannot become a way to edit somebody else's plan.
      "set-goal-milestones",
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
      op === "remove-actual" ||
      /* No body.person on this op either (found by the Aug 23 audit): the
         person-gate below demanded one, so every non-manager was 403'd here
         before the store's own requireOwner check — which exists precisely
         to let a goal's OWNER set its schedule — could ever run. The store
         still refuses anyone who does not own the goal. */
      op === "set-goal-milestones" ||
      /* Same swallowed-gate shape (Aug 23 audit): a GOAL-level sign-off names
         no person, so this generic gate 403'd every non-manager group head
         before set-verified's OWN block below — which already implements the
         real rule ("where it does not name a person, the caller must at
         least head a group that carries the goal") — could run. For a named
         person that block asks canVerifyEntry, which is stricter than the
         visibility test here, so nothing widens. */
      op === "set-verified";
    if (!entryOps && (!person || !visible.has(person.trim()))) {
      return NextResponse.json(
        { error: "You can only do that for yourself or people in your group." },
        { status: 403 }
      );
    }
    if (op === "set-verified") {
      /**
       * Verifying is a leadership act: a group head signs off THEIR OWN
       * people, never themself acting as their own referee.
       *
       * This used to ask only whether the caller heads SOME group, which let
       * the head of one team sign off a claim belonging to another team
       * entirely. Where the request names a person, ask the same question the
       * per-claim path asks: may I verify THIS person. Where it does not, the
       * caller must at least head a group that carries the goal.
       */
      const target = person.trim();
      const allowed = target
        ? canVerifyEntry(state, me.name, target)
        : state.groups.some(
            (g) => g.head.trim().toLowerCase() === me.name.trim().toLowerCase()
          );
      if (!allowed) {
        return NextResponse.json(
          { error: "Only the group owner for this person can verify their numbers." },
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
  // The queue itself now lives in lib/performanceQueue so the opportunities
  // route's goal-met writes stand in the SAME line — it used to walk past
  // this file's local queue entirely (Aug 23 audit).
  const previousWrite =
    globalThis.__FREYR_PERFORMANCE_WRITE_QUEUE__ ?? Promise.resolve();
  let releaseWrite: () => void = () => undefined;
  globalThis.__FREYR_PERFORMANCE_WRITE_QUEUE__ = new Promise<void>((resolve) => {
    releaseWrite = resolve;
  });
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
      case "remove-goal": {
        /**
         * A DELETED GOAL LEAVES NOTHING POINTING AT IT. Its results already
         * went with it; the deals that fed it did not, so a goal row on an
         * opportunity was left reading "Pick a goal…" beside a live value,
         * looking like an unfinished entry with no sign the goal had gone.
         */
        const goneId = String(body.goalId ?? "");
        await removeGoal(goneId);
        try {
          const opps = await readOpportunities();
          for (const deal of opps.opportunities) {
            const links = deal.goalLinks ?? [];
            const keptLinks = links.filter((l) => l.goalId !== goneId);
            const keptIds = (deal.goalIds ?? []).filter((id) => id !== goneId);
            if (
              keptLinks.length !== links.length ||
              keptIds.length !== (deal.goalIds ?? []).length
            ) {
              await updateOpportunity(deal.id, {
                goalIds: keptIds,
                goalLinks: keptLinks,
              });
            }
          }
        } catch (error) {
          console.error("[performance] goal-link cleanup failed:", error);
        }
        break;
      }
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
          by: me.name,
        });
        break;
      case "assign-goal":
        await assertRealPerson(String(body.person ?? ""));
        await assignGoal({
          goalId: String(body.goalId ?? ""),
          person: String(body.person ?? ""),
          ...(body.target !== undefined ? { target: Number(body.target) } : {}),
          addedBy: me.name,
        });
        break;
      case "assign-goal-group": {
        const res = await assignGoalToGroup({
          goalId: String(body.goalId ?? ""),
          groupId: String(body.groupId ?? ""),
          ...(body.target !== undefined ? { target: Number(body.target) } : {}),
          addedBy: me.name,
        });
        warning = res.warning;
        break;
      }
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
      case "set-goal-milestones":
        await setGoalMilestones({
          ...(manager ? {} : { requireOwner: me.name }),
          goalId: String(body.goalId ?? ""),
          milestones: Array.isArray(body.milestones)
            ? (body.milestones as unknown[]).map((m) => {
                const r = (m ?? {}) as Record<string, unknown>;
                return { date: String(r.date ?? ""), amount: Number(r.amount ?? 0) };
              })
            : [],
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
        /* THE SAME QUESTION assign-goal ASKS. The Aug 19 note above says a
           typo'd name becomes "a phantom assignee: someone who can never log
           in, never log a result, never be verified" — but only assign-goal
           was made to ask it, and this op is the one that carries a NUMBER.
           Proved it on Sep 1 with the very name from that note: assign-goal
           refused "Nobody McGhost", log-actual booked 77,000 against them and
           it landed in the totals.
           unassign-goal and set-verified stay unchecked on purpose — both act
           on a row that already exists, and one of them is how you clear a
           phantom out. */
        await assertRealPerson(String(body.person ?? ""));
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
          opportunityId: body.opportunityId
            ? String(body.opportunityId)
            : undefined,
          activityId: body.activityId ? String(body.activityId) : undefined,
          dealLabel: body.dealLabel ? String(body.dealLabel) : undefined,
          evidence: Array.isArray(body.evidence) ? body.evidence : undefined,
          currency: body.currency ? String(body.currency) : undefined,
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
          opportunityId: body.opportunityId
            ? String(body.opportunityId)
            : undefined,
          dealLabel:
            body.dealLabel === undefined ? undefined : String(body.dealLabel ?? ""),
          evidence: Array.isArray(body.evidence)
            ? (body.evidence as { name?: unknown; url?: unknown }[]).map((e) => ({
                name: String(e?.name ?? ""),
                url: String(e?.url ?? ""),
              }))
            : undefined,
          by: me.name,
        });
        break;
      case "assign-subgoal-group":
        await assignSubgoalToGroup({
          goalId: String(body.goalId ?? ""),
          subgoalId: String(body.subgoalId ?? ""),
          groupId: String(body.groupId ?? ""),
          target:
            body.target === undefined || body.target === null
              ? undefined
              : Number(body.target),
          addedBy: me.name,
        });
        break;
      case "unassign-subgoal-group":
        await unassignSubgoalFromGroup({
          goalId: String(body.goalId ?? ""),
          subgoalId: String(body.subgoalId ?? ""),
          groupId: String(body.groupId ?? ""),
        });
        break;
      case "set-rates":
        await setRates({
          rates:
            body.rates && typeof body.rates === "object"
              ? (body.rates as Record<string, unknown>)
              : {},
        });
        break;
      case "remove-actual":
        await removeActual(String(body.actualId ?? ""), me.name);
        break;
      case "add-group":
        await addGroup({
          name: String(body.name ?? ""),
          head: String(body.head ?? ""),
          members: Array.isArray(body.members) ? body.members.map(String) : [],
          addedBy: me.name,
          ...(body.groupType !== undefined
            ? { groupType: String(body.groupType) }
            : {}),
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
          ...(body.groupType !== undefined
            ? { groupType: String(body.groupType) }
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
  // Same rule as GET: the page grants a manager the org view, so the save
  // response must not quietly narrow it (Aug 23 audit).
  const visible = callerScope(
    state,
    me.name,
    me.role === "admin" || me.role === "bd_owner"
  );
  return NextResponse.json({
    ok: true,
    ...(warning ? { warning } : {}),
    state: visible ? scopeState(state, visible) : state,
  });
}
