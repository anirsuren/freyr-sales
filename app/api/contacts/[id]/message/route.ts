import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getOffering } from "@/lib/offerings";
import { generateMessage, type MessageKind } from "@/lib/outreach";

// On-demand outreach draft for a contact (Suren, Jul 3): the rep picks the
// message type (LinkedIn / email) + the offering to sell; we generate a
// personalized draft they copy out and send themselves — NEVER auto-sent.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let body: { kind?: string; offeringId?: string; extra?: string } = {};
  try {
    body = await req.json();
  } catch {}

  const kind = (body.kind === "email" ? "email" : "linkedin") as MessageKind;
  const offering = body.offeringId ? getOffering(body.offeringId) : null;
  if (!offering) {
    return NextResponse.json(
      { ok: false, error: "Pick the offering to pitch first." },
      { status: 400 }
    );
  }

  const db = getDb();
  const contact = await db.contacts.get((await params).id);
  if (!contact) {
    return NextResponse.json(
      { ok: false, error: "Contact not found." },
      { status: 404 }
    );
  }
  const customer = contact.customer_id
    ? await db.customers.get(contact.customer_id)
    : null;

  const draft = await generateMessage({
    kind,
    contact,
    customer,
    offering,
    extra: body.extra,
  });
  return NextResponse.json({ ok: true, draft });
}
