import { agentPipelineSummary } from "./agentPipelineSummary";
import { getDataMode } from "./dataMode";
import "server-only";
import { getDb } from "./db";
import { canOpenModule } from "./moduleAccessServer";
import { readOpportunities } from "./opportunities";
import { buildDeals, dealsFromOpportunities, formatMoney } from "./pipeline";
import { accountHealth } from "./health";
import type { AccountContext } from "./agent";

/** Account facts are read after the route's Customers permission gate. A client
 * can select an account, but cannot supply its owner, financials or identity. */
export async function readAgentAccountContext(
  customerId: string,
): Promise<AccountContext | null> {
  const db = getDb();
  const customer = await db.customers.get(customerId);
  if (!customer) return null;
  const [contacts, interactions, sessions, canReadOpportunities] =
    await Promise.all([
      canOpenModule("/contacts").then((allowed) =>
        allowed ? db.contacts.list(customerId) : [],
      ),
      db.interactions.list(customerId),
      canOpenModule("/sessions").then((allowed) =>
        allowed ? db.pitchSessions.list(customerId) : [],
      ),
      canOpenModule("/opportunities"),
    ]);
  const opportunities = canReadOpportunities
    ? (await readOpportunities()).opportunities.filter(
        (item) => item.customerId === customerId,
      )
    : [];
  const deals = [
    ...buildDeals(sessions, [customer], contacts, interactions),
    ...dealsFromOpportunities(opportunities, [customer]),
  ];
  const open = deals.filter((deal) => deal.stage !== "Closed Lost");
  const health = accountHealth({
    interactions,
    deals,
    contactCount: contacts.length,
  });
  const latest = [...interactions].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  )[0];
  const liveSummary = getDataMode() === "live" ? agentPipelineSummary(opportunities) : null;
  return {
    company: customer.company_name,
    healthLabel: health.label,
    healthScore: health.score,
    openValue: liveSummary ? liveSummary.openValueLabel : formatMoney(open.reduce((sum, deal) => sum + deal.value, 0)),
    dealCount: liveSummary ? liveSummary.openCount : open.length,
    contactCount: contacts.length,
    topContact: contacts[0]?.full_name,
    lastActivity: latest?.created_at,
    owner: customer.owner,
    competitor: customer.competitor,
  };
}
