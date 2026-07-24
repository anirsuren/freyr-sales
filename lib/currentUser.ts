import "server-only";

import { cookies, headers } from "next/headers";
import {
  hasAppRole,
  parseAlbOidcPrincipal,
  parseEasyAuthPrincipal,
  type AuthenticatedUser,
} from "./auth";
import { APP_SESSION_COOKIE, verifyAppSession } from "./appSession";
import {
  ACCESS_COOKIE,
  isApprovalGateEnabled,
  verifyAccessGrant,
} from "./accessControl";
import {
  DEFAULT_LOCAL_USER_IDENTITY,
  GENERIC_USER_IDENTITY,
  titleForUserRole,
  type UserIdentity,
  type UserIdentityRole,
} from "./userIdentity";

function roleFromClaims(user: AuthenticatedUser): UserIdentityRole {
  if (hasAppRole(user, "Platform-Admins")) return "admin";
  if (hasAppRole(user, "Offering-Editors")) return "editor";
  return "sales";
}

function identityFromPrincipal(
  principal: AuthenticatedUser,
  role: UserIdentityRole,
  memberId: string | null = null
): UserIdentity {
  return {
    id: principal.id,
    memberId,
    name: principal.name.trim() || "Freyr user",
    email: principal.email?.trim() || null,
    role,
    title: titleForUserRole(role),
  };
}

/**
 * Resolve the current user only from identity material verified by the app or
 * the configured hosting provider. Browser storage and request query strings
 * are intentionally never identity sources.
 */
export async function getCurrentUser(): Promise<UserIdentity> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const authMode = process.env.AUTH_MODE;

  const principal =
    authMode === "supabase"
      ? await verifyAppSession(cookieStore.get(APP_SESSION_COOKIE)?.value)
      : authMode === "entra"
        ? parseEasyAuthPrincipal(headerStore.get("x-ms-client-principal"))
        : authMode === "aws-alb"
          ? parseAlbOidcPrincipal(
              headerStore.get("x-amzn-oidc-data"),
              headerStore.get("x-amzn-oidc-identity")
            )
          : null;

  if (principal) {
    let role = roleFromClaims(principal);
    let memberId: string | null = null;
    if (isApprovalGateEnabled()) {
      const grant = await verifyAccessGrant(
        cookieStore.get(ACCESS_COOKIE)?.value
      );
      if (grant?.sub === principal.id) {
        role = grant.role;
        memberId = grant.userId;
        if (grant.displayName) {
          principal.name = grant.displayName;
        }
      }
    }
    return identityFromPrincipal(principal, role, memberId);
  }

  // The named demo identity is appropriate only for an unauthenticated local
  // workspace. A protected or production deployment must not impersonate Anir
  // when its identity assertion is missing or invalid.
  if (process.env.NODE_ENV !== "production" && !authMode) {
    return DEFAULT_LOCAL_USER_IDENTITY;
  }
  return GENERIC_USER_IDENTITY;
}
