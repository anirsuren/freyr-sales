import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { nextBestActions, focusActions, DRAFTABLE } from "@/lib/agent";
import {
  buildDeals,
  dealsFromOpportunities,
  ROTTING_DAYS,
  formatMoney,
} from "@/lib/pipeline";
import { readOpportunities } from "@/lib/opportunities";
import { accountHealth } from "@/lib/health";
import { authenticatedRequestActorName } from "@/lib/requestPrincipal";
import { verifiedRequestMemberScope } from "@/lib/memberScope";

export const dynamic = "force-dynamic";

// Lightweight, deterministic snapshot of what's on the rep's plate — used by the
// agent's empty state to greet them proactively. No LLM call (no credits).
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
  const [sessions, customers, contacts, interactions, prefs, oppState] =
    await Promise.all([
      db.pitchSessions.list(),
      db.customers.list(),
      db.contacts.list(),
      db.interactions.list(),
      db.agentPrefs.get(scope),
      readOpportunities(),
    ]);
  const opportunities = oppState.opportunities;
  /* BOTH PIPELINES, because the workspace decides which one has anything in
     it. Mock is pitch sessions; Real is opportunities and has no sessions at
     all — which is why this endpoint answered "$0 open, 0 deals" over a
     $112.0M book until Sep 4. */
  const deals = [
    ...buildDeals(sessions, customers, contacts, interactions),
    ...dealsFromOpportunities(opportunities, customers),
  ];
  const open = deals.filter((d) => d.stage !== "Closed Lost");
  const openValue = open.reduce((s, d) => s + d.value, 0);
  const cooling = open.filter((d) => d.staleDays > ROTTING_DAYS).length;
  const { actions } = focusActions(
    nextBestActions({ sessions, customers, contacts, interactions, opportunities }),
    customers,
    prefs,
    actorName,
    scope.userId
  );
  const needsApproval = actions.filter((a) => !DRAFTABLE.includes(a.kind)).length;
  const atRisk = customers.filter(
    (c) =>
      accountHealth({
        interactions: interactions.filter((i) => i.customer_id === c.id),
        deals: deals.filter((d) => d.customerId === c.id),
        contactCount: contacts.filter((x) => x.customer_id === c.id).length,
      }).band === "at_risk"
  ).length;

  return NextResponse.json({
    ok: true,
    needsApproval,
    cooling,
    atRisk,
    openValue,
    openValueLabel: formatMoney(openValue),
    openCount: open.length,
  });
}
