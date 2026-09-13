import { agentPipelineSummary } from "@/lib/agentPipelineSummary";
import { getDataMode } from "@/lib/dataMode";
import { canOpenModule } from "@/lib/moduleAccessServer";
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
import { readRecordTeams, teamFor } from "@/lib/recordTeams";

export const dynamic = "force-dynamic";

// Lightweight, deterministic snapshot of what's on the rep's plate — used by the
// agent's empty state to greet them proactively. No LLM call (no credits).
export async function GET(request: NextRequest) {
  const scope = await verifiedRequestMemberScope(request);
  if (!scope) {
    return NextResponse.json(
      { error: "Verified workspace access required." },
      { status: 403 },
    );
  }
  if (!(await canOpenModule("/customers"))) {
    return NextResponse.json(
      { error: "Customers are not available on this account." },
      { status: 403 },
    );
  }
  const actorName = await authenticatedRequestActorName(request);
  const db = getDb();
  const [allSessions, allCustomers, allContacts, allInteractions, prefs, oppState, teams] =
    await Promise.all([
      canOpenModule("/sessions").then((allowed) =>
        allowed ? db.pitchSessions.list() : [],
      ),
      db.customers.list(),
      canOpenModule("/contacts").then((allowed) =>
        allowed ? db.contacts.list() : [],
      ),
      db.interactions.list(),
      db.agentPrefs.get(scope),
      canOpenModule("/opportunities").then((allowed) =>
        allowed ? readOpportunities() : { opportunities: [] },
      ),
      readRecordTeams(),
    ]);
  const mine = (name: string | null | undefined) => Boolean(name) && name!.trim().toLowerCase() === actorName.trim().toLowerCase();
  const opportunities = oppState.opportunities.filter(o => mine(o.owner));
  const customers = allCustomers.filter(c => {
    const team = teamFor(teams, "customer", c.id);
    const owned = team?.owner ? mine(team.owner) : c.owner_user_id ? c.owner_user_id === scope.userId : mine(c.owner);
    return owned || (team?.members ?? []).some(mine);
  });
  const customerIds = new Set(customers.map(c => c.id));
  const sessions = allSessions.filter(s => customerIds.has(s.customer_id));
  const contacts = allContacts.filter(c => customerIds.has(c.customer_id));
  const interactions = allInteractions.filter(i => customerIds.has(i.customer_id));
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
    nextBestActions({
      sessions,
      customers,
      contacts,
      interactions,
      opportunities,
    }),
    customers,
    prefs,
    actorName,
    scope.userId,
  );
  const needsApproval = actions.filter(
    (a) => !DRAFTABLE.includes(a.kind),
  ).length;
  const atRisk = customers.filter(
    (c) =>
      accountHealth({
        interactions: interactions.filter((i) => i.customer_id === c.id),
        deals: deals.filter((d) => d.customerId === c.id),
        contactCount: contacts.filter((x) => x.customer_id === c.id).length,
      }).band === "at_risk",
  ).length;

  const liveSummary = getDataMode() === "live" ? agentPipelineSummary(opportunities) : null;
  return NextResponse.json({
    ok: true,
    needsApproval,
    cooling,
    atRisk,
    openValue: liveSummary ? liveSummary.openValue : openValue,
    openValueLabel: liveSummary ? liveSummary.openValueLabel : formatMoney(openValue),
    openCount: liveSummary ? liveSummary.openCount : open.length,
  });
}
