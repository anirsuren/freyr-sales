export type UserIdentityRole = "sales" | "editor" | "admin";

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
  title: "Workspace Admin",
};

export const GENERIC_USER_IDENTITY: UserIdentity = {
  id: "freyr-user",
  memberId: null,
  name: "Freyr user",
  email: null,
  role: "sales",
  title: "Workspace User",
};

export function titleForUserRole(role: UserIdentityRole): string {
  if (role === "admin") return "Workspace Admin";
  if (role === "editor") return "Offering Editor";
  return "Sales Representative";
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
