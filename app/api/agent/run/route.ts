import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { notifyTelegram } from "@/lib/telegram";
import { playRunSteps } from "@/lib/agent";

export const dynamic = "force-dynamic";

// Records a completed agent run (V7 #3). Called only after the human approves
// the compliance gate, so it's the transparent log of an end-to-end play:
// research → match → draft → approved → sent. Mock-first; with ANTHROPIC_API_KEY
// the steps would be real LLM calls.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const customerId = String(body.customerId || "");
  const subject = body.subject ? String(body.subject).slice(0, 200) : "";
  const edited = !!body.edited;
  const db = getDb();
  const customer = await db.customers.get(customerId);
  if (!customer) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }
  // What actually went out — the approved (possibly rep-edited) subject.
  const sentLine = subject
    ? `sent “${subject}”${edited ? " (you edited it)" : ""} after approval`
    : "researched, matched services, drafted, and sent after approval";
  const contacts = await db.contacts.list(customerId);
  const contactId = contacts[0]?.id;
  if (contactId) {
    await db.interactions.create({
      pitch_session_id: null,
      customer_id: customerId,
      contact_id: contactId,
      outcome: "in_progress",
      notes: `🤖 Agent ran a full outreach play for ${customer.company_name} — ${sentLine}`,
      follow_up_date: null,
      logged_by: "Freyr Agent",
    });
  }

  await db.agentRuns.create({
    kind: "play",
    title: `Ran a full outreach play for ${customer.company_name}`,
    customer_id: customerId,
    company: customer.company_name,
    outcome: "sent",
    summary: subject
      ? `Sent “${subject}”${edited ? " (rep-edited)" : ""} after approval.`
      : "Researched, matched services, drafted, and sent after approval.",
    steps: playRunSteps(customer.company_name),
  });

  notifyTelegram(
    `🤖 <b>Agent play complete</b>\n${customer.company_name} — sent after approval`
  );
  return NextResponse.json({ ok: true });
}
