import { isManagerOrAdmin } from "@/lib/moduleAccess";
import type { UserIdentityRole } from "@/lib/userIdentity";

/**
 * WHO MAY CHANGE AN EXISTING DEAL. One rule, asked in two places: the
 * opportunities route when the change arrives, and the agent before it asks
 * the person to confirm a change the route would only refuse. Managers and
 * admins always; otherwise the owner, matched by name the way the record
 * stores it (Anir, Aug: the creator is stamped as owner and only an admin can
 * reassign it, so the name IS the ownership).
 */
export const OPPORTUNITY_NOT_YOURS = "Only its owner, or a manager, can change this opportunity.";

export function opportunityChangeRefusal(
  target: { owner?: string | null },
  me: { name: string; role: UserIdentityRole }
): string | null {
  if (isManagerOrAdmin(me.role)) return null;
  const mine = !!target.owner && target.owner.trim().toLowerCase() === me.name.trim().toLowerCase();
  return mine ? null : OPPORTUNITY_NOT_YOURS;
}
