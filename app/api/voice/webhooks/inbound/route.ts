import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { upsertVoiceConversation } from "@/lib/voiceEvents";
import agentIds from "@/lib/voiceAgents.json";

export const dynamic = "force-dynamic";

const norm = (phone: string) => phone.replace(/\D/g, "").slice(-10);

export async function POST(req: NextRequest) {
  const secret = process.env.ELEVENLABS_INBOUND_WEBHOOK_SECRET;
  const mockAllowed = process.env.AGENT_FORCE_MOCK === "1";
  if (!secret && !mockAllowed) {
    return NextResponse.json(
      { error: "ELEVENLABS_INBOUND_WEBHOOK_SECRET is not configured." },
      { status: 503 }
    );
  }
  if (secret && req.headers.get("x-freyr-voice-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    caller_id?: string;
    agent_id?: string;
    called_number?: string;
    call_sid?: string;
  };
  if (!body.caller_id || !body.agent_id || !body.call_sid) {
    return NextResponse.json(
      { error: "caller_id, agent_id, and call_sid are required." },
      { status: 400 }
    );
  }

  const db = getDb();
  const contacts = await db.contacts.list();
  const contact =
    contacts.find(
      (candidate) =>
        !!candidate.phone && norm(candidate.phone) === norm(body.caller_id!)
    ) || null;
  const customer = contact?.customer_id
    ? await db.customers.get(contact.customer_id)
    : null;
  const recent = contact
    ? (await db.interactions.list(contact.customer_id, contact.id)).slice(0, 3)
    : [];
  const category =
    Object.entries(agentIds as Record<string, string>).find(
      ([, agentId]) => agentId === body.agent_id
    )?.[0] || "Freyr sales";
  const contactName = contact?.full_name || "there";
  const company = customer?.company_name || "your company";
  const openingLine = contact
    ? `Hi ${contactName}, thanks for calling Freyr. How can I help with ${company} today?`
    : "Thanks for calling Freyr. How can I help today?";
  const dynamicVariables = {
    call_sid: body.call_sid,
    call_direction: "inbound",
    contact_id: contact?.id || "",
    contact_name: contactName,
    customer_id: customer?.id || "",
    company,
    contact_title: contact?.job_title || "",
    external_number: body.caller_id,
    category,
    offering: category,
    opening_line: openingLine,
    previous_topics: recent
      .map((item) => item.notes)
      .filter(Boolean)
      .join(" | ")
      .slice(0, 600),
  };

  await upsertVoiceConversation({
    call_sid: body.call_sid,
    agent_id: body.agent_id,
    direction: "inbound",
    status: "in_progress",
    contact_id: contact?.id,
    contact_name: contact?.full_name,
    customer_id: customer?.id,
    company: customer?.company_name,
    external_number: body.caller_id,
    offering_name: category,
    category,
    started_at: new Date().toISOString(),
    dynamic_variables: dynamicVariables,
  });

  return NextResponse.json({
    type: "conversation_initiation_client_data",
    dynamic_variables: dynamicVariables,
  });
}
