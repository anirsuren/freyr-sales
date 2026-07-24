export type UserIdentityRole = "sales" | "editor" | "admin";

export type UserIdentity = {
  id: string;
  name: string;
  email: string | null;
  role: UserIdentityRole;
  title: string;
};

export const DEFAULT_LOCAL_USER_IDENTITY: UserIdentity = {
  id: "local-anir-suren",
  name: "Anir Suren",
  email: "anir.s@freyrsolutions.com",
  role: "admin",
  title: "Workspace Admin",
};

export const GENERIC_USER_IDENTITY: UserIdentity = {
  id: "freyr-user",
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
