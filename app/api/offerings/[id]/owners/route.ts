import { NextResponse } from "next/server";
import {
  claimOffering,
  releaseOffering,
  getOffering,
  hydrateOffering,
  isOfferingOwner,
  commitOfferingsChange,
} from "@/lib/offerings";
import { canManageOfferings } from "@/lib/role";
import { getCurrentUser } from "@/lib/currentUser";
import { isOfferingsOnly } from "@/lib/release";
import { getDataMode } from "@/lib/dataMode";

export const dynamic = "force-dynamic";

/** app_users ids are UUIDs. Anything else is a local placeholder identity. */
function isRealAccountId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    id
  );
}

/**
 * CLAIMING AN OFFERING.
 *
 * A verified workspace account claims an offering for ITSELF, which is what
 * lets an owner start uploading their own sales materials without waiting on an
 * admin grant. An admin may additionally assign or revoke on someone else's
 * behalf by passing `memberId`.
 *
 * The claim is written against `memberId`, the stable account id, and it is
 * always taken from the SESSION for a self-claim. A caller can never claim on
 * behalf of another account unless they are an admin, and the body can never
 * name the claimer for a self-claim.
 */

const UNIDENTIFIED = NextResponse.json(
  { error: "Sign in to claim an offering" },
  { status: 401 }
);

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const offering = getOffering(id);
  if (!offering) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const user = await getCurrentUser();
  if (!user.memberId) return UNIDENTIFIED;
  /**
   * A GRANT MUST NAME A REAL ACCOUNT.
   *
   * `local-anir-suren` is the placeholder identity used before a session is
   * bound to an app_users row. One of those got written as an owner, so the
   * offering listed "Anir Suren" as owner while the permission check compared
   * that placeholder against the real account id, failed, and offered "Take
   * ownership" to the person already holding it (Anir, Jul 29: "why is it
   * asking me to take ownership? I am the owner"). A row keyed to a string
   * that is not an account can never grant anything, so refuse to write one.
   */
  // Only where real accounts exist. In mock mode the local identity IS the
  // account, so demanding a UUID there breaks ownership entirely (it did:
  // twelve verification tests went red because the test session carries the
  // local id). Live mode is the one that must never store a placeholder.
  if (isOfferingsOnly(getDataMode()) && !isRealAccountId(user.memberId)) {
    return UNIDENTIFIED;
  }

  const body = (await req.json().catch(() => ({}))) as {
    memberId?: string;
    name?: string;
    email?: string | null;
  };

  // WHO ENDS UP AN OWNER, and who merely asks.
  //
  // A signed-in member may REQUEST any offering. That records the ask and
  // grants nothing: self-service ownership would let anyone in the workspace
  // give themselves write access to any offering (Anir, Jul 28: "only a select
  // amount of people should be able to edit the offering... everyone shouldn't
  // be able to do that if they claim it first").
  //
  // Only an ADMIN turns a request into ownership, or assigns someone directly.
  // A self-request ignores the body entirely, so nobody can write a row under
  // another account's id.
  const admin = await canManageOfferings();
  const targetsSomeoneElse = !!body.memberId && body.memberId !== user.memberId;
  if (targetsSomeoneElse && !admin) {
    return NextResponse.json(
      { error: "Only an admin can assign an offering to someone else" },
      { status: 403 }
    );
  }

  const owner = targetsSomeoneElse
    ? {
        memberId: body.memberId!,
        name: (body.name || "").trim() || "Workspace member",
        email: body.email ?? null,
        status: "owner" as const,
        granted_by: user.memberId,
      }
    : {
        memberId: user.memberId,
        name: user.name,
        email: user.email,
        // An admin claiming for themselves is already authorised to edit, so
        // there is nothing to approve. Everyone else files a request.
        status: (admin ? "owner" : "requested") as "requested" | "owner",
        granted_by: user.memberId,
      };

  try {
    const saved = await commitOfferingsChange(() => claimOffering(id, owner));
    if (!saved) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ offering: hydrateOffering(saved) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not claim this offering" },
      { status: 500 }
    );
  }
}

/**
 * Releasing a claim. An owner may always release their own; an admin may revoke
 * anyone's. Releasing is not deleting: the offering itself is untouched.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const offering = getOffering(id);
  if (!offering) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const user = await getCurrentUser();
  if (!user.memberId) return UNIDENTIFIED;

  const url = new URL(req.url);
  const target = url.searchParams.get("memberId") || user.memberId;

  /**
   * OWNERSHIP IS SURRENDERED, NEVER TAKEN.
   *
   * An admin used to be able to release anyone's claim, and the UI offered it
   * on every row. Hiding that button is not a permission — the request still
   * worked — so the rule belongs here: this endpoint releases the caller's own
   * claim and nothing else (Anir, Jul 29: "I shouldn't be able to remove other
   * owners, like only myself"). A pending REQUEST is different and is still
   * declined by an admin through its own path; that is refusing to grant, not
   * revoking something already held.
   */
  if (target !== user.memberId) {
    return NextResponse.json(
      { error: "You can only give up your own ownership." },
      { status: 403 }
    );
  }
  if (!isOfferingOwner(offering, target)) {
    return NextResponse.json({ offering: hydrateOffering(offering) });
  }

  try {
    const saved = await commitOfferingsChange(() => releaseOffering(id, target));
    if (!saved) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ offering: hydrateOffering(saved) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not release this offering" },
      { status: 500 }
    );
  }
}
