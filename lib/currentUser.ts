import "server-only";

import { cookies, headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { hasSupabase } from "./env";
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
  if (hasAppRole(user, "Offering-Editors")) return "bd_owner";
  return "bd_member";
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
    // Bind the local identity to the REAL workspace account behind that email.
    // Ownership is keyed on the account id, so without this the local session
    // carries a placeholder id that matches nothing and the app tells the very
    // person who owns an offering to "Take ownership" of it (Anir, Jul 29:
    // "I'm in this account and it doesn't recognize that I'm the one who owns
    // it"). Prod already resolves the id from the signed grant; this makes a
    // developer's session behave the same way instead of near-enough.
    /**
     * A SECOND PERSONA, FOR TESTING ONLY. Two accounts have to be driven side
     * by side to prove that what an admin does is what a rep sees (Anir,
     * Aug 19: "you have one account with my admin access and another account
     * with my other thing… you have to do it in Chrome"). This branch is
     * already fenced to a local, unauthenticated workspace: production and any
     * deployment carrying an AUTH_MODE never reaches it, so no real deployment
     * can be talked into wearing someone else's name.
     */
    const asEmail = process.env.FREYR_LOCAL_IDENTITY_EMAIL?.trim();
    if (asEmail) {
      const member = await memberForEmail(asEmail);
      if (member) {
        return {
          id: member.id,
          memberId: member.id,
          name: member.name,
          email: member.email,
          role: member.role,
          title: titleForUserRole(member.role),
        };
      }
    }
    const memberId = await memberIdForEmail(DEFAULT_LOCAL_USER_IDENTITY.email);
    return memberId
      ? { ...DEFAULT_LOCAL_USER_IDENTITY, memberId }
      : DEFAULT_LOCAL_USER_IDENTITY;
  }
  return GENERIC_USER_IDENTITY;
}

/**
 * The workspace account id registered against an email address, or null when
 * there is no such member. Cached for the life of the process: a member's id
 * never changes, and this sits on every request.
 */

/** The workspace row behind an email, for the local persona override above. */
async function memberForEmail(email: string): Promise<{
  id: string;
  name: string;
  email: string;
  role: UserIdentityRole;
} | null> {
  if (!hasSupabase()) return null;
  try {
    const { data } = await createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
      .from("app_users")
      .select("id,display_name,email,app_role")
      .eq("email", email.toLowerCase())
      .eq("active", true)
      .maybeSingle();
    if (!data?.id) return null;
    const raw = String(data.app_role ?? "bd_member");
    const role = raw === "admin" ? "admin" : raw === "bd_owner" ? "bd_owner" : "bd_member";
    return {
      id: String(data.id),
      name: String(data.display_name ?? email),
      email: String(data.email ?? email),
      role: role as UserIdentityRole,
    };
  } catch {
    return null;
  }
}

export async function memberIdForEmail(email: string | null): Promise<string | null> {
  if (!email || !hasSupabase()) return null;
  const key = email.toLowerCase();
  if (!globalThis.__FREYR_MEMBER_ID_BY_EMAIL__)
    globalThis.__FREYR_MEMBER_ID_BY_EMAIL__ = new Map();
  const cache = globalThis.__FREYR_MEMBER_ID_BY_EMAIL__;
  if (cache.has(key)) return cache.get(key) ?? null;
  try {
    const { data } = await createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
      .from("app_users")
      .select("id")
      .eq("email", key)
      .eq("active", true)
      .maybeSingle();
    const id = (data?.id as string | undefined) ?? null;
    // Cache ONLY a hit. A miss is very often a transient one — the row is
    // there, the read failed or raced — and caching it for the life of the
    // process would leave that container permanently convinced the person owns
    // nothing, with no way back short of a restart.
    if (id) cache.set(key, id);
    return id;
  } catch {
    return null;
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __FREYR_MEMBER_ID_BY_EMAIL__: Map<string, string | null> | undefined;
}
