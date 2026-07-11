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
  // Add a single offering to the in-use list from the offering page ("Add to a
  // customer") without wiping the rest — appends + dedupes.
  if (typeof body.addOfferingInUse === "string" && body.addOfferingInUse) {
    const current = customer.offerings_in_use || [];
    patch.offerings_in_use = current.includes(body.addOfferingInUse)
      ? current
      : [...current, body.addOfferingInUse];
  }
  // Commercial detail per in-use offering (Suren's Jul 5 dictation): revenue
  // lines keyed by offering. Sanitized so bad input can't corrupt the store.
  if (Array.isArray(body.offering_usage)) {
    const RT = ["annual", "project", "annual_service", "license"];
    patch.offering_usage = body.offering_usage
      .map((u: any) => ({
        offering_id: String(u?.offering_id || ""),
        revenue_lines: Array.isArray(u?.revenue_lines)
          ? u.revenue_lines
              .map((l: any) => ({
                id: String(l?.id || uid("rev")),
                revenue_type: RT.includes(l?.revenue_type)
                  ? l.revenue_type
                  : "annual",
                amount: Math.max(0, Math.round(Number(l?.amount) || 0)),
                num_licenses:
                  l?.num_licenses != null
                    ? Math.max(0, Math.round(Number(l.num_licenses) || 0))
                    : null,
                start_date: l?.start_date ? String(l.start_date) : null,
                end_date: l?.end_date ? String(l.end_date) : null,
                description: l?.description
                  ? String(l.description).slice(0, 400)
                  : null,
              }))
              .filter((l: any) => l.amount > 0 || l.num_licenses)
          : [],
      }))
      .filter((u: any) => u.offering_id && u.revenue_lines.length > 0);
  }

  if (body.addNote && String(body.addNote.body || "").trim()) {
    const n = body.addNote;
    const KINDS = ["call", "email", "meeting", "note"];
    const note: AccountNote = {
      id: uid("note"),
      author: String(n.author || "Suren Dheen"),
      body: String(n.body).trim().slice(0, 2000),
      created_at: new Date().toISOString(),
      kind: KINDS.includes(n.kind) ? n.kind : "note",
      next_step: n.next_step ? String(n.next_step).trim().slice(0, 300) || null : null,
      follow_up_date: n.follow_up_date ? String(n.follow_up_date).slice(0, 40) : null,
    };
    patch.notes_log = [note, ...(customer.notes_log || [])];

    // A logged call/email/meeting is a real interaction — record it so it shows
    // on the timeline and (with a follow-up) lands in Tasks (Suren, #96).
    if (note.kind !== "note") {
      const contacts = await db.contacts.list(params.id);
      const contactId = contacts[0]?.id;
      if (contactId) {
        const verb = note.kind === "call" ? "Call" : note.kind === "email" ? "Email" : "Meeting";
        await db.interactions.create({
          customer_id: params.id,
          contact_id: contactId,
          outcome: "in_progress",
          notes: `${verb} logged: ${note.body}${note.next_step ? ` · Next: ${note.next_step}` : ""}`,
          follow_up_date: note.follow_up_date,
          logged_by: note.author,
        });
      }
    }
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
    const d = body.addDeal;
    const str = (v: unknown, max = 200) =>
      v ? String(v).trim().slice(0, max) || null : null;
    const deal: AccountDeal = {
      id: uid("deal"),
      name: String(d.name).trim().slice(0, 160),
      stage: String(d.stage || "Prospect"),
      value: Math.max(0, Math.round(Number(d.value))) || 200000,
      created_at: new Date().toISOString(),
      offering: str(d.offering),
      contact: str(d.contact),
      owner: str(d.owner),
      close_date: str(d.close_date, 40),
      next_step: str(d.next_step, 300),
      notes: str(d.notes, 1000),
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
