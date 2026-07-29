import "server-only";

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
  // OWNERSHIP IS THE ONLY KEY, for everybody. A workspace admin does not get to
  // edit an offering merely by being an admin (Anir, Jul 28: "the edit offering
  // button shouldn't even open up until I take ownership"). What being an admin
  // buys you is the RIGHT TO TAKE IT: an admin's own claim is granted on the
  // spot, and they can assign or revoke anyone else's. So the rule a person
  // reads on screen is the rule the server enforces, with no invisible
  // exception for whoever happens to hold the admin role.
  if (!offering) return false;
  const user = await getCurrentUser();
  return isOfferingOwner(offering, user.memberId);
}

/**
 * May the signed-in account ASK for this offering? Any verified workspace
 * account may, and only when it does not already own it — but asking is all it
 * is. Ownership itself is granted by an admin (see the owners route): a rep who
 * signs up gets read access and a request button, never write access (Wajeed,
 * Jul 29: "10-15 sales people will be registering... we only want them to have
 * viewing access and nothing else").
 */
export async function canClaimOffering(
  offering: Pick<Offering, "owners"> | null | undefined
): Promise<boolean> {
  if (!offering) return false;
  const user = await getCurrentUser();
  if (!user.memberId) return false;
  return !isOfferingOwner(offering, user.memberId);
}
