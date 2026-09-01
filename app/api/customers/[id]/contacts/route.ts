import { NextRequest, NextResponse } from "next/server";
import { getDataMode } from "@/lib/dataMode";
import { getDb } from "@/lib/db";
import { verifiedRequestMemberScope } from "@/lib/memberScope";
import { recordWriteRefusal } from "@/lib/moduleAccessServer";

export const dynamic = "force-dynamic";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function optionalString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  return value.trim().slice(0, maxLength) || null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const dataMode = getDataMode();
  const scope =
    dataMode === "live" ? await verifiedRequestMemberScope(request) : null;
  if (dataMode === "live" && !scope) {
    return NextResponse.json(
      { error: "Verified workspace access is required." },
      { status: 403 }
    );
  }

  const customerId = (await params).id;
  const db = getDb();
  const customer = await db.customers.get(customerId);
  if (
    !customer ||
    (scope && customer.workspace_id && customer.workspace_id !== scope.workspaceId)
  ) {
    return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  }

  /* ADDING SOMEBODY TO AN ACCOUNT IS A CHANGE TO THAT ACCOUNT, so the account
     decides (Suren, Sep 1). This route asked nothing at all before, not the
     module row either, so anybody signed in could file a contact against any
     account in the company. Flagged in the report of Sep 1: the module half of
     this is a hole that predates the record rule, and closing it is Anir's
     call to keep or revert. */
  {
    const refusal = await recordWriteRefusal("/customers", {
      id: customer.id,
      owner: customer.owner,
      owner_user_id: customer.owner_user_id,
      created_by: customer.created_by,
    });
    if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const fullName = optionalString(body?.full_name, 120);
  if (!fullName) {
    return NextResponse.json(
      { error: "Contact name is required." },
      { status: 400 }
    );
  }

  const email = optionalString(body?.email, 254)?.toLocaleLowerCase() || null;
  if (email && !EMAIL_PATTERN.test(email)) {
    return NextResponse.json(
      { error: "Enter a valid email address." },
      { status: 400 }
    );
  }

  const linkedinUrl = optionalString(body?.linkedin_url, 500);
  if (linkedinUrl) {
    let parsed: URL;
    try {
      parsed = new URL(linkedinUrl);
    } catch {
      return NextResponse.json(
        { error: "Enter a valid LinkedIn URL." },
        { status: 400 }
      );
    }
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      !/(^|\.)linkedin\.com$/i.test(parsed.hostname)
    ) {
      return NextResponse.json(
        { error: "Enter a valid LinkedIn URL." },
        { status: 400 }
      );
    }
  }

  if (email) {
    const existing = await db.contacts.list(customerId);
    if (
      existing.some(
        (contact) => contact.email?.trim().toLocaleLowerCase() === email
      )
    ) {
      return NextResponse.json(
        { error: "A contact with that email already exists for this customer." },
        { status: 409 }
      );
    }
  }

  try {
    const contact = await db.contacts.create({
      customer_id: customerId,
      full_name: fullName,
      email,
      phone: optionalString(body?.phone, 60),
      linkedin_url: linkedinUrl,
      job_title: optionalString(body?.job_title, 160),
      role_bucket: optionalString(body?.role_bucket, 120),
      career_summary: null,
      enrichment_summary: null,
    });
    return NextResponse.json({ ok: true, contact }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Could not add the contact." },
      { status: 500 }
    );
  }
}
