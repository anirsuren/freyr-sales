import { cookies, headers } from "next/headers";
import { hasAppRole, parseAlbOidcPrincipal, parseEasyAuthPrincipal } from "./auth";
import { ACCESS_COOKIE, isApprovalGateEnabled, normalizeWorkspaceRole, verifyAccessGrant } from "./accessControl";

// Workspace roles come from the signed access grant in every protected
// deployment. The browser-only role switch remains available solely in the
// unauthenticated local demo harness.
/** One vocabulary with lib/accessControl WorkspaceRole — see the note there. */
export type Role = "admin" | "bd_owner" | "bd_member" | "sol_member";

// Higher number = more privilege. Used so "view as" can only ever DOWNGRADE.
// Solutioning Member sits beside BD Member, not above it: fulfilling requests
// grants nothing extra anywhere else in the app.
const ROLE_RANK: Record<Role, number> = {
  admin: 3,
  bd_owner: 2,
  bd_member: 1,
  sol_member: 1,
};

/**
 * "Viewing as" preview. An admin checking what the sales team sees is a real
 * need, but in authenticated deployments the role came exclusively from the
 * signed grant, so the switcher set its cookie and nothing changed — the
 * buttons simply did not work (Anir, Jul 25). The preview cookie is honored
 * only BELOW the authenticated role: it can never grant more than the session
 * itself carries, so a sales user writing `freyr_view_role=admin` by hand
 * still gets sales.
 */
function applyViewAs(base: Role, _viewCookie: string | undefined): Role {
  /**
   * ROLE PREVIEW IS OFF, AND THE COOKIE IS IGNORED (Anir, Aug 30: "I clicked
   * View as BD member, but now it doesn't let me switch"... "I don't even want
   * that, I can create other accounts").
   *
   * It was a one-way door by construction. The control that set it rendered
   * only for admins, so the first click removed the control that would undo
   * it, and the only remedy was deleting a cookie by hand — the exact failure
   * this file's own history describes happening once already with the older
   * `freyr_view_role`, fixed then by renaming the cookie rather than by
   * removing the mechanism.
   *
   * Renaming it again would buy the same year of quiet. Ignoring it here means
   * a stale cookie in anybody's browser — from this build or the last one —
   * stops mattering the moment they load a page, with nothing for them to
   * clear. Real accounts test roles honestly and cannot strand anyone.
   */
  return base;
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

/** The workspace role behind an email, for the local persona override. */
async function roleForLocalPersona(email: string): Promise<Role | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  try {
    const res = await fetch(
      `${url}/rest/v1/app_users?email=eq.${encodeURIComponent(email.toLowerCase())}&active=eq.true&select=app_role`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" }
    );
    const rows = (await res.json()) as { app_role?: string }[];
    const raw = rows?.[0]?.app_role;
    return raw === "admin" ? "admin" : raw === "bd_owner" ? "bd_owner" : raw === "bd_member" ? "bd_member" : raw === "sol_member" ? "sol_member" : null;
  } catch {
    return null;
  }
}

export async function getRoleInfo(): Promise<{ role: Role; realRole: Role }> {
  const store = await cookies();
  const viewAs = store.get("freyr_preview_role")?.value;
  if (isApprovalGateEnabled()) {
    const grant = await verifyAccessGrant(store.get(ACCESS_COOKIE)?.value);
    if (grant)
      return { role: applyViewAs(grant.role, viewAs), realRole: grant.role };
    // Protected deployments must never turn a missing or invalid grant into
    // administrator access.
    return { role: "bd_member", realRole: "bd_member" };
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
      return { role: applyViewAs("bd_owner", viewAs), realRole: "bd_owner" };
    return { role: "bd_member", realRole: "bd_member" };
  }

  if (!process.env.AUTH_MODE) {
    /**
     * The local persona override wins here too. `getCurrentUser()` honours
     * FREYR_LOCAL_IDENTITY_EMAIL, and the shell is handed THIS role: with only
     * one of the two switched, a local rep session drew an admin sidebar whose
     * links all bounced back to Offerings. Same fence as the identity itself —
     * local, unauthenticated sessions only.
     */
    const asEmail = process.env.FREYR_LOCAL_IDENTITY_EMAIL?.trim();
    if (asEmail) {
      const persona = await roleForLocalPersona(asEmail);
      if (persona) return { role: applyViewAs(persona, viewAs), realRole: persona };
    }
    // Demo harness (no authentication configured): the switcher IS the role,
    // and its identity defaults to admin.
    const role = normalizeWorkspaceRole(store.get("freyr_as_role")?.value);
    return {
      role: role === "bd_member" || role === "bd_owner" ? role : "admin",
      realRole: "admin",
    };
  }
  return { role: "bd_member", realRole: "bd_member" };
}

export async function isAdmin(): Promise<boolean> {
  return (await getRole()) === "admin";
}

export async function canManageOfferings(): Promise<boolean> {
  const role = await getRole();
  return role === "admin" || role === "bd_owner";
}

/** Compliance queue and workspace-wide outreach actions are manager-level.
 * Individual sales reps may submit their own work, but cannot approve or send
 * the entire workspace queue. */
export async function canManageReviewQueue(): Promise<boolean> {
  const role = await getRole();
  return role === "admin" || role === "bd_owner";
}
