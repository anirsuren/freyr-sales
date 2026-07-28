import "server-only";

import { getRole } from "./role";
import { getCurrentUser } from "./currentUser";
import { GENERIC_USER_IDENTITY } from "./userIdentity";
import { ownsOffering } from "./offeringOwnershipMatch";

export { ownsOffering, pocNames } from "./offeringOwnershipMatch";

/**
 * WHO MAY EDIT AN OFFERING.
 *
 * Workspace admins and Offering-Editors may edit every offering, as before. On
 * top of that, the person who OWNS an offering may edit THAT offering, even
 * though their workspace role is only "sales" (Anir, Jul 28: "make sure that
 * someone can edit the content of the Freyr.Register offering page to upload
 * his sales materials, etc., if he owns that offering").
 *
 * Deliberately narrow: owning Freya.Register lets you edit Freya.Register and
 * nothing else. It is not a promotion to editor, it does not reach the master
 * lists, and it does not let you delete the offering.
 */
export async function canEditOffering(
  poc: string | null | undefined
): Promise<boolean> {
  const role = await getRole();
  if (role === "admin" || role === "editor") return true;
  const user = await getCurrentUser();
  return ownsOffering(poc, {
    name: user.name,
    email: user.email,
    isIdentified: user.id !== GENERIC_USER_IDENTITY.id,
  });
}
