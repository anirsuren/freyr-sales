import "server-only";

import { redirect } from "next/navigation";
import { getCurrentUser } from "./currentUser";
import { canAccessModule, canAccessModuleWith, canWriteModuleWith } from "./moduleAccess";
import { viewerAccessMap } from "./viewerAccess";

/**
 * THE DOOR, not the curtain. The sidebar hides modules a person may not open;
 * this sends them home if they type the URL anyway (Freyr, Aug 12). Every
 * restricted page calls it before it reads any data.
 *
 * WHAT DECIDES, SINCE AUG 29. When the privilege table is being enforced it is
 * the authority — Suren: "these are the roles from now on, I need this
 * executed." When it is not, or when it could not be read, this is exactly the
 * role rule it always was. One function, so a page cannot be guarded by the
 * old rules and the new ones at the same time.
 */
export async function requireModuleAccess(path: string): Promise<void> {
  const [user, access] = await Promise.all([getCurrentUser(), viewerAccessMap()]);
  if (!canAccessModuleWith(path, user.role, access)) redirect("/offerings");
}

/**
 * MAY THEY CHANGE IT, not merely see it.
 *
 * The distinction his sheet is built on — "in a customer module, the BO owner
 * privileged guy cannot write, can only read" — and the one the app had no way
 * to express: until now, opening a module and editing it were the same bit.
 *
 * Returns a reason rather than throwing so an API route can answer 403 with
 * something a person can act on. Null means allowed.
 */
export async function moduleWriteRefusal(path: string): Promise<string | null> {
  const [user, access] = await Promise.all([getCurrentUser(), viewerAccessMap()]);
  if (!canAccessModuleWith(path, user.role, access))
    return "Not available on this account.";
  if (!canWriteModuleWith(path, user.role, access))
    return "You can read this, but not change it.";
  return null;
}

/** The page-side twin: read-only visitors are sent away from an editor. */
export async function requireModuleWrite(path: string): Promise<void> {
  if (await moduleWriteRefusal(path)) redirect(path);
}

/** Unchanged, for the handful of callers that only have a role in hand. */
export { canAccessModule };

/**
 * THE READ CHECK AN API ROUTE SHOULD USE.
 *
 * The route-level guards predate the privilege table and each one asked
 * `canAccessModule(path, role)` — the old rules — which meant a person the
 * table allowed was still refused by the route, and the two systems gave
 * different answers to the same question (found switching enforcement on, Aug
 * 29: a BD Member the table grants Meetings write was told "Not available on
 * this account" by the route's own guard).
 *
 * One question, one answer, whichever system is in charge.
 */
export async function canOpenModule(path: string): Promise<boolean> {
  const [user, access] = await Promise.all([getCurrentUser(), viewerAccessMap()]);
  return canAccessModuleWith(path, user.role, access);
}
