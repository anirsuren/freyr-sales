import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { notifyTelegram } from "@/lib/telegram";
import {
  nextBestActions,
  DRAFTABLE,
  autopilotRunSteps,
  openValueByAccount,
} from "@/lib/agent";
import { ownerFor, CURRENT_REP, buildDeals } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

// Autopilot (V7 #5). The agent works the whole queue in one pass: it handles
// every draftable action (re-engage / stabilize / follow-up) by logging the
// prepared step to the timeline, and ESCALATES human-gated actions
// (approve / send) instead of acting on them. Returns a transparent report.
export async function POST() {
  const db = getDb();
  const [sessions, customers, contacts, interactions, prefs] = await Promise.all([
    db.pitchSessions.list(),
    db.customers.list(),
    db.contacts.list(),
    db.interactions.list(),
    db.agentPrefs.get(),
  ]);
  const custById = Object.fromEntries(customers.map((c) => [c.id, c]));
  // Respect the rep's pinned preferences (V9 #25/#27): focus industry, "my
  // accounts only", and which kinds autopilot may auto-handle. Out-of-scope
  // actions are escalated, not dropped.
  const allowKind = (kind: string) => {
    if (kind === "reengage") return prefs?.autopilot_reengage !== false;
    if (kind === "stabilize") return prefs?.autopilot_stabilize !== false;
    return true; // followup is always safe to auto-handle
  };
  const inFocus = (customerId: string) => {
    const c = custById[customerId];
    if (prefs?.focus_industry && c?.industry !== prefs.focus_industry) return false;
    if (prefs?.only_mine && ownerFor(c) !== CURRENT_REP) return false;
    return true;
  };
  // High-value guardrail (#75): escalate (never auto-handle) draftable actions on
  // accounts whose open pipeline exceeds the rep's ceiling.
  const ceiling = prefs?.autopilot_max_value ?? null;
  const openVal = openValueByAccount(
    buildDeals(sessions, customers, contacts, interactions)
  );
  const overCeiling = (customerId: string) =>
    ceiling != null && (openVal.get(customerId) || 0) > ceiling;

  const actions = nextBestActions({ sessions, customers, contacts, interactions });

  const handled: string[] = [];
  const escalated: string[] = [];
  const interactionIds: string[] = [];
  // How many would-be auto-handles the value ceiling held back (#76).
  let heldForValue = 0;

  for (const a of actions) {
    // not draftable, off-focus, a disallowed kind, or above the value ceiling → escalate
    if (
      !DRAFTABLE.includes(a.kind) ||
      !inFocus(a.customerId) ||
      !allowKind(a.kind) ||
      overCeiling(a.customerId)
    ) {
      // Held *solely* by the value ceiling (otherwise it would have auto-handled).
      if (
        DRAFTABLE.includes(a.kind) &&
        inFocus(a.customerId) &&
        allowKind(a.kind) &&
        overCeiling(a.customerId)
      ) {
        heldForValue++;
      }
      escalated.push(a.title);
      continue;
    }
    const accountContacts = contacts.filter((c) => c.customer_id === a.customerId);
    const cid = accountContacts[0]?.id;
    if (cid) {
      const logged = await db.interactions.create({
        pitch_session_id: null,
        customer_id: a.customerId,
        contact_id: cid,
        outcome: "in_progress",
        notes: `🤖 Autopilot: ${a.title}`,
        follow_up_date: null,
        logged_by: "Freyr Agent",
      });
      interactionIds.push(logged.id);
    }
    handled.push(a.title);
  }

  const summary = `Drafted ${handled.length} for you · ${escalated.length} waiting for your approval${
    heldForValue ? ` (${heldForValue} over your value ceiling)` : ""
  }.`;
  const steps = autopilotRunSteps(handled, escalated);
  let runId: string | null = null;
  if (handled.length || escalated.length) {
    const run = await db.agentRuns.create({
      kind: "autopilot",
      title: "Autopilot drafted your queue",
      customer_id: null,
      company: null,
      outcome: handled.length && escalated.length
        ? "mixed"
        : handled.length
        ? "handled"
        : "escalated",
      summary,
      steps,
      interaction_ids: interactionIds,
    });
    runId = run?.id || null;
  }

  notifyTelegram(
    `🤖 <b>Autopilot run</b>\nHandled ${handled.length} action(s); ${escalated.length} escalated for your approval.`
  );

  return NextResponse.json({
    ok: true,
    handled: handled.length,
    escalated: escalated.length,
    heldForValue,
    ceiling,
    handledItems: handled,
    escalatedItems: escalated,
    runId,
    title: "Drafted outreach for your cooling deals",
    summary,
    steps,
  });
}
