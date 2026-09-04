import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { notifyTelegram } from "@/lib/telegram";
import { buildWeeklyReview } from "@/lib/agent";
import { narrateReview } from "@/lib/claude";
import { buildDeals, dealsFromOpportunities, formatMoney } from "@/lib/pipeline";
import { readOpportunities } from "@/lib/opportunities";
import { accountHealth } from "@/lib/health";
import { canManageReviewQueue } from "@/lib/role";
import { rejectRealModeAgentMutation } from "@/lib/agentMutationPolicy";

export const dynamic = "force-dynamic";

// Share the weekly review (V9 #43) — sends the rollup up the chain via the
// configured channel (Telegram/email, mock when no key). Print/PDF is handled
// client-side; this is the "email it" path.
export async function POST() {
  if (!(await canManageReviewQueue())) {
    return NextResponse.json(
      { error: "Manager access is required to share the workspace review." },
      { status: 403 }
    );
  }
  const denied = rejectRealModeAgentMutation();
  if (denied) return denied;
  const db = getDb();
  const [sessions, customers, contacts, interactions, runs] = await Promise.all([
    db.pitchSessions.list(),
    db.customers.list(),
    db.contacts.list(),
    db.interactions.list(),
    db.agentRuns.list(),
  ]);
  const opportunities = (await readOpportunities()).opportunities;
  /* BOTH PIPELINES: Mock is pitch sessions, Real is opportunities and has no
     sessions at all. Reading only the former is what made the agent answer
     "$0 open" over a $112.0M book. */
  const deals = [
    ...buildDeals(sessions, customers, contacts, interactions),
    ...dealsFromOpportunities(opportunities, customers),
  ];
  const atRisk = customers.filter(
    (c) =>
      accountHealth({
        interactions: interactions.filter((i) => i.customer_id === c.id),
        deals: deals.filter((d) => d.customerId === c.id),
        contactCount: contacts.filter((x) => x.customer_id === c.id).length,
      }).band === "at_risk"
  ).length;

  const review = buildWeeklyReview({ runs, deals, atRisk });
  const openMoney = formatMoney(review.openAtStake);
  const line =
    (await narrateReview(review, openMoney)) ||
    `${review.runsThisWeek} agent action(s); ${review.cooling} cooling, ${review.atRisk} at-risk; ${openMoney} open at stake.`;

  notifyTelegram(
    `🗂️ <b>Weekly review</b>\n${line}\n` +
      `Top at stake: ${review.topDeals
        .slice(0, 3)
        .map((d) => `${d.company} (${formatMoney(d.value)})`)
        .join(", ")}`
  );
  return NextResponse.json({ ok: true });
}
