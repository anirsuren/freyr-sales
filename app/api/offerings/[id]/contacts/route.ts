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
import {
  listAssignablePeople,
  redactUnverifiedOfferingPeople,
} from "@/lib/assignablePeople";
import { getDataMode } from "@/lib/dataMode";

export const dynamic = "force-dynamic";

/**
 * THE PEOPLE BEHIND AN OFFERING.
 *
 * Adding and removing a contact changes the offering's content, so it is gated
 * on the same rule the Edit button is: you must OWN this offering. An admin who
 * has not been assigned ownership is refused here exactly as they are in the
 * form, so the page and the API can never disagree about who may change what.
 */

async function guard(id: string) {
  const offering = getOffering(id);
  if (!offering)
    return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  if (!(await canEditOffering(offering)))
    return {
      error: NextResponse.json(
        { error: "Ask a workspace admin to assign you as an owner before changing contacts" },
        { status: 403 }
      ),
    };
  return { offering };
}

async function liveAccountFor(name?: string, email?: string) {
  const people = await listAssignablePeople();
  if (getDataMode() !== "live") return { people, account: null };
  const wantedName = (name || "").trim().toLowerCase();
  const wantedEmail = (email || "").trim().toLowerCase();
  const account = people.find(
    (person) =>
      Boolean(person.memberId) &&
      ((wantedName && person.name.trim().toLowerCase() === wantedName) ||
        (wantedEmail &&
          (person.email || "").trim().toLowerCase() === wantedEmail))
  );
  return { people, account };
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const gate = await guard(id);
  if (gate.error) return gate.error;

  const body = ((await req.json().catch(() => ({}))) ?? {}) as {
    name?: string;
    role?: string;
    email?: string;
    phone?: string;
  };
  if (!(body.name || "").trim())
    return NextResponse.json({ error: "A contact needs a name" }, { status: 400 });

  // A live contact is an account assignment, not free text. Re-check on the
  // server so a hand-written request cannot bypass the account-only picker.
  const resolved = await liveAccountFor(body.name, body.email);
  if (getDataMode() === "live") {
    const account = resolved.account;
    if (!account) {
      return NextResponse.json(
        { error: "Choose a person with a real workspace account." },
        { status: 400 }
      );
    }
    body.name = account.name;
    body.email = account.email || "";
  }

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
    return NextResponse.json({
      offering: hydrateOffering(
        redactUnverifiedOfferingPeople(saved, resolved.people)
      ),
    });
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

  const body = ((await req.json().catch(() => ({}))) ?? {}) as {
    contactId?: string;
    name?: string;
    role?: string;
    email?: string;
    phone?: string;
  };
  if (!body.contactId)
    return NextResponse.json({ error: "Which contact?" }, { status: 400 });

  const existingContact = gate.offering?.contacts?.find(
    (contact) => contact.id === body.contactId
  );
  const resolved = await liveAccountFor(
    body.name ?? existingContact?.name,
    body.email ?? existingContact?.email
  );
  if (getDataMode() === "live") {
    if (!resolved.account) {
      return NextResponse.json(
        { error: "Choose a person with a real workspace account." },
        { status: 400 }
      );
    }
    body.name = resolved.account.name;
    body.email = resolved.account.email || "";
  }

  try {
    const saved = await commitOfferingsChange(() =>
      updateOfferingContact(id, body.contactId!, body)
    );
    if (!saved) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({
      offering: hydrateOffering(
        redactUnverifiedOfferingPeople(saved, resolved.people)
      ),
    });
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
    const people = await listAssignablePeople();
    return NextResponse.json({
      offering: hydrateOffering(
        redactUnverifiedOfferingPeople(saved, people)
      ),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not remove that contact" },
      { status: 400 }
    );
  }
}
