export type UserIdentityRole = "bd_member" | "bd_owner" | "admin" | "sol_member";

export type UserIdentity = {
  id: string;
  /** Stable app_users id used for persisted workspace ownership. The primary
   * `id` remains the verified provider subject used for browser-local state. */
  memberId?: string | null;
  name: string;
  email: string | null;
  role: UserIdentityRole;
  title: string;
};

export const DEFAULT_LOCAL_USER_IDENTITY: UserIdentity = {
  id: "local-anir-suren",
  memberId: "local-anir-suren",
  name: "Anir Suren",
  email: "anir.s@freyrsolutions.com",
  role: "admin",
  title: "Admin",
};

export const GENERIC_USER_IDENTITY: UserIdentity = {
  id: "freyr-user",
  memberId: null,
  name: "Freyr user",
  email: null,
  role: "bd_member",
  title: "Workspace User",
};

/**
 * There are exactly three roles and each has ONE name — Admin, Manager, Rep
 * (Anir, Jul 30). This used to answer "Workspace Admin" / "Offering Editor" /
 * "Sales Representative" while the invite form said Admin / Manager / Rep and
 * the member directory said Admin / Catalog editor / Sales rep, so the same
 * person had three different job titles depending on which screen you opened.
 *
 * components/ui/RoleTag.tsx holds the colour and icon for the same three; this
 * stays a plain string for the places that need text (page titles, alt text).
 */
/**
 * WHAT THIS PERSON IS CALLED (Suren, Aug 29: "sales rep is now bd member,
 * owner is the new manager"). Same four stored values, the privilege
 * vocabulary in front of them — see components/ui/RoleTag for the whole map.
 */
export function titleForUserRole(role: UserIdentityRole): string {
  if (role === "admin") return "Admin";
  if (role === "bd_owner") return "Owner";
  if (role === "sol_member") return "Solutioning Member";
  return "BD Member";
}

export function firstNameForUser(user: Pick<UserIdentity, "name">): string {
  return user.name.trim().split(/\s+/)[0] || "there";
}

/** Keep browser-persisted personal state separate when multiple people use the
 * same browser profile. The verified subject id is stable and never comes from
 * editable profile fields. */
export function userScopedStorageKey(base: string, userId: string): string {
  return `${base}:${encodeURIComponent(userId)}`;
}
