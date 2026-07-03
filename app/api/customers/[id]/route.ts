import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import type {
  AccountNote,
  AccountAttachment,
  AccountDeal,
  Customer,
} from "@/lib/types";

export const dynamic = "force-dynamic";

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.floor(
    Math.random() * 1e4
  ).toString(36)}`;
}

// PATCH: assign owner (#55), set competitor (#59), append a note or
// attachment (#60). All persist via the mock/Supabase customer update.
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const db = getDb();
  const customer = await db.customers.get(params.id);
  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {}

  const patch: Partial<Customer> = {};
  if (typeof body.owner === "string") patch.owner = body.owner || null;
  if (typeof body.competitor === "string")
    patch.competitor = body.competitor.trim() || null;
  // Customer analysis fields (Suren's Jun 27 ask) — set on approval.
  if (typeof body.customer_type === "string")
    patch.customer_type = body.customer_type.trim() || null;
  if (typeof body.ownership === "string")
    patch.ownership = body.ownership.trim() || null;
  if (typeof body.revenue === "string")
    patch.revenue = body.revenue.trim() || null;
  if (body.analyzed_at) patch.analyzed_at = new Date().toISOString();
  // Adoption link: which offerings this customer already uses (offering ids).
  if (Array.isArray(body.offerings_in_use))
    patch.offerings_in_use = body.offerings_in_use.filter(
      (x: unknown): x is string => typeof x === "string"
    );

  if (body.addNote && String(body.addNote.body || "").trim()) {
    const note: AccountNote = {
      id: uid("note"),
      author: String(body.addNote.author || "Suren Dheen"),
      body: String(body.addNote.body).trim().slice(0, 2000),
      created_at: new Date().toISOString(),
    };
    patch.notes_log = [note, ...(customer.notes_log || [])];
  }

  if (body.addAttachment && String(body.addAttachment.name || "").trim()) {
    const att: AccountAttachment = {
      id: uid("att"),
      name: String(body.addAttachment.name).trim().slice(0, 200),
      url: body.addAttachment.url ? String(body.addAttachment.url).trim() : null,
      created_at: new Date().toISOString(),
    };
    patch.attachments = [att, ...(customer.attachments || [])];
  }

  if (body.addDeal && String(body.addDeal.name || "").trim()) {
    const deal: AccountDeal = {
      id: uid("deal"),
      name: String(body.addDeal.name).trim().slice(0, 160),
      stage: String(body.addDeal.stage || "Prospect"),
      value:
        Math.max(0, Math.round(Number(body.addDeal.value))) || 200000,
      created_at: new Date().toISOString(),
    };
    patch.account_deals = [deal, ...(customer.account_deals || [])];
  }

  const updated = await db.customers.update(params.id, patch);
  return NextResponse.json({ ok: true, customer: updated });
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const db = getDb();
  const customer = await db.customers.get(params.id);
  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }
  const contacts = await db.contacts.list(params.id);
  const sessions = await db.pitchSessions.list(params.id);
  const interactions = await db.interactions.list(params.id);

  return NextResponse.json({ customer, contacts, sessions, interactions });
}
