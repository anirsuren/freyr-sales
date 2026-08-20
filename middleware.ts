import { NextRequest, NextResponse } from "next/server";
import { ACCESS_COOKIE, isApprovalGateEnabled, verifyAccessGrant } from "@/lib/accessControl";
import {
  APP_SESSION_COOKIE,
  type AppSession,
  verifyAppSession,
} from "@/lib/appSession";
import { authUrl, browserUrl, configuredAuthOrigin } from "@/lib/authOrigin";
import { isOfferingsReleasePath } from "@/lib/release";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const PUBLIC_PATHS = new Set([
  "/",
  "/api/health",
  "/api/auth/access",
  // Decides whether the login page asks for a new password or an existing one.
  // Must be reachable before anyone is signed in, like register and session.
  "/api/auth/lookup",
  "/api/auth/password-reset/request",
  "/api/auth/register",
  "/api/auth/resolve",
  // Passkey SIGN-IN is public by necessity — you are not signed in yet. The
  // REGISTER routes are deliberately absent: enrolling a passkey requires an
  // existing session, because a passkey is an extra key to your own account,
  // never a way to claim one.
  "/api/auth/passkey/login/options",
  "/api/auth/passkey/login/verify",
  "/api/auth/session",
  "/api/auth/logout",
  "/login",
  // Where the confirmation email lands: it arrives carrying the fresh session
  // in the URL fragment and exchanges it for the app cookie — by definition
  // the visitor is not signed in yet.
  "/auth/confirm",
  // Recovery links also arrive before there is an app session and carry a
  // short-lived Supabase recovery session in the URL.
  "/auth/reset-password",
  "/access-pending",
]);
const PUBLIC_WEBHOOK_PATHS = new Set([
  "/api/voice/webhooks/elevenlabs",
  "/api/voice/webhooks/inbound",
  // The monthly mailout. Called by a schedule, never by a signed-in browser, so
  // there is no session to check — the route itself demands CRON_SECRET as a
  // bearer token and 401s without it, exactly as the webhooks above verify
  // their own provider secrets.
  "/api/cron/monthly",
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
    return authUrl("/.auth/login/aad");
  }
  /**
   * SIGN IN ON THE PORT YOU ARE ON (Anir, Aug 20, sent from :3006 to
   * :3001/login?next=/admin: "if the problem is taking me here").
   *
   * AUTH_PUBLIC_ORIGIN pins one host, which is right for a link in an email
   * and wrong for bouncing the tab you are already in — a review server on
   * another port threw you at 3001, where a different session (or nothing at
   * all) was signed in. Switch account hit this in a different route on
   * Aug 19; these are the rest of the same bug.
   */
  const url = browserUrl(request.nextUrl, "/login");
  url.searchParams.set(
    "next",
    `${request.nextUrl.pathname}${request.nextUrl.search}`
  );
  return url;
}

function offeringsOnly(request: NextRequest) {
  const locked = process.env.DATA_MODE_LOCKED === "1";
  const dataMode = locked
    ? process.env.DEFAULT_DATA_MODE === "mock"
      ? "mock"
      : "live"
    : request.cookies.get("freyr_data_view_session")?.value === "mock"
      ? "mock"
      : "live";
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
  const authOrigin = configuredAuthOrigin();
  const localAuthBypass =
    process.env.NODE_ENV !== "production" && !authMode;
  if (
    recognizedAuthMode &&
    !authOrigin &&
    pathname !== "/api/health"
  ) {
    const response = pathname.startsWith("/api/")
      ? NextResponse.json(
          { error: "Authentication redirect is not configured", requestId },
          { status: 503 }
        )
      : new NextResponse("Authentication redirect is not configured.", {
          status: 503,
        });
    securityHeaders(response, requestId);
    return response;
  }
  if (!recognizedAuthMode && !localAuthBypass && !isPublicPath(pathname)) {
    const response = pathname.startsWith("/api/")
      ? NextResponse.json(
          { error: "Authentication is not configured", requestId },
          { status: 503 }
        )
      : authOrigin
        ? NextResponse.redirect(
            browserUrl(request.nextUrl, "/login?configuration=error")
          )
        : new NextResponse("Authentication is not configured.", {
            status: 503,
          });
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
    !isPublicPath(pathname) &&
    // The released module + the handful of non-module pages (sign-in, the
    // email-confirmation landing whose URL carries the session, access-pending,
    // settings, the tour). One shared list — see lib/release.ts.
    !isOfferingsReleasePath(pathname) &&
    // Static files (the sidebar logo, avatars, headshots, icons) are assets,
    // not pages. Gating them redirected every <img> to the offerings HTML the
    // moment prod ran in Real mode, which drew the logo as a broken image
    // (Anir, Jul 27). Authentication above still applies to them.
    !/\.[a-z0-9]+$/i.test(pathname)
  ) {
    // A configured deployment always uses the fixed public auth origin. The
    // only origin-less path allowed this far is the unauthenticated local-dev
    // harness, where redirecting on the current loopback origin is safe.
    const response = NextResponse.redirect(
      browserUrl(request.nextUrl, "/offerings")
    );
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
            browserUrl(
              request.nextUrl,
              `/api/auth/resolve?next=${encodeURIComponent(`${pathname}${request.nextUrl.search}`)}`
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
    let parsedOrigin: string | null = null;
    let parsedOriginHost: string | null = null;
    try {
      const parsed = origin ? new URL(origin) : null;
      parsedOrigin = parsed?.origin || null;
      parsedOriginHost = parsed?.host || null;
    } catch {
      parsedOrigin = "invalid";
      parsedOriginHost = "invalid";
    }
    const developmentRequestHost =
      request.headers.get("x-forwarded-host") ||
      request.headers.get("host");
    // A dev server answering its own browser is never a cross-origin caller.
    // With authOrigin set (the prod URL lives in .env.local), this branch
    // used to reject EVERY save made on localhost — drag-to-folder, edits,
    // uploads all 403'd with no visible reason (Anir, Aug 12: "why the hell
    // can i not drag them into the folder"). Production still accepts only
    // the configured origin.
    const sameHostDevOrigin =
      process.env.NODE_ENV !== "production" &&
      !!developmentRequestHost &&
      parsedOriginHost === developmentRequestHost;
    const originAllowed = authOrigin
      ? parsedOrigin === authOrigin || sameHostDevOrigin
      : sameHostDevOrigin;
    if (origin && !originAllowed) {
      const response = NextResponse.json(
        { error: "Cross-origin mutation rejected", requestId },
        { status: 403 }
      );
      securityHeaders(response, requestId);
      return response;
    }
  }

  /**
   * PASS THE REQUEST THROUGH UNTOUCHED (the upload outage, Aug 20 — Antara's
   * 32MB proposal, then every retry: "Couldn't upload that file", "Send the
   * file as multipart form data", and a naked 500).
   *
   * This used to be NextResponse.next({ request: { headers } }) so the route
   * could see an x-request-id — which NOTHING server-side ever read; the id
   * only decorates the RESPONSE below. But forwarding a MODIFIED request
   * makes Next re-stream the body to the route handler, and that re-stream is
   * capped at experimental.middlewareClientMaxBodySize (10MB by default) and
   * dies with "Response body object should not be disturbed or locked" beyond
   * it. Reproduced with `next start` + a 32MB multipart POST; unmodified
   * pass-through hands the route the original stream and the whole class of
   * failure disappears.
   */
  const response = NextResponse.next();
  securityHeaders(response, requestId);
  return response;
}

export const config = {
  // Session and access cookies are signed with runtime-injected ECS secrets.
  // The Node.js middleware runtime reads the same runtime environment and
  // cryptography implementation as the route handlers that issue them.
  runtime: "nodejs",
  // Protect dynamic routes even when an attacker gives a route parameter a
  // file-looking suffix such as ".png". Only framework assets and the favicon
  // bypass authentication.
  // The two big-body upload endpoints are EXCLUDED: any route the middleware
  // matches gets its body re-streamed by Next with a hard cap, which is what
  // ate Antara's 32MB proposal (Aug 20) — the cap-raise alone did not save it.
  // Both routes carry their own sign-in checks (canEditOffering /
  // verifiedWorkflowActor return 403 without a session), and the session
  // cookie is SameSite=Lax, so a cross-site POST arrives without it.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/offerings/.*/materials/upload|api/performance/evidence).*)",
  ],
};
