import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isDialedVoiceCall, listVoiceQueue, placeOrQueueCall, voiceStatus } from "@/lib/voice";

// Bulk voice-agent run (Suren, Jul 3): select a bunch of contacts + an
// offering CATEGORY, and the category's voice agent works the list — dialing
// live once a phone number is connected, queuing honestly until then.
export async function POST(req: NextRequest) {
  let body: { contactIds?: string[]; category?: string } = {};
  try {
    body = await req.json();
  } catch {}
  const ids = Array.isArray(body.contactIds)
    ? body.contactIds.filter((x): x is string => typeof x === "string")
    : [];
  if (!ids.length || !body.category) {
    return NextResponse.json(
      { ok: false, error: "contactIds and category are required." },
      { status: 400 }
    );
  }
  const db = getDb();
  const results = [];
  for (const id of ids) {
    const contact = await db.contacts.get(id);
    if (!contact) continue;
    const customer = contact.customer_id
      ? await db.customers.get(contact.customer_id)
      : null;
    results.push(
      await placeOrQueueCall({
        contact,
        customer,
        offering: null,
        category: body.category,
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
