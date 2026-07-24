import { cookies, headers } from "next/headers";
import { hasAppRole, parseAlbOidcPrincipal, parseEasyAuthPrincipal } from "./auth";
import { ACCESS_COOKIE, isApprovalGateEnabled, verifyAccessGrant } from "./accessControl";

// Workspace roles come from the signed access grant in every protected
// deployment. The browser-only role switch remains available solely in the
// unauthenticated local demo harness.
export type Role = "admin" | "editor" | "sales";

export async function getRole(): Promise<Role> {
  const store = await cookies();
  if (isApprovalGateEnabled()) {
    const grant = await verifyAccessGrant(store.get(ACCESS_COOKIE)?.value);
    if (grant) return grant.role;
    // Protected deployments must never turn a missing or invalid grant into
    // administrator access.
    return "sales";
  }

  const headerStore = await headers();
  const principal =
    process.env.AUTH_MODE === "entra"
      ? parseEasyAuthPrincipal(headerStore.get("x-ms-client-principal"))
      : process.env.AUTH_MODE === "aws-alb"
        ? parseAlbOidcPrincipal(
            headerStore.get("x-amzn-oidc-data"),
            headerStore.get("x-amzn-oidc-identity")
          )
        : null;
  if (principal) {
    if (hasAppRole(principal, "Platform-Admins")) return "admin";
    if (hasAppRole(principal, "Offering-Editors")) return "editor";
    return "sales";
  }

  if (process.env.NODE_ENV !== "production" && !process.env.AUTH_MODE) {
    const role = store.get("freyr_role")?.value;
    return role === "sales" || role === "editor" ? role : "admin";
  }
  return "sales";
}

export async function isAdmin(): Promise<boolean> {
  return (await getRole()) === "admin";
}

export async function canManageOfferings(): Promise<boolean> {
  const role = await getRole();
  return role === "admin" || role === "editor";
}

/** Compliance queue and workspace-wide outreach actions are manager-level.
 * Individual sales reps may submit their own work, but cannot approve or send
 * the entire workspace queue. */
export async function canManageReviewQueue(): Promise<boolean> {
  const role = await getRole();
  return role === "admin" || role === "editor";
}
