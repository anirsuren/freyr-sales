import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { nextBestActions, focusActions, DRAFTABLE } from "@/lib/agent";
import { buildDeals, ROTTING_DAYS, formatMoney } from "@/lib/pipeline";
import { accountHealth } from "@/lib/health";

export const dynamic = "force-dynamic";

// Lightweight, deterministic snapshot of what's on the rep's plate — used by the
// agent's empty state to greet them proactively. No LLM call (no credits).
export async function GET() {
  const db = getDb();
  const [sessions, customers, contacts, interactions, prefs] = await Promise.all([
    db.pitchSessions.list(),
    db.customers.list(),
    db.contacts.list(),
    db.interactions.list(),
    db.agentPrefs.get(),
  ]);
  const deals = buildDeals(sessions, customers, contacts, interactions);
  const open = deals.filter((d) => d.stage !== "Closed Lost");
  const openValue = open.reduce((s, d) => s + d.value, 0);
  const cooling = open.filter((d) => d.staleDays > ROTTING_DAYS).length;
  const { actions } = focusActions(
    nextBestActions({ sessions, customers, contacts, interactions }),
    customers,
    prefs
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
