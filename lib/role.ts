import { cookies, headers } from "next/headers";
import { hasAppRole, parseAlbOidcPrincipal, parseEasyAuthPrincipal } from "./auth";
import { ACCESS_COOKIE, isApprovalGateEnabled, verifyAccessGrant } from "./accessControl";

// Two user types for the Offerings module (Suren's change #4): an admin who can
// edit/update data, and a sales (regular) user who can only view it. Mock-first:
// the active role lives in a cookie that an in-app switcher flips. Wiring this to
// real per-user logins is a later step.
export type Role = "admin" | "editor" | "sales";

export async function getRole(): Promise<Role> {
  const store = await cookies();
  if (isApprovalGateEnabled()) {
    const grant = await verifyAccessGrant(store.get(ACCESS_COOKIE)?.value);
    if (grant) return grant.role;
  }

  const headerStore = await headers();
  const principal =
    parseEasyAuthPrincipal(headerStore.get("x-ms-client-principal")) ||
    parseAlbOidcPrincipal(
      headerStore.get("x-amzn-oidc-data"),
      headerStore.get("x-amzn-oidc-identity")
  );
  if (principal) {
    if (hasAppRole(principal, "Platform-Admins")) return "admin";
    if (hasAppRole(principal, "Offering-Editors")) return "editor";
    return "sales";
  }

  const role = store.get("freyr_role")?.value;
  return role === "sales" || role === "editor" ? role : "admin";
}

export async function isAdmin(): Promise<boolean> {
  return (await getRole()) === "admin";
}

export async function canManageOfferings(): Promise<boolean> {
  const role = await getRole();
  return role === "admin" || role === "editor";
}
