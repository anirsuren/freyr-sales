import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { getDataMode } from "@/lib/dataMode";
import { verifiedRequestMemberScope } from "@/lib/memberScope";
import {
  recordWriteRefusal,
  moduleDeleteRefusal,
  recordDeleteRefusal,
} from "@/lib/moduleAccessServer";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (getDataMode() === "live" && !(await verifiedRequestMemberScope(request))) {
    return NextResponse.json({ error: "Verified workspace access is required." }, { status: 403 });
  }
  const db = getDb();
  const contact = await db.contacts.get((await params).id);
  if (!contact) return NextResponse.json({ error: "Contact not found." }, { status: 404 });
  const customer = await db.customers.get(contact.customer_id);
  if (!customer) return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  const refusal = await recordWriteRefusal("/customers", {
    id: customer.id,
    owner: customer.owner,
    owner_user_id: customer.owner_user_id,
    created_by: customer.created_by,
  });
  if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid contact change." }, { status: 400 });
  }
  const patch: Record<string, string | boolean | null> = {};
  if (typeof body.is_key === "boolean") patch.is_key = body.is_key;
  const limits = { full_name: 120, job_title: 160, role_bucket: 120, department: 120, city: 120, country: 120, buying_role: 80, relationship_notes: 2000, career_summary: 2000, email: 254, phone: 60, linkedin_url: 500 } as const;
  for (const [field, limit] of Object.entries(limits)) {
    if (typeof body[field] !== "string") continue;
    if (body[field].trim().length > limit) return NextResponse.json({ error: `${field.replaceAll("_", " ")} is too long.` }, { status: 400 });
    patch[field] = body[field].trim() || null;
  }
  if ("full_name" in patch && !patch.full_name) return NextResponse.json({ error: "Contact name is required." }, { status: 400 });
  if (patch.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(patch.email))) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (patch.linkedin_url) {
    try {
      const url = new URL(String(patch.linkedin_url));
      if (!["http:", "https:"].includes(url.protocol) || !/(^|\.)linkedin\.com$/i.test(url.hostname)) throw new Error();
    } catch {
      return NextResponse.json({ error: "Enter a valid LinkedIn URL." }, { status: 400 });
    }
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  try {
    const updated = await db.contacts.update(contact.id, patch);
    return NextResponse.json({ ok: true, contact: updated });
  } catch {
    return NextResponse.json({ error: "Could not save this contact." }, { status: 500 });
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = getDb();
  const contact = await db.contacts.get((await params).id);
  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }
  const customer = await db.customers.get(contact.customer_id);
  const sessions = await db.pitchSessions.list(undefined, (await params).id);
  const interactions = await db.interactions.list(undefined, (await params).id);

  return NextResponse.json({ contact, customer, sessions, interactions });
}

/**
 * TAKE A CONTACT OFF AN ACCOUNT.
 *
 * Anir, Sep 1: "Yeah, if I can't delete one, that's a problem."
 *
 * A contact could be created from the customer page, the meeting form and now
 * the solutioning request, and removed from nowhere — so a typo'd name sat on
 * a real customer forever. Found cleaning up a test probe, which had to be
 * deleted straight out of the database because the app had no route for it.
 *
 * Deleting a person off an account is a DELETE on Customers, so it asks the
 * module's delete question — not its write one. The db layer scopes the row to
 * this workspace before it touches anything, so an id from somewhere else
 * finds nothing rather than deleting something.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const dataMode = getDataMode();
  if (dataMode === "live" && !(await verifiedRequestMemberScope(request))) {
    return NextResponse.json(
      { error: "Verified workspace access is required." },
      { status: 403 }
    );
  }

  const refusal = await moduleDeleteRefusal("/customers");
  if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });

  const db = getDb();
  const id = (await params).id;
  const contact = await db.contacts.get(id);
  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  /* A CONTACT BELONGS TO AN ACCOUNT, so removing one is a change to that
     account and the account decides (Suren, Sep 1). Asked after the contact is
     found so a person who may not touch this account still cannot use the
     answer to learn which contact ids exist. */
  {
    const parent = await db.customers.get(contact.customer_id);
    if (parent) {
      const denied = await recordDeleteRefusal("/customers", {
        id: parent.id,
        owner: parent.owner,
        owner_user_id: parent.owner_user_id,
        created_by: parent.created_by,
      });
      if (denied) return NextResponse.json({ error: denied }, { status: 403 });
    }
  }

  try {
    const gone = await db.contacts.remove(id);
    if (!gone) {
      return NextResponse.json(
        { error: "Could not remove the contact." },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Could not remove the contact." },
      { status: 500 }
    );
  }
}
