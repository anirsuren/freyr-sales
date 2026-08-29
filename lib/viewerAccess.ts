import "server-only";

import { cache } from "react";
import { getCurrentUser } from "./currentUser";
import { getRole } from "./role";
import { readPerformance } from "./performance";
import {
  accessMapFor,
  readPrivileges,
  type Access,
  type ModuleKey,
} from "./privileges";

/**
 * WHAT THE PERSON IN FRONT OF US MAY DO, RESOLVED ONCE.
 *
 * Suren, Aug 29: "these are the roles from now on. I need this executed."
 *
 * Three reads go into one answer — who they are, the privilege table, and the
 * groups they belong to — and every guard on the request needs the same
 * answer. React's `cache` makes the whole thing one round trip per request no
 * matter how many pages, layouts and routes ask.
 *
 * RETURNS NULL WHEN THE TABLE IS NOT THE AUTHORITY. Two ways that happens:
 * the admin has not switched enforcement on, or the table could not be read at
 * all. Both mean the same thing to every caller — fall back to the role rules
 * in lib/moduleAccess — and both are deliberate: a permissions table that
 * cannot be loaded must not become a permissions table that denies everything.
 * A workspace locked out by a Supabase blip is a worse failure than one that
 * kept yesterday's rules for a minute.
 *
 * THE PREVIEW IS HONOURED. `getRole()` applies the view-as downgrade, so an
 * admin previewing as a BD Member resolves a BD Member's map and sees exactly
 * what that person would. It can only ever downgrade — see lib/role.
 */
export type ViewerAccess = {
  access: Record<ModuleKey, Access>;
  /** The role the map was built for, after any view-as downgrade. */
  role: string;
};

export const resolveViewerAccess = cache(
  async (): Promise<ViewerAccess | null> => {
    try {
      const [me, role, privileges] = await Promise.all([
        getCurrentUser(),
        getRole(),
        readPrivileges(),
      ]);
      if (!privileges.enforced) return null;

      /* Only read the groups when the table actually uses them. Nobody holds a
         group privilege on day one, and this saves a second store read on
         every request until somebody does. */
      const usesGroups = Object.keys(privileges.groupPrivileges).length > 0;
      const groups = usesGroups
        ? (await readPerformance().catch(() => null))?.groups ?? []
        : [];

      return {
        access: accessMapFor({
          state: privileges,
          role,
          person: me.name,
          groups,
        }),
        role,
      };
    } catch {
      return null;
    }
  }
);

/** Just the map, for callers that do not care which role produced it. */
export async function viewerAccessMap(): Promise<Record<
  ModuleKey,
  Access
> | null> {
  return (await resolveViewerAccess())?.access ?? null;
}
