import { NextResponse } from "next/server";
import {
  addOfferingContact,
  removeOfferingContact,
  updateOfferingContact,
  getOffering,
  hydrateOffering,
  commitOfferingsChange,
} from "@/lib/offerings";
import { canEditOffering } from "@/lib/offeringOwnership";

export const dynamic = "force-dynamic";

/**
 * THE PEOPLE BEHIND AN OFFERING.
 *
 * Adding and removing a contact changes the offering's content, so it is gated
 * on the same rule the Edit button is: you must OWN this offering. An admin who
 * has not taken ownership is refused here exactly as they are refused in the
 * form, so the page and the API can never disagree about who may change what.
 */

async function guard(id: string) {
  const offering = getOffering(id);
  if (!offering)
    return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  if (!(await canEditOffering(offering)))
    return {
      error: NextResponse.json(
        { error: "Take ownership of this offering to change its contacts" },
        { status: 403 }
      ),
    };
  return { offering };
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const gate = await guard(id);
  if (gate.error) return gate.error;

  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    role?: string;
    email?: string;
    phone?: string;
  };
  if (!(body.name || "").trim())
    return NextResponse.json({ error: "A contact needs a name" }, { status: 400 });

  try {
    const saved = await commitOfferingsChange(() =>
      addOfferingContact(id, {
        name: body.name!,
        role: body.role,
        email: body.email,
        phone: body.phone,
      })
    );
    if (!saved) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ offering: hydrateOffering(saved) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not add that contact" },
      { status: 400 }
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const gate = await guard(id);
  if (gate.error) return gate.error;

  const body = (await req.json().catch(() => ({}))) as {
    contactId?: string;
    name?: string;
    role?: string;
    email?: string;
    phone?: string;
  };
  if (!body.contactId)
    return NextResponse.json({ error: "Which contact?" }, { status: 400 });

  try {
    const saved = await commitOfferingsChange(() =>
      updateOfferingContact(id, body.contactId!, body)
    );
    if (!saved) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ offering: hydrateOffering(saved) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not save that contact" },
      { status: 400 }
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const gate = await guard(id);
  if (gate.error) return gate.error;

  const contactId = new URL(req.url).searchParams.get("contactId");
  if (!contactId)
    return NextResponse.json({ error: "Which contact?" }, { status: 400 });

  try {
    const saved = await commitOfferingsChange(() =>
      removeOfferingContact(id, contactId)
    );
    if (!saved) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ offering: hydrateOffering(saved) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not remove that contact" },
      { status: 400 }
    );
  }
}
