import "server-only";

import { getRole } from "./role";
import { getCurrentUser } from "./currentUser";
import { isOfferingOwner, type Offering } from "./offerings";

/**
 * WHO MAY EDIT AN OFFERING.
 *
 * Workspace admins and Offering-Editors may edit every offering. On top of that,
 * an account that has CLAIMED an offering may edit that one.
 *
 * Ownership is a RECORD, not a resemblance. The check is an exact match on
 * `memberId`, the stable app_users id of the signed-in account (Anir, Jul 28:
 * "shouldn't it be based on the account, so someone has to claim the offering...
 * this is a full enterprise-level application"). An earlier pass matched the
 * signed-in person's display name against the offering's `poc` string from
 * Suren's spreadsheet, which is not access control: two people can share a
 * name, a sheet can carry a typo, and renaming a POC would silently move
 * permissions. `poc` is now purely the contact printed on the card.
 *
 * Deliberately narrow: claiming Freya.Register grants Freya.Register and
 * nothing else. It is not a promotion to editor, it does not reach the master
 * lists, and it does not permit deleting the offering.
 */
export async function canEditOffering(
  offering: Pick<Offering, "owners"> | null | undefined
): Promise<boolean> {
  const role = await getRole();
  if (role === "admin" || role === "editor") return true;
  if (!offering) return false;
  const user = await getCurrentUser();
  return isOfferingOwner(offering, user.memberId);
}

/**
 * May the signed-in account claim this offering for itself? Only a verified
 * workspace account can, and only when it does not already own it. Claiming is
 * self-service by design so an owner can start work without waiting on an admin
 * grant; admins can additionally assign and revoke on someone else's behalf.
 */
export async function canClaimOffering(
  offering: Pick<Offering, "owners"> | null | undefined
): Promise<boolean> {
  if (!offering) return false;
  const user = await getCurrentUser();
  if (!user.memberId) return false;
  return !isOfferingOwner(offering, user.memberId);
}
