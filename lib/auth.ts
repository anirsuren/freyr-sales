export type AuthenticatedUser = {
  id: string;
  name: string;
  email: string | null;
  roles: string[];
};

type EasyAuthClaim = { typ?: string; val?: string };
type EasyAuthPrincipal = {
  userId?: string;
  userDetails?: string;
  claims?: EasyAuthClaim[];
};

const ROLE_CLAIMS = new Set([
  "roles",
  "http://schemas.microsoft.com/ws/2008/06/identity/claims/role",
  "groups",
]);

/** Parse the identity asserted by Azure App Service Authentication (Easy Auth). */
export function parseEasyAuthPrincipal(
  encoded: string | null | undefined
): AuthenticatedUser | null {
  if (!encoded) return null;
  try {
    const raw = Buffer.from(encoded, "base64").toString("utf8");
    const principal = JSON.parse(raw) as EasyAuthPrincipal;
    const claims = Array.isArray(principal.claims) ? principal.claims : [];
    const claim = (suffix: string) =>
      claims.find((item) => item.typ === suffix || item.typ?.endsWith(`/${suffix}`))
        ?.val;
    const roles = claims
      .filter((item) => item.typ && ROLE_CLAIMS.has(item.typ))
      .flatMap((item) => (item.val || "").split(","))
      .map((role) => role.trim())
      .filter(Boolean);
    const id = principal.userId || claim("nameidentifier") || claim("oid");
    if (!id) return null;
    return {
      id,
      name: principal.userDetails || claim("name") || "Freyr user",
      email:
        claim("emailaddress") || claim("preferred_username") ||
        principal.userDetails || null,
      roles,
    };
  } catch {
    return null;
  }
}

export function hasAppRole(user: AuthenticatedUser, role: string): boolean {
  const expected = role.toLowerCase();
  return user.roles.some((value) => value.toLowerCase() === expected);
}

/** Parse claims already authenticated and signed by an AWS ALB OIDC action. */
export function parseAlbOidcPrincipal(
  encodedJwt: string | null | undefined,
  identity: string | null | undefined
): AuthenticatedUser | null {
  if (!encodedJwt || !identity) return null;
  try {
    const payload = encodedJwt.split(".")[1];
    if (!payload) return null;
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const rawRoles = claims.roles || claims.groups || [];
    const roles = Array.isArray(rawRoles)
      ? rawRoles.map(String)
      : String(rawRoles).split(",").map((value) => value.trim()).filter(Boolean);
    return {
      id: identity,
      name: claims.name || claims.preferred_username || claims.email || "Freyr user",
      email: claims.email || claims.preferred_username || null,
      roles,
    };
  } catch {
    return null;
  }
}
