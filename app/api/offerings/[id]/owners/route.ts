import { NextResponse } from "next/server";
import {
  assignOfferingOwner,
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
import { redactAgentOnlyMaterials } from "@/lib/materialAccess";

export const dynamic = "force-dynamic";

/** app_users ids are UUIDs. Anything else is a local placeholder identity. */
function isRealAccountId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    id
  );
}

/** Ownership is assigned here by a workspace admin. There is deliberately no
 * self-claim or request path: ordinary members cannot turn this endpoint into
 * edit access for themselves, even when they omit `memberId` or send their own. */

const UNIDENTIFIED = NextResponse.json(
  { error: "Sign in to manage offering ownership" },
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
  const admin = await canManageOfferings();
  if (!admin) {
    return NextResponse.json(
      { error: "Only a workspace admin can assign offering owners" },
      { status: 403 }
    );
  }
  /**
   * A GRANT MUST NAME A REAL ACCOUNT.
   *
   * `local-anir-suren` is the placeholder identity used before a session is
   * bound to an app_users row. One of those got written as an owner, so the
   * offering listed "Anir Suren" as owner while the permission check compared
   * that placeholder against the real account id and failed. A row keyed to a string
   * that is not an account can never grant anything, so refuse to write one.
   */
  // Only where real accounts exist. In mock mode the local identity IS the
  // account, so demanding a UUID there breaks ownership entirely (it did:
  // twelve verification tests went red because the test session carries the
  // local id). Live mode is the one that must never store a placeholder.
  const body = (await req.json().catch(() => ({}))) as {
    memberId?: string;
    name?: string;
    email?: string | null;
  };

  const targetMemberId = (body.memberId || user.memberId).trim();
  if (isOfferingsOnly(getDataMode()) && !isRealAccountId(targetMemberId)) {
    return NextResponse.json(
      { error: "Choose a workspace member with a verified account" },
      { status: 400 }
    );
  }

  const assigningSelf = targetMemberId === user.memberId;
  const owner = {
    memberId: targetMemberId,
    name: assigningSelf
      ? user.name
      : (body.name || "").trim() || "Workspace member",
    email: assigningSelf ? user.email : body.email ?? null,
    status: "owner" as const,
    granted_by: user.memberId,
  };

  try {
    const saved = await commitOfferingsChange(() =>
      assignOfferingOwner(id, owner)
    );
    if (!saved) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({
      offering: redactAgentOnlyMaterials(
        hydrateOffering(saved),
        user.memberId
      ),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not assign this offering" },
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
    return NextResponse.json({
      offering: redactAgentOnlyMaterials(
        hydrateOffering(offering),
        user.memberId
      ),
    });
  }

  try {
    const saved = await commitOfferingsChange(() => releaseOffering(id, target));
    if (!saved) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({
      offering: redactAgentOnlyMaterials(
        hydrateOffering(saved),
        user.memberId
      ),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not release this offering" },
      { status: 500 }
    );
  }
}
