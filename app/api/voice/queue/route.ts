import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getDataMode } from "@/lib/dataMode";
import { isDialedVoiceCall, listVoiceQueue, placeOrQueueCall, voiceStatus } from "@/lib/voice";
import {
  isWorkflowOwner,
  verifiedWorkflowActor,
} from "@/lib/workflowAuthorization";

const VOICE_QUEUE_RECIPIENT_CAP = 100;

// Bulk voice-agent run (Suren, Jul 3): select a bunch of contacts + an
// offering CATEGORY, and the category's voice agent works the list — dialing
// live once a phone number is connected, queuing honestly until then.
export async function POST(req: NextRequest) {
  const actor = await verifiedWorkflowActor(req);
  if (!actor) {
    return NextResponse.json(
      { ok: false, error: "Verified workspace access required." },
      { status: 403 }
    );
  }
  let body: { contactIds?: string[]; category?: string } = {};
  try {
    body = await req.json();
  } catch {}
  const rawIds = Array.isArray(body.contactIds)
    ? body.contactIds.filter((x): x is string => typeof x === "string")
    : [];
  if (rawIds.length > VOICE_QUEUE_RECIPIENT_CAP) {
    return NextResponse.json(
      {
        ok: false,
        error: `A bulk voice run is limited to ${VOICE_QUEUE_RECIPIENT_CAP} contacts.`,
      },
      { status: 400 }
    );
  }
  const ids = [
    ...new Set(rawIds.map((id) => id.trim()).filter(Boolean)),
  ];
  const category =
    typeof body.category === "string" ? body.category.trim().slice(0, 120) : "";
  if (!ids.length || !category) {
    return NextResponse.json(
      { ok: false, error: "contactIds and category are required." },
      { status: 400 }
    );
  }
  const db = getDb();
  const contacts = await Promise.all(ids.map((id) => db.contacts.get(id)));
  if (contacts.some((contact) => !contact)) {
    return NextResponse.json(
      { ok: false, error: "One or more contacts could not be found." },
      { status: 404 }
    );
  }
  const resolvedContacts = contacts.filter(
    (contact): contact is NonNullable<typeof contact> => !!contact
  );
  const customers = await Promise.all(
    resolvedContacts.map((contact) =>
      contact.customer_id ? db.customers.get(contact.customer_id) : null
    )
  );
  if (customers.some((customer) => !customer)) {
    return NextResponse.json(
      { ok: false, error: "One or more contact accounts could not be found." },
      { status: 404 }
    );
  }
  if (
    getDataMode() === "live" &&
    actor.role !== "admin" &&
    customers.some(
      (customer) =>
        !customer ||
        !isWorkflowOwner(
          actor,
          customer.owner_user_id,
          customer.owner
        )
    )
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: "You can queue voice calls only for accounts assigned to you.",
      },
      { status: 403 }
    );
  }

  const results = [];
  for (const [index, contact] of resolvedContacts.entries()) {
    const customer = customers[index];
    results.push(
      await placeOrQueueCall({
        contact,
        customer,
        offering: null,
        category,
      })
    );
  }
  return NextResponse.json({
    ok: true,
    queued: results.length,
    called: results.filter((r) => isDialedVoiceCall(r.status)).length,
    status: voiceStatus(),
  });
}

export async function GET() {
  return NextResponse.json({ ok: true, status: voiceStatus(), queue: listVoiceQueue() });
}
