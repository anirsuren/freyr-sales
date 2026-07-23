import type { NextRequest } from "next/server";
import { parseAlbOidcPrincipal, parseEasyAuthPrincipal } from "./auth";
import {
  APP_SESSION_COOKIE,
  verifyAppSession,
} from "./appSession";

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
