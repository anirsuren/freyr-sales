import "server-only";

import { cookies, headers } from "next/headers";
import type { NextRequest } from "next/server";
import {
  ACCESS_COOKIE,
  verifyAccessGrant,
} from "./accessControl";
import {
  parseAlbOidcPrincipal,
  parseEasyAuthPrincipal,
  type AuthenticatedUser,
} from "./auth";
import {
  APP_SESSION_COOKIE,
  verifyAppSession,
} from "./appSession";
import { authenticatedRequestPrincipal } from "./requestPrincipal";
import type { WorkspaceMemberScope } from "./types";
import { DEFAULT_LOCAL_USER_IDENTITY } from "./userIdentity";
import { memberIdForEmail } from "./currentUser";
import { getDataMode } from "./dataMode";

const LOCAL_SCOPE: WorkspaceMemberScope = {
  workspaceId: "local-workspace",
  userId: DEFAULT_LOCAL_USER_IDENTITY.id,
};

function isLocalDevelopment(): boolean {
  return process.env.NODE_ENV !== "production" && !process.env.AUTH_MODE;
}

/**
 * The scope a local, unauthenticated session gets.
 *
 * A placeholder workspace is right only when the data is also placeholder. In
 * REAL mode the local session reads and writes the actual Freyr workspace, and
 * `requireMemberScope` compares this workspace id against that one — so the
 * fake "local-workspace" made every agent route that needs a scope throw
 * "Workspace member scope does not match this deployment", i.e. the Agent page
 * 500'd on a developer's machine in exactly the mode Anir tests in.
 *
 * So in real mode it resolves the genuine workspace and the genuine member
 * behind the local identity's email, the same binding getCurrentUser does.
 * Mock mode keeps the placeholder, because there the data is a placeholder too.
 */
async function localDevelopmentScope(): Promise<WorkspaceMemberScope | null> {
  if (!isLocalDevelopment()) return null;
  const workspaceId = process.env.FREYR_WORKSPACE_ID;
  if (getDataMode() === "live" && workspaceId) {
    const userId = await memberIdForEmail(DEFAULT_LOCAL_USER_IDENTITY.email);
    if (userId) return { workspaceId, userId };
  }
  return LOCAL_SCOPE;
}

function scopeFor(
  principal: AuthenticatedUser | null,
  grant: Awaited<ReturnType<typeof verifyAccessGrant>>
): WorkspaceMemberScope | null {
  if (!principal || !grant || grant.sub !== principal.id) return null;
  return {
    workspaceId: grant.workspaceId,
    userId: grant.userId,
  };
}

/**
 * Resolve private agent-data scope from the signed login and access-grant
 * cookies. Route bodies, query strings, and display names are never scope
 * sources.
 */
export async function verifiedRequestMemberScope(
  request: NextRequest
): Promise<WorkspaceMemberScope | null> {
  const local = await localDevelopmentScope();
  if (local) return local;

  const [principal, grant] = await Promise.all([
    authenticatedRequestPrincipal(request),
    verifyAccessGrant(request.cookies.get(ACCESS_COOKIE)?.value),
  ]);
  return scopeFor(principal, grant);
}

/**
 * Server-component counterpart to verifiedRequestMemberScope. Protected pages
 * are already gated by middleware; throwing here fails closed if that invariant
 * is ever broken.
 */
export async function requireServerMemberScope(): Promise<WorkspaceMemberScope> {
  const local = await localDevelopmentScope();
  if (local) return local;

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
  const grant = await verifyAccessGrant(
    cookieStore.get(ACCESS_COOKIE)?.value
  );
  const scope = scopeFor(principal, grant);
  if (!scope) {
    throw new Error("Verified workspace member scope is required.");
  }
  return scope;
}
