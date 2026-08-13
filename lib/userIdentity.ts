export type UserIdentityRole = "rep" | "manager" | "admin";

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
  role: "rep",
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
export function titleForUserRole(role: UserIdentityRole): string {
  if (role === "admin") return "Admin";
  if (role === "manager") return "Manager";
  return "Rep";
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
