import "server-only";
import { cache } from "react";
import { privilegesForPerson, readPrivileges } from "./privileges";

/**
 * THE ADMIN PRIVILEGE MAKES YOU AN ADMIN (Anir, Sep 8: "why am I the only
 * one who can add a customer, Manoj can't?" — and then "fix it all").
 *
 * The privileges screen lets a person be handed "admin" as a privilege, and
 * Manoj holds it, alongside bd_owner. But every gate that asked "is this an
 * admin" — isAdmin() on six API routes, getRole() === "admin" behind the
 * settings page, the invite button, group management, targets — read the
 * app_users role string and nothing else. So the privilege bought nothing:
 * the checkbox said admin, the doors said no. The same shape as the
 * Customers button and the Offerings gate before it, one level up.
 *
 * Fixed at the source instead of at nine doors: the role a request resolves
 * to is lifted to "admin" when the person holds the admin privilege. Both
 * resolvers (getRoleInfo, which feeds pages and the client, and
 * getCurrentUser, which feeds API routes) go through liftToAdmin, so there
 * is one answer to "is this person an admin" wherever it is asked.
 *
 * Cached per request: one read of the privileges row, however many gates
 * ask. Nothing is lifted for a person without the privilege, and a forged
 * or expired grant never reaches here.
 */
export const holdsAdminPrivilege = cache(
  async (displayName: string | null | undefined): Promise<boolean> => {
    const name = displayName?.trim();
    if (!name) return false;
    try {
      const state = await readPrivileges();
      return privilegesForPerson(state, name).includes("admin");
    } catch {
      return false;
    }
  }
);

export async function liftToAdmin<R extends string>(
  role: R,
  displayName: string | null | undefined
): Promise<R | "admin"> {
  if (role === "admin") return role;
  return (await holdsAdminPrivilege(displayName)) ? "admin" : role;
}
