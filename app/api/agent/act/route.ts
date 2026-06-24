import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { notifyTelegram } from "@/lib/telegram";
import { actRunSteps } from "@/lib/agent";

export const dynamic = "force-dynamic";

// "Let the agent handle it" (V7 #4). The agent prepares the next step for a
// draftable action and logs it to the account timeline + Activity, so the work
// is transparent. Mock-first; with ANTHROPIC_API_KEY this is where the LLM
// would generate the actual draft.
const VERB: Record<string, string> = {
  reengage: "drafted a re-engagement email",
  stabilize: "prepared a recovery plan",
  followup: "queued the scheduled follow-up",
};

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const kind = String(body.kind || "");
  const customerId = String(body.customerId || "");
  const verb = VERB[kind];
  if (!verb || !customerId) {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const db = getDb();
  const customer = await db.customers.get(customerId);
  if (!customer) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }
  const contacts = await db.contacts.list(customerId);
  const contactId = body.contactId || contacts[0]?.id;
  if (!contactId) {
    return NextResponse.json({ ok: true, logged: false });
  }

  const logged = await db.interactions.create({
    pitch_session_id: body.sessionId || null,
    customer_id: customerId,
    contact_id: contactId,
    outcome: "in_progress",
    notes: `🤖 Agent ${verb} for ${customer.company_name}`,
    follow_up_date: null,
    logged_by: "Freyr Agent",
  });

  await db.agentRuns.create({
    kind: "act",
    title: `Agent ${verb} for ${customer.company_name}`,
    customer_id: customerId,
    company: customer.company_name,
    outcome: "handled",
    summary: `One-click handle: ${verb}.`,
    steps: actRunSteps(verb, customer.company_name),
    interaction_ids: [logged.id],
  });

  notifyTelegram(
    `🤖 <b>Agent ${verb}</b>\n${customer.company_name}`
  );

  return NextResponse.json({ ok: true, logged: true });
}
