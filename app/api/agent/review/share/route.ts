import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { notifyTelegram } from "@/lib/telegram";
import { buildWeeklyReview } from "@/lib/agent";
import { narrateReview } from "@/lib/claude";
import { buildDeals, formatMoney } from "@/lib/pipeline";
import { accountHealth } from "@/lib/health";

export const dynamic = "force-dynamic";

// Share the weekly review (V9 #43) — sends the rollup up the chain via the
// configured channel (Telegram/email, mock when no key). Print/PDF is handled
// client-side; this is the "email it" path.
export async function POST() {
  const db = getDb();
  const [sessions, customers, contacts, interactions, runs] = await Promise.all([
    db.pitchSessions.list(),
    db.customers.list(),
    db.contacts.list(),
    db.interactions.list(),
    db.agentRuns.list(),
  ]);
  const deals = buildDeals(sessions, customers, contacts, interactions);
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
