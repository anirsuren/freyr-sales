import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { notifyTelegram } from "@/lib/telegram";
import {
  nextBestActions,
  DRAFTABLE,
  goalActionKinds,
  autopilotRunSteps,
  focusActions,
  openValueByAccount,
} from "@/lib/agent";
import { buildDeals } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

// Plan execution (V9). Closes the goal → plan → action loop: takes the goal the
// rep stated, scopes the agent's next-best-actions to that goal's intent, then
// works them — handling the safe (draftable) ones and escalating anything that
// needs human approval. Records a transparent "plan" run. Mock-first.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const goal = String(body.goal || "").trim();
  if (!goal) {
    return NextResponse.json({ error: "Missing goal" }, { status: 400 });
  }
  // Optional rep steer applied to every draft this run (#64). With a Claude key
  // this feeds the draft prompt; mock-first it's recorded on each logged entry.
  const instruction = String(body.instruction || "")
    .trim()
    .slice(0, 280);

  const db = getDb();
  const [sessions, customers, contacts, interactions, prefs] = await Promise.all([
    db.pitchSessions.list(),
    db.customers.list(),
    db.contacts.list(),
    db.interactions.list(),
    db.agentPrefs.get(),
  ]);

  const kinds = goalActionKinds(goal); // null = all kinds
  const { actions: focused } = focusActions(
    nextBestActions({ sessions, customers, contacts, interactions }),
    customers,
    prefs
  );
  const actions = focused.filter((a) => !kinds || kinds.includes(a.kind));

  // High-value guardrail (#75): an action can only be auto-handled if it's
  // draftable AND its account's open pipeline is under the rep's ceiling.
  const ceiling = prefs?.autopilot_max_value ?? null;
  const openVal = openValueByAccount(
    buildDeals(sessions, customers, contacts, interactions)
  );
  const canAutoHandle = (a: (typeof actions)[number]) =>
    DRAFTABLE.includes(a.kind) &&
    !(ceiling != null && (openVal.get(a.customerId) || 0) > ceiling);

  // Dry-run preview (#62): show exactly which accounts the agent will handle
  // automatically vs. escalate for approval — without mutating anything — so the
  // rep approves the plan with full visibility before it runs.
  if (body.preview) {
    const companyOf = new Map(customers.map((c) => [c.id, c.company_name]));
    const toItem = (a: (typeof actions)[number]) => ({
      id: a.id,
      title: a.title,
      company: companyOf.get(a.customerId) || "",
      customerId: a.customerId,
      href: a.href,
      kind: a.kind,
    });
    return NextResponse.json({
      ok: true,
      preview: true,
      willHandle: actions.filter(canAutoHandle).map(toItem),
      willEscalate: actions.filter((a) => !canAutoHandle(a)).map(toItem),
      // Draftable actions the value ceiling will hold for sign-off (#76).
      heldForValue: actions.filter(
        (a) => DRAFTABLE.includes(a.kind) && !canAutoHandle(a)
      ).length,
      ceiling,
    });
  }

  // Partial-plan execution (#63): if the rep deselected some draftable actions in
  // the preview, only handle the ones they kept. null = handle them all.
  const selectedIds: string[] | null = Array.isArray(body.selectedIds)
    ? body.selectedIds.map(String)
    : null;

  const handled: string[] = [];
  const escalated: string[] = [];
  const skipped: string[] = [];
  const interactionIds: string[] = [];

  for (const a of actions) {
    if (!canAutoHandle(a)) {
      escalated.push(a.title);
      continue;
    }
    if (selectedIds && !selectedIds.includes(a.id)) {
      skipped.push(a.title);
      continue;
    }
    const cid = contacts.find((c) => c.customer_id === a.customerId)?.id;
    if (cid) {
      const logged = await db.interactions.create({
        pitch_session_id: null,
        customer_id: a.customerId,
        contact_id: cid,
        outcome: "in_progress",
        notes: `🤖 Plan "${goal}": ${a.title}${
          instruction ? ` — steer: ${instruction}` : ""
        }`,
        follow_up_date: null,
        logged_by: "Freyr Agent",
      });
      interactionIds.push(logged.id);
    }
    handled.push(a.title);
  }

  // Nothing acted on (rep deselected everything, no escalations) — no run.
  if (handled.length === 0 && escalated.length === 0) {
    return NextResponse.json({
      ok: true,
      handled: 0,
      escalated: 0,
      skipped: skipped.length,
      handledItems: [],
      escalatedItems: [],
    });
  }

  const skipNote = skipped.length ? ` · ${skipped.length} skipped` : "";
  const steerNote = instruction ? ` Steer: "${instruction}".` : "";
  await db.agentRuns.create({
    kind: "plan",
    title: `Worked on: ${goal}`,
    customer_id: null,
    company: null,
    outcome:
      handled.length && escalated.length
        ? "mixed"
        : handled.length
        ? "handled"
        : "escalated",
    summary: `Drafted ${handled.length} for you · ${escalated.length} waiting for your approval${skipNote}.${steerNote}`,
    steps: autopilotRunSteps(handled, escalated),
    interaction_ids: interactionIds,
  });

  notifyTelegram(
    `🤖 <b>Plan executed</b>\n${goal} — handled ${handled.length}, escalated ${escalated.length}${skipNote}.`
  );

  return NextResponse.json({
    ok: true,
    handled: handled.length,
    escalated: escalated.length,
    skipped: skipped.length,
    heldForValue: actions.filter(
      (a) => DRAFTABLE.includes(a.kind) && !canAutoHandle(a)
    ).length,
    ceiling,
    handledItems: handled,
    escalatedItems: escalated,
  });
}
