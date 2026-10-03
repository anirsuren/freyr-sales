import "server-only";

import { getCurrentUser } from "./currentUser";
import { moduleWriteRefusal } from "./moduleAccessServer";
import { isOfferingOwner, type Offering } from "./offerings";

/**
 * WHO MAY EDIT AN OFFERING.
 *
 * An account may edit an offering only when its module privilege permits
 * writing and an admin has assigned it as one of the offering's owners.
 *
 * Ownership is a RECORD, not a resemblance. The check is an exact match on
 * `memberId`, the stable app_users id of the signed-in account (Anir, Jul 28:
 * An earlier pass matched the
 * signed-in person's display name against the offering's `poc` string from
 * Suren's spreadsheet, which is not access control: two people can share a
 * name, a sheet can carry a typo, and renaming a POC would silently move
 * permissions. `poc` is now purely the contact printed on the card.
 *
 * Deliberately narrow: assignment to Freya.Register grants no module privilege
 * on its own. It does not reach other offerings, master lists, or deletion.
 */
export async function canEditOffering(
  offering: Pick<Offering, "owners"> | null | undefined
): Promise<boolean> {
  if (!offering) return false;
  // Ownership is necessary, but a View-only module grant must still win.
  // Keep this in the shared predicate so uploads, contacts and transcripts
  // cannot bypass the same gate used by the main offering PATCH route.
  if (await moduleWriteRefusal("/offerings")) return false;
  const user = await getCurrentUser();
  // ADMINS CAN EDIT EVERY OFFERING (Anir, Aug 6: "if I'm an admin I
  // [should] be able to check and test the edit level features across the
  // app"). For everyone else, ownership is the only key: an admin-assigned
  // record, matched on the stable memberId — never a name resemblance.
  if (user.role === "admin") return true;
  return isOfferingOwner(offering, user.memberId);
}
