import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { notifyTelegram } from "@/lib/telegram";
import { actRunSteps, buildActDraft } from "@/lib/agent";
import type { AgentActionKind } from "@/lib/agent";

export const dynamic = "force-dynamic";

// "Draft it for me" (V7 #4). The agent WRITES the actual draft (email/plan)
// grounded in the account's data, shows it to the rep, saves it to the timeline,
// and adds a review task — nothing is sent. Mock-first; with ANTHROPIC_API_KEY
// this is where the LLM would generate the copy. (Suren: "when I press Draft it
// for me it should show me the draft… full enterprise-level platform.")
const VERB: Record<string, string> = {
  reengage: "drafted a re-engagement email",
  stabilize: "prepared a recovery plan",
  followup: "drafted the follow-up email",
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
  const contact = contacts.find((c) => c.id === contactId) || contacts[0] || null;

  // A concrete review date so the drafted work lands in Tasks (Suren: "it
  // doesn't even show up in the tasks"). Two days out, formatted for the draft.
  const dueDate = new Date(Date.now() + 2 * 86_400_000);
  const dueIso = dueDate.toISOString();
  const dueLabel = dueDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  // The real draft the rep will read + edit.
  const draft = buildActDraft(
    kind as AgentActionKind,
    customer,
    contact,
    dueLabel
  );

  if (!contactId) {
    // No contact to attach a task to — still hand back the draft to read.
    return NextResponse.json({ ok: true, logged: false, draft });
  }

  const logged = await db.interactions.create({
    pitch_session_id: body.sessionId || null,
    customer_id: customerId,
    contact_id: contactId,
    outcome: "in_progress",
    notes: `🤖 Agent ${verb} for ${customer.company_name} — “${draft.title}”. Review and send.`,
    // Set a follow-up date so this becomes a real task the rep sees in Tasks.
    follow_up_date: dueIso,
    logged_by: "Freyr Agent",
  });

  const run = await db.agentRuns.create({
    kind: "act",
    title: `Agent ${verb} for ${customer.company_name}`,
    customer_id: customerId,
    company: customer.company_name,
    outcome: "handled",
    summary: `${draft.title} — saved to the timeline, added to Tasks for your review (due ${dueLabel}).`,
    steps: actRunSteps(verb, customer.company_name),
    interaction_ids: [logged.id],
    draft,
  });

  notifyTelegram(`🤖 <b>Agent ${verb}</b>\n${customer.company_name}`);

  return NextResponse.json({ ok: true, logged: true, draft, runId: run.id });
}
