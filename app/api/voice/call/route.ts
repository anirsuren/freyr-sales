import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getOffering } from "@/lib/offerings";
import { placeOrQueueCall } from "@/lib/voice";

// Per-contact AI voice call about ONE offering (Suren, Jul 3). Dials live once
// a phone number is connected; until then it queues with an honest status.
export async function POST(req: NextRequest) {
  let body: { contactId?: string; offeringId?: string } = {};
  try {
    body = await req.json();
  } catch {}
  if (!body.contactId || !body.offeringId) {
    return NextResponse.json(
      { ok: false, error: "contactId and offeringId are required." },
      { status: 400 }
    );
  }
  const db = getDb();
  const contact = await db.contacts.get(body.contactId);
  const offering = getOffering(body.offeringId);
  if (!contact || !offering) {
    return NextResponse.json(
      { ok: false, error: "Contact or offering not found." },
      { status: 404 }
    );
  }
  const customer = contact.customer_id
    ? await db.customers.get(contact.customer_id)
    : null;
  const call = await placeOrQueueCall({
    contact,
    customer,
    offering,
    category: offering.offering_category || offering.offering_type,
  });
  return NextResponse.json({ ok: true, status: call.status, call });
}
