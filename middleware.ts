import { NextRequest, NextResponse } from "next/server";
import { ACCESS_COOKIE, isApprovalGateEnabled, verifyAccessGrant } from "@/lib/accessControl";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const PUBLIC_PATHS = new Set([
  "/api/health",
  "/api/auth/resolve",
  "/api/auth/logout",
  "/login",
  "/access-pending",
]);

function accessSubject(request: NextRequest, authMode: string | undefined): string | null {
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
  const requireAuth = authMode === "entra" || authMode === "aws-alb";
  const hasIdentity = authMode === "aws-alb"
    ? !!request.headers.get("x-amzn-oidc-identity") && !!request.headers.get("x-amzn-oidc-data")
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
    !PUBLIC_PATHS.has(pathname) &&
    !hasIdentity
  ) {
    const response = pathname.startsWith("/api/")
      ? NextResponse.json(
          { error: "Authentication required", requestId },
          { status: 401 }
        )
      : NextResponse.redirect(
          new URL(authMode === "entra" ? "/.auth/login/aad" : "/login", request.url)
        );
    securityHeaders(response, requestId);
    return response;
  }

  if (
    requireAuth &&
    isApprovalGateEnabled() &&
    !PUBLIC_PATHS.has(pathname) &&
    !pathname.startsWith("/.auth/")
  ) {
    const grant = await verifyAccessGrant(request.cookies.get(ACCESS_COOKIE)?.value);
    const subject = accessSubject(request, authMode);
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
  // omit Origin still require the Entra identity above.
  if (pathname.startsWith("/api/") && MUTATING.has(request.method)) {
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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|woff2?)$).*)"],
};
