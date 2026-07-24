import type { NextRequest } from "next/server";
import { ACCESS_COOKIE, verifyAccessGrant } from "./accessControl";
import { parseAlbOidcPrincipal, parseEasyAuthPrincipal } from "./auth";
import {
  APP_SESSION_COOKIE,
  verifyAppSession,
} from "./appSession";
import {
  DEFAULT_LOCAL_USER_IDENTITY,
  GENERIC_USER_IDENTITY,
} from "./userIdentity";

export async function authenticatedRequestPrincipal(request: NextRequest) {
  if (process.env.AUTH_MODE === "supabase") {
    return verifyAppSession(
      request.cookies.get(APP_SESSION_COOKIE)?.value
    );
  }
  if (process.env.AUTH_MODE === "entra") {
    return parseEasyAuthPrincipal(
      request.headers.get("x-ms-client-principal")
    );
  }
  if (process.env.AUTH_MODE === "aws-alb") {
    return parseAlbOidcPrincipal(
      request.headers.get("x-amzn-oidc-data"),
      request.headers.get("x-amzn-oidc-identity")
    );
  }
  return null;
}

/** A display name suitable for authorship/ownership. Request body fields are
 * intentionally ignored so a user cannot attribute work to someone else. */
export async function authenticatedRequestActorName(
  request: NextRequest
): Promise<string> {
  const [principal, grant] = await Promise.all([
    authenticatedRequestPrincipal(request),
    verifyAccessGrant(request.cookies.get(ACCESS_COOKIE)?.value),
  ]);
  return (
    (grant && grant.sub === principal?.id ? grant.displayName?.trim() : "") ||
    principal?.name.trim() ||
    (process.env.NODE_ENV !== "production" && !process.env.AUTH_MODE
      ? DEFAULT_LOCAL_USER_IDENTITY.name
      : GENERIC_USER_IDENTITY.name)
  );
}
