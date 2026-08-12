import type { UserIdentityRole } from "./userIdentity";

/**
 * WHO CAN OPEN WHICH MODULE (Freyr, Aug 12, via Anir).
 *
 *   Everyone (Sales Reps, Managers, Admins) — AI Agent, Offerings, Team.
 *   Managers and Admins only — FDL Components, Customers, Reports,
 *   Performance, Market Intel.
 *
 * Roles in this app: "sales" = Sales Rep, "editor" = Manager, "admin" =
 * Admin. This is a VISIBILITY *and* ACCESS rule: the sidebar hides what a rep
 * may not open, and every restricted page re-checks on the server, so typing
 * the URL is not a way in.
 */

export const MANAGER_ONLY_MODULES = [
  "/components",
  "/customers",
  "/reports",
  "/performance",
  "/market-intel",
] as const;

export function isManagerOrAdmin(role: UserIdentityRole): boolean {
  return role === "admin" || role === "editor";
}

/** Does this path belong to a manager-and-admin-only module? */
export function isManagerOnlyPath(path: string): boolean {
  return MANAGER_ONLY_MODULES.some(
    (m) => path === m || path.startsWith(`${m}/`) || path.startsWith(`${m}?`)
  );
}

/** The one question every nav item and every guarded page asks. */
export function canAccessModule(
  path: string,
  role: UserIdentityRole
): boolean {
  if (!isManagerOnlyPath(path)) return true;
  return isManagerOrAdmin(role);
}
