import { cookies, headers } from "next/headers";
import { hasAppRole, parseAlbOidcPrincipal, parseEasyAuthPrincipal } from "./auth";
import { ACCESS_COOKIE, isApprovalGateEnabled, normalizeWorkspaceRole, verifyAccessGrant } from "./accessControl";

// Workspace roles come from the signed access grant in every protected
// deployment. The browser-only role switch remains available solely in the
// unauthenticated local demo harness.
export type Role = "admin" | "manager" | "rep";

// Higher number = more privilege. Used so "view as" can only ever DOWNGRADE.
const ROLE_RANK: Record<Role, number> = { admin: 3, manager: 2, rep: 1 };

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
  // Session cookies written before the rename may still say "editor"/"sales".
  const wanted = normalizeWorkspaceRole(viewCookie);
  if (!wanted) return base;
  return ROLE_RANK[wanted] < ROLE_RANK[base] ? wanted : base;
}

/**
 * COOKIE NAMES ARE VERSIONED, AND THAT IS THE FIX.
 *
 * The old role switcher wrote `freyr_role` / `freyr_view_role` with a ONE
 * YEAR max-age and nothing on screen ever said a preview was active — so an
 * admin who once clicked "Sales (view only)" stayed silently downgraded on
 * every page until they hand-cleared cookies (Anir, Jul 30: "I'm an admin,
 * right? Why can't I create folders?"). Nobody can be asked to fix that in
 * their own browser, so the READ side moved to new names and the stale
 * year-long cookies became inert for everyone in one deploy. The switcher now
 * writes session-lived cookies, and PreviewBanner keeps an active preview
 * visible with a one-click exit.
 */
export async function getRole(): Promise<Role> {
  return (await getRoleInfo()).role;
}

/** The effective role AND the real one, so the UI can show "viewing as". */
export async function getRoleInfo(): Promise<{ role: Role; realRole: Role }> {
  const store = await cookies();
  const viewAs = store.get("freyr_preview_role")?.value;
  if (isApprovalGateEnabled()) {
    const grant = await verifyAccessGrant(store.get(ACCESS_COOKIE)?.value);
    if (grant)
      return { role: applyViewAs(grant.role, viewAs), realRole: grant.role };
    // Protected deployments must never turn a missing or invalid grant into
    // administrator access.
    return { role: "rep", realRole: "rep" };
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
      return { role: applyViewAs("admin", viewAs), realRole: "admin" };
    if (hasAppRole(principal, "Offering-Editors"))
      return { role: applyViewAs("manager", viewAs), realRole: "manager" };
    return { role: "rep", realRole: "rep" };
  }

  if (!process.env.AUTH_MODE) {
    // Demo harness (no authentication configured): the switcher IS the role,
    // and its identity defaults to admin.
    const role = normalizeWorkspaceRole(store.get("freyr_as_role")?.value);
    return {
      role: role === "rep" || role === "manager" ? role : "admin",
      realRole: "admin",
    };
  }
  return { role: "rep", realRole: "rep" };
}

export async function isAdmin(): Promise<boolean> {
  return (await getRole()) === "admin";
}

export async function canManageOfferings(): Promise<boolean> {
  const role = await getRole();
  return role === "admin" || role === "manager";
}

/** Compliance queue and workspace-wide outreach actions are manager-level.
 * Individual sales reps may submit their own work, but cannot approve or send
 * the entire workspace queue. */
export async function canManageReviewQueue(): Promise<boolean> {
  const role = await getRole();
  return role === "admin" || role === "manager";
}
