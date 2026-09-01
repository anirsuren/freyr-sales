import "server-only";

import { redirect } from "next/navigation";
import { getCurrentUser } from "./currentUser";
import {
  canAccessModule,
  canAccessModuleWith,
  canCreateModuleWith,
  canDeleteModuleWith,
  canWriteModuleWith,
} from "./moduleAccess";
import { moduleForPath } from "./privileges";
import {
  canDeleteRecord,
  canEditRecord,
  resolveScope,
  type ScopedRecord,
} from "./recordScope";
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
    return "You can look at this, but not change it.";
  return null;
}

/**
 * MAY THEY MAKE A NEW ONE? Owners only.
 *
 * Suren, Aug 29: "owner can create, member can edit." A member who can correct
 * every field on an existing record still cannot start a new one, so this is a
 * separate question from moduleWriteRefusal and a separate answer.
 */
export async function moduleCreateRefusal(path: string): Promise<string | null> {
  const [user, access] = await Promise.all([getCurrentUser(), viewerAccessMap()]);
  if (!canAccessModuleWith(path, user.role, access))
    return "Not available on this account.";
  if (!canCreateModuleWith(path, user.role, access))
    return "You can change these, but only an owner can make a new one.";
  return null;
}

/**
 * MAY THEY REMOVE ONE?
 *
 * "The person who can create only can delete. The edit person can only edit,
 * cannot delete." Deleting is the one thing that cannot be undone by editing
 * it back, which is why it sits with whoever could have created it.
 */
export async function moduleDeleteRefusal(path: string): Promise<string | null> {
  const [user, access] = await Promise.all([getCurrentUser(), viewerAccessMap()]);
  if (!canAccessModuleWith(path, user.role, access))
    return "Not available on this account.";
  if (!canDeleteModuleWith(path, user.role, access))
    return "Only an owner can delete this.";
  return null;
}

/**
 * MAY THEY CHANGE **THIS ONE**, not merely this kind of thing.
 *
 * The module helpers above answer for a module and every record in it alike,
 * which was the whole answer until Suren drew the second line (Sep 1): "you can
 * only do anything on a particular customer that you are part of or created or
 * edited so far... for other records that they are not part of, they should
 * have a view option."
 *
 * So a write now has to clear two gates and this asks both, in order. The
 * module first, because somebody who may not write here at all should be told
 * that rather than told whose record it is; then the record.
 *
 * HIDING THE BUTTON IS NOT THE CONTROL. Every write path calls this. A page
 * that draws no Edit control is a courtesy; this is the thing that actually
 * refuses, and it is why a curl with somebody else's cookie gets a 403 instead
 * of a save.
 */
export async function recordWriteRefusal(
  path: string,
  record: ScopedRecord
): Promise<string | null> {
  const moduleRefusal = await moduleWriteRefusal(path);
  if (moduleRefusal) return moduleRefusal;

  const moduleKey = moduleForPath(path);
  /* A path with no row in the privilege table is governed by the role rules
     alone, exactly as it was before any of this. See lib/privileges. */
  if (!moduleKey) return null;

  const scope = await resolveScope();
  if (canEditRecord(record, moduleKey, scope)) return null;
  return "This one is not yours, so you can look at it but not change it.";
}

/** The same question for removing it. */
export async function recordDeleteRefusal(
  path: string,
  record: ScopedRecord
): Promise<string | null> {
  const moduleRefusal = await moduleDeleteRefusal(path);
  if (moduleRefusal) return moduleRefusal;

  const moduleKey = moduleForPath(path);
  if (!moduleKey) return null;

  const scope = await resolveScope();
  if (canDeleteRecord(record, moduleKey, scope)) return null;
  return "This one is not yours, so you can look at it but not remove it.";
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
