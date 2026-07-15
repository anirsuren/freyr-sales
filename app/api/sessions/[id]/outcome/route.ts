import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { notifyTelegram } from "@/lib/telegram";
import { OUTCOME_META } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const body = await req.json().catch(() => ({}));
  const db = getDb();

  const session = await db.pitchSessions.get((await params).id);
  const customerId = body.customer_id || session?.customer_id;
  const contactId = body.contact_id || session?.contact_id;

  if (!body.outcome || !customerId || !contactId) {
    return NextResponse.json(
      { error: "outcome, customer_id and contact_id are required" },
      { status: 400 }
    );
  }

  const interaction = await db.interactions.create({
    pitch_session_id: (await params).id,
    customer_id: customerId,
    contact_id: contactId,
    outcome: body.outcome,
    notes: body.notes || null,
    follow_up_date: body.follow_up_date || null,
    logged_by: "Suren Dheen",
  });

  const customer = await db.customers.get(customerId);
  const contact = await db.contacts.get(contactId);
  const label = OUTCOME_META[body.outcome]?.label || body.outcome;
  notifyTelegram(
    `📞 <b>Outcome logged: ${label}</b>\n${customer?.company_name || ""} · ${
      contact?.full_name || ""
    }${body.notes ? `\n“${body.notes}”` : ""}`
  );

  return NextResponse.json({ ok: true, interaction });
}
