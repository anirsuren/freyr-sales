import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { nextBestActions, DRAFTABLE, focusActions } from "@/lib/agent";

export const dynamic = "force-dynamic";

// Agent inbox (V9) — the unified queue of everything the agent has surfaced,
// split into what NEEDS the rep's approval (compliance approve / ready-to-send)
// vs. what the agent can HANDLE itself (draftable re-engage / stabilize /
// follow-up). Powers the inbox page and the sidebar badge. Mock-first.
export async function GET() {
  const db = getDb();
  const [sessions, customers, contacts, interactions, prefs] = await Promise.all([
    db.pitchSessions.list(),
    db.customers.list(),
    db.contacts.list(),
    db.interactions.list(),
    db.agentPrefs.get(),
  ]);
  const { actions } = focusActions(
    nextBestActions({ sessions, customers, contacts, interactions }),
    customers,
    prefs
  );
  const needsApproval = actions.filter((a) => !DRAFTABLE.includes(a.kind));
  const canHandle = actions.filter((a) => DRAFTABLE.includes(a.kind));
  // Pitches sent back for changes also need the rep — surface them too (#69).
  const reworks = sessions.filter(
    (s) => s.review_status === "changes_requested"
  ).length;

  return NextResponse.json({
    needsApproval: needsApproval.length,
    canHandle: canHandle.length,
    reworks,
    needsApprovalItems: needsApproval,
    canHandleItems: canHandle,
  });
}
