import { NextRequest, NextResponse } from "next/server";
import { ACCESS_COOKIE, isApprovalGateEnabled, verifyAccessGrant } from "@/lib/accessControl";
import {
  APP_SESSION_COOKIE,
  type AppSession,
  verifyAppSession,
} from "@/lib/appSession";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const PUBLIC_PATHS = new Set([
  "/api/health",
  "/api/auth/access",
  "/api/auth/register",
  "/api/auth/resolve",
  "/api/auth/session",
  "/api/auth/logout",
  "/login",
  "/access-pending",
]);
const PUBLIC_WEBHOOK_PATHS = new Set([
  "/api/voice/webhooks/elevenlabs",
  "/api/voice/webhooks/inbound",
]);

function isPublicPath(pathname: string): boolean {
  return (
    PUBLIC_PATHS.has(pathname) ||
    PUBLIC_WEBHOOK_PATHS.has(pathname) ||
    pathname.startsWith("/.auth/")
  );
}

function accessSubject(
  request: NextRequest,
  authMode: string | undefined,
  appSession: AppSession | null
): string | null {
  if (authMode === "supabase") return appSession?.id || null;
  if (authMode === "aws-alb") return request.headers.get("x-amzn-oidc-identity");
  const encoded = request.headers.get("x-ms-client-principal");
  if (!encoded) return null;
  try {
    const principal = JSON.parse(atob(encoded)) as {
      userId?: string;
      claims?: { typ?: string; val?: string }[];
    };
    return (
      principal.userId ||
      principal.claims?.find((claim) =>
        claim.typ === "oid" || claim.typ?.endsWith("/nameidentifier")
      )?.val ||
      null
    );
  } catch {
    return null;
  }
}

function loginUrl(request: NextRequest, authMode: string | undefined): URL {
  if (authMode === "entra") {
    return new URL("/.auth/login/aad", request.url);
  }
  const url = new URL("/login", request.url);
  url.searchParams.set(
    "next",
    `${request.nextUrl.pathname}${request.nextUrl.search}`
  );
  return url;
}

function offeringsOnly(request: NextRequest) {
  const locked = process.env.DATA_MODE_LOCKED === "1";
  const cookieMode = locked ? undefined : request.cookies.get("freyr_data_mode")?.value;
  const dataMode = cookieMode || process.env.DEFAULT_DATA_MODE || "mock";
  return dataMode === "live" || process.env.NEXT_PUBLIC_RELEASE_MODE === "offerings";
}

function securityHeaders(response: NextResponse, requestId: string) {
  const scriptPolicy =
    process.env.NODE_ENV === "production"
      ? "script-src 'self' 'unsafe-inline'"
      : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";
  response.headers.set("X-Request-Id", requestId);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), geolocation=(), microphone=(self), payment=(), usb=()"
  );
  response.headers.set(
    "Content-Security-Policy",
    `default-src 'self'; base-uri 'self'; frame-ancestors 'self' https://teams.microsoft.com https://*.teams.microsoft.com; object-src 'none'; form-action 'self'; img-src 'self' data: blob: https:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; ${scriptPolicy}; connect-src 'self' https: wss:`
  );
  if (process.env.NODE_ENV === "production") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    );
  }
}

export async function middleware(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
  const pathname = request.nextUrl.pathname;
  const authMode = process.env.AUTH_MODE;
  const recognizedAuthMode =
    authMode === "entra" ||
    authMode === "aws-alb" ||
    authMode === "supabase";
  const localAuthBypass =
    process.env.NODE_ENV !== "production" && !authMode;
  if (!recognizedAuthMode && !localAuthBypass && !isPublicPath(pathname)) {
    const response = pathname.startsWith("/api/")
      ? NextResponse.json(
          { error: "Authentication is not configured", requestId },
          { status: 503 }
        )
      : NextResponse.redirect(
          new URL("/login?configuration=error", request.url)
        );
    securityHeaders(response, requestId);
    return response;
  }
  const requireAuth =
    authMode === "entra" ||
    authMode === "aws-alb" ||
    authMode === "supabase";
  const appSession =
    authMode === "supabase"
      ? await verifyAppSession(
          request.cookies.get(APP_SESSION_COOKIE)?.value
        )
      : null;
  const hasIdentity =
    authMode === "supabase"
      ? !!appSession
      : authMode === "aws-alb"
        ? !!request.headers.get("x-amzn-oidc-identity") &&
          !!request.headers.get("x-amzn-oidc-data")
        : !!request.headers.get("x-ms-client-principal");

  if (
    offeringsOnly(request) &&
    !pathname.startsWith("/api/") &&
    pathname !== "/login" &&
    pathname !== "/access-pending" &&
    pathname !== "/settings" &&
    pathname !== "/offerings" &&
    !pathname.startsWith("/offerings/")
  ) {
    const response = NextResponse.redirect(new URL("/offerings", request.url));
    securityHeaders(response, requestId);
    return response;
  }

  if (
    requireAuth &&
    !isPublicPath(pathname) &&
    !hasIdentity
  ) {
    const response = pathname.startsWith("/api/")
      ? NextResponse.json(
          { error: "Authentication required", requestId },
          { status: 401 }
        )
      : NextResponse.redirect(loginUrl(request, authMode));
    securityHeaders(response, requestId);
    return response;
  }

  if (
    requireAuth &&
    isApprovalGateEnabled() &&
    !isPublicPath(pathname)
  ) {
    const grant = await verifyAccessGrant(request.cookies.get(ACCESS_COOKIE)?.value);
    const subject = accessSubject(request, authMode, appSession);
    if (!grant || !subject || grant.sub !== subject) {
      const response = pathname.startsWith("/api/")
        ? NextResponse.json(
            { error: "Workspace owner approval required", requestId },
            { status: 403 }
          )
        : NextResponse.redirect(
            new URL(
              `/api/auth/resolve?next=${encodeURIComponent(`${pathname}${request.nextUrl.search}`)}`,
              request.url
            )
          );
      securityHeaders(response, requestId);
      return response;
    }
  }

  // Block browser-based cross-origin mutations. Non-browser service calls that
  // omit Origin still require authentication above. Signed provider webhooks
  // are exempt because their route handlers verify provider-specific secrets.
  if (
    pathname.startsWith("/api/") &&
    MUTATING.has(request.method) &&
    !PUBLIC_WEBHOOK_PATHS.has(pathname)
  ) {
    const origin = request.headers.get("origin");
    const forwardedHost = request.headers.get("x-forwarded-host");
    const requestHost = forwardedHost || request.headers.get("host");
    let originHost: string | null = null;
    try {
      originHost = origin ? new URL(origin).host : null;
    } catch {
      originHost = "invalid";
    }
    if (origin && (!requestHost || originHost !== requestHost)) {
      const response = NextResponse.json(
        { error: "Cross-origin mutation rejected", requestId },
        { status: 403 }
      );
      securityHeaders(response, requestId);
      return response;
    }
  }

  const headers = new Headers(request.headers);
  headers.set("x-request-id", requestId);
  const response = NextResponse.next({ request: { headers } });
  securityHeaders(response, requestId);
  return response;
}

export const config = {
  // Protect dynamic routes even when an attacker gives a route parameter a
  // file-looking suffix such as ".png". Only framework assets and the favicon
  // bypass authentication.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
