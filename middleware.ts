import { NextRequest, NextResponse } from "next/server";
import { DATA_MODE_COOKIE } from "@/lib/dataMode";
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
  /* PUBLISHED EXCHANGE RATES ARE NOT A SECRET (Anir, Sep 4: "it has to be up
     to date 24/7 no bullshit"). This endpoint serves the ECB's public daily
     reference rates from our own cache — nothing about the workspace, nothing
     about any deal. It sat behind the session gate, and every time an access
     grant was mid-renewal the deal form's fetch bounced, swallowed the error,
     and fell back to a stored table holding only USD — which read as "Cannot
     convert right now" while the rate source was up the whole time. A number
     printed in the newspaper does not need a login. */
  "/api/fx",
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
  // The roadmap digest, on the same terms: a scheduler has no session to
  // present, and the route 401s on any request that does not carry
  // CRON_SECRET as a bearer token. Added because a digest a scheduler cannot
  // call is not a digest.
  "/api/cron/roadmap-digest",
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

/**
 * Expire the Mock-mode cookie on a response. Mirrors how `signInSession` and
 * the data-mode endpoint clear it, so all three agree on what "off" looks
 * like — a cookie cleared three different ways comes back on one of them.
 */
function leaveMockMode(response: NextResponse): NextResponse {
  response.cookies.set(DATA_MODE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
    maxAge: 0,
  });
  return response;
}

export async function middleware(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
  /**
   * /mock-mode IS A LABEL, NOT A ROUTE.
   *
   * next.config rewrites /mock-mode/x to /x, but middleware runs BEFORE that
   * rewrite, so every check below would otherwise judge a path the app does
   * not have: not public, not on the release list, not a released module — and
   * the release gate sent every prefixed URL to /offerings (found opening a
   * /mock-mode link straight from the address bar).
   *
   * Judging the real route keeps the door exactly as locked as it was:
   * /mock-mode/admin is evaluated as /admin, so it needs everything /admin
   * needs. The prefix can never be used to walk around any of this.
   */
  const rawPathname = request.nextUrl.pathname;
  const pathname = rawPathname.startsWith("/mock-mode")
    ? rawPathname.slice("/mock-mode".length) || "/"
    : rawPathname;

  /**
   * THE SIGNED-OUT PAGES SHED THE LABEL.
   *
   * Anir, Sep 3, typing localhost:3006 and landing on /mock-mode/: "it's
   * automatically pushing me to Mock-mode". Nothing was pushing him — Chrome
   * had autocompleted a prefixed URL out of his history, the rewrite served
   * the normal page, and the prefix simply stayed in the bar. But it stayed
   * there FOREVER, because the label is written and erased by ModeUrlSync
   * inside AppShell and these pages are not in AppShell. So the address kept
   * announcing a workspace mode on the one screen where there is no workspace
   * and no session, and it read exactly like a forced redirect.
   *
   * `ModeUrlSync.skip()` already says why: "you are not signed in yet, so
   * there is no workspace to be in a mode of". These are the same routes, and
   * a redirect is the only tool that reaches them. It strips a label off a
   * public route and nothing more: the destination is the very page the
   * rewrite was already serving, so no door moves.
   */
  if (rawPathname.startsWith("/mock-mode")) {
    const signedOutPage =
      pathname === "/" ||
      pathname === "/login" ||
      pathname.startsWith("/login/") ||
      pathname.startsWith("/auth/");
    if (signedOutPage) {
      const bare = new URL(request.url);
      bare.pathname = pathname;
      return leaveMockMode(NextResponse.redirect(bare));
    }
    /**
     * THE PREFIX FLIPS THE COOKIE HERE, NOT IN THE BROWSER (Sep 4).
     *
     * The switch INTO mock used to be ModeUrlSync's client effect: land on a
     * prefixed URL with a live cookie, POST the mode, reload. That leaves a
     * whole server render running in the WRONG mode first — and the moment a
     * record page grew "missing record redirects to the list", that render
     * won the race: /mock-mode/customers/cust-fill-107 with a live cookie
     * looked up a mock id in the real store, missed, and redirected away
     * before the client half could flip and reload. The pasted-mock-link flow
     * died, and the redirect it collided with dropped the label as well.
     *
     * Middleware sees the request before any of that. Same rule as the client
     * half — the address is the person's stated intent — enforced where it
     * cannot race. Locked deployments are exempt exactly as the data-mode
     * endpoint is: a lock means the viewer does not choose.
     */
    if (
      process.env.DATA_MODE_LOCKED !== "1" &&
      request.cookies.get(DATA_MODE_COOKIE)?.value !== "mock"
    ) {
      const again = NextResponse.redirect(new URL(request.url));
      again.cookies.set(DATA_MODE_COOKIE, "mock", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
      });
      return again;
    }
  }

  /**
   * THE FRONT DOOR PUTS YOU BACK IN REAL.
   *
   * Anir, Sep 3: "When I go to this URL, it automatically chooses Mock-mode."
   * He was right and the URL prefix was a side-show. `freyr_data_view_session`
   * is a browser-session cookie, so a flip into Mock made hours ago on some
   * other page was still in force, and typing localhost:3006 fresh dropped him
   * into sample data with nothing but a banner to say so.
   *
   * dataMode.ts already states the intent: "an unlocked app always starts in
   * Real mode. Mock mode is a temporary viewer choice." `signInSession`
   * already enforces it at sign-in. This closes the other way in: arriving at
   * the signed-out front door is starting over, so the temporary choice ends
   * there too. Typing the bare URL now means what he expects it to mean.
   *
   * It clears ONLY on these signed-out pages. Mock is untouched everywhere
   * inside the app: the toggle, the /mock-mode links he pastes to people, and
   * every page he navigates to while in it all behave exactly as before.
   */
  if (pathname === "/" || pathname === "/login" || pathname.startsWith("/login/")) {
    if (request.cookies.get(DATA_MODE_COOKIE)?.value === "mock") {
      return leaveMockMode(NextResponse.next());
    }
  }
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
