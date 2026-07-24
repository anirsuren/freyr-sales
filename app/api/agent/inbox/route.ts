import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { nextBestActions, DRAFTABLE, focusActions } from "@/lib/agent";
import { authenticatedRequestActorName } from "@/lib/requestPrincipal";
import { verifiedRequestMemberScope } from "@/lib/memberScope";

export const dynamic = "force-dynamic";

// Agent inbox (V9) — the unified queue of everything the agent has surfaced,
// split into what NEEDS the rep's approval (compliance approve / ready-to-send)
// vs. what the agent can HANDLE itself (draftable re-engage / stabilize /
// follow-up). Powers the inbox page and the sidebar badge. Mock-first.
export async function GET(request: NextRequest) {
  const scope = await verifiedRequestMemberScope(request);
  if (!scope) {
    return NextResponse.json(
      { error: "Verified workspace access required." },
      { status: 403 }
    );
  }
  const actorName = await authenticatedRequestActorName(request);
  const db = getDb();
  const [sessions, customers, contacts, interactions, prefs] = await Promise.all([
    db.pitchSessions.list(),
    db.customers.list(),
    db.contacts.list(),
    db.interactions.list(),
    db.agentPrefs.get(scope),
  ]);
  const { actions } = focusActions(
    nextBestActions({ sessions, customers, contacts, interactions }),
    customers,
    prefs,
    actorName,
    scope.userId
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
