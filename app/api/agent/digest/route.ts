import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { notifyTelegram } from "@/lib/telegram";
import { nextBestActions, buildDigest } from "@/lib/agent";
import { narrateDigest } from "@/lib/claude";

export const dynamic = "force-dynamic";

async function compute() {
  const db = getDb();
  const [sessions, customers, contacts, interactions, runs] = await Promise.all([
    db.pitchSessions.list(),
    db.customers.list(),
    db.contacts.list(),
    db.interactions.list(),
    db.agentRuns.list(),
  ]);
  const actions = nextBestActions({ sessions, customers, contacts, interactions });
  return buildDigest({ runs, actions });
}

// Agent digest (V9 #22). GET returns the briefing; POST "sends" it (Telegram /
// email channel, mock when no key) so the rep can get a daily standup from the
// agent: what it did, what needs them, what to watch.
export async function GET() {
  return NextResponse.json({ digest: await compute() });
}

export async function POST() {
  const d = await compute();
  const line = (await narrateDigest(d)) || d.didSummary;
  notifyTelegram(
    `🗞️ <b>Agent digest</b>\n${line}\n` +
      `Needs you: ${d.needsApproval} approval(s) · ${d.canHandle} I can handle.\n` +
      `Watch: ${d.cooling} cooling · ${d.atRisk} at-risk.`
  );
  return NextResponse.json({ ok: true });
}
