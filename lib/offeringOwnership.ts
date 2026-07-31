import "server-only";

import { getCurrentUser } from "./currentUser";
import { isOfferingOwner, type Offering } from "./offerings";

/**
 * WHO MAY EDIT AN OFFERING.
 *
 * An account may edit an offering only when an admin has assigned that account
 * as one of the offering's owners.
 *
 * Ownership is a RECORD, not a resemblance. The check is an exact match on
 * `memberId`, the stable app_users id of the signed-in account (Anir, Jul 28:
 * An earlier pass matched the
 * signed-in person's display name against the offering's `poc` string from
 * Suren's spreadsheet, which is not access control: two people can share a
 * name, a sheet can carry a typo, and renaming a POC would silently move
 * permissions. `poc` is now purely the contact printed on the card.
 *
 * Deliberately narrow: assignment to Freya.Register grants Freya.Register and
 * nothing else. It is not a promotion to editor, it does not reach the master
 * lists, and it does not permit deleting the offering.
 */
export async function canEditOffering(
  offering: Pick<Offering, "owners"> | null | undefined
): Promise<boolean> {
  // OWNERSHIP IS THE ONLY KEY, for everybody. Workspace admin is the authority
  // that assigns the key; it is not itself an implicit edit grant.
  if (!offering) return false;
  const user = await getCurrentUser();
  return isOfferingOwner(offering, user.memberId);
}
