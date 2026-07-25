import { cookies, headers } from "next/headers";
import { hasAppRole, parseAlbOidcPrincipal, parseEasyAuthPrincipal } from "./auth";
import { ACCESS_COOKIE, isApprovalGateEnabled, verifyAccessGrant } from "./accessControl";

// Workspace roles come from the signed access grant in every protected
// deployment. The browser-only role switch remains available solely in the
// unauthenticated local demo harness.
export type Role = "admin" | "editor" | "sales";

// Higher number = more privilege. Used so "view as" can only ever DOWNGRADE.
const ROLE_RANK: Record<Role, number> = { admin: 3, editor: 2, sales: 1 };

/**
 * "Viewing as" preview. An admin checking what the sales team sees is a real
 * need, but in authenticated deployments the role came exclusively from the
 * signed grant, so the switcher set its cookie and nothing changed — the
 * buttons simply did not work (Anir, Jul 25). The preview cookie is honored
 * only BELOW the authenticated role: it can never grant more than the session
 * itself carries, so a sales user writing `freyr_view_role=admin` by hand
 * still gets sales.
 */
function applyViewAs(base: Role, viewCookie: string | undefined): Role {
  if (viewCookie !== "admin" && viewCookie !== "editor" && viewCookie !== "sales")
    return base;
  return ROLE_RANK[viewCookie] < ROLE_RANK[base] ? viewCookie : base;
}

export async function getRole(): Promise<Role> {
  const store = await cookies();
  const viewAs = store.get("freyr_view_role")?.value;
  if (isApprovalGateEnabled()) {
    const grant = await verifyAccessGrant(store.get(ACCESS_COOKIE)?.value);
    if (grant) return applyViewAs(grant.role, viewAs);
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
    if (hasAppRole(principal, "Platform-Admins"))
      return applyViewAs("admin", viewAs);
    if (hasAppRole(principal, "Offering-Editors"))
      return applyViewAs("editor", viewAs);
    return "sales";
  }

  if (!process.env.AUTH_MODE) {
    // Demo harness (no authentication configured): the switcher IS the role.
    // This branch was dev-only (NODE_ENV check), which silently killed the
    // switcher on the production demo deployment too — the third way those
    // buttons did nothing.
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
