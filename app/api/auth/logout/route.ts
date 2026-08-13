import { NextRequest, NextResponse } from "next/server";
import { ACCESS_COOKIE } from "@/lib/accessControl";
import {
  APP_SESSION_COOKIE,
  requestUsesHttps,
} from "@/lib/appSession";
import { configuredAuthOrigin } from "@/lib/authOrigin";
import { DATA_MODE_COOKIE } from "@/lib/dataMode";

const AUTH_COOKIES = [
  ACCESS_COOKIE,
  "freyr_access",
  APP_SESSION_COOKIE,
  "AWSELBAuthSessionCookie",
  "AWSELBAuthSessionCookie-0",
  "AWSELBAuthSessionCookie-1",
  "AWSELBAuthSessionCookie-2",
  "AWSELBAuthSessionCookie-3",
  "freyr_data_mode",
  DATA_MODE_COOKIE,
];

function localRequestOrigin(request: NextRequest): string | null {
  if (process.env.NODE_ENV === "production") return null;
  const candidate = request.nextUrl;
  if (
    (candidate.protocol === "http:" || candidate.protocol === "https:") &&
    (candidate.hostname === "localhost" ||
      candidate.hostname === "127.0.0.1" ||
      candidate.hostname === "[::1]")
  ) {
    return candidate.origin;
  }
  return null;
}

function safeLogoutUrl(request: NextRequest): URL {
  // Production must use the single configured public origin. Local review is
  // allowed to fall back to the actual loopback request so signing out cannot
  // strand someone on a JSON 503 merely because AUTH_PUBLIC_ORIGIN was not
  // copied into their local shell.
  const origin = configuredAuthOrigin() || localRequestOrigin(request);
  if (!origin) {
    throw new Error("Authentication redirect is not configured.");
  }

  /**
   * SIGNING OUT IN ORDER TO SIGN IN AS SOMEONE ELSE (Anir, Aug 13: "there's
   * literally no way for me to switch my account… if I'm saved, it can just
   * show the login page at least").
   *
   * "Switch account" sends ?next=/login: the cookies still get cleared exactly
   * as a normal sign-out does, but instead of landing on the marketing page
   * you arrive at the form, ready to enter a different address.
   *
   * Only a same-origin RELATIVE path is honoured. A crafted ?next=https://…
   * would turn our own sign-out into an open redirect, so anything that is not
   * a plain "/path" is ignored and the normal destination stands.
   */
  const requestedNext = request.nextUrl.searchParams.get("next");
  if (
    requestedNext &&
    requestedNext.startsWith("/") &&
    !requestedNext.startsWith("//")
  ) {
    try {
      const candidate = new URL(requestedNext, origin);
      if (candidate.origin === origin) return candidate;
    } catch {}
  }

  const configured = process.env.AUTH_LOGOUT_URL;
  if (configured && process.env.AUTH_MODE !== "supabase") {
    try {
      const candidate = new URL(configured, origin);
      if (
        candidate.origin === origin ||
        (process.env.AUTH_MODE === "entra" &&
          candidate.protocol === "https:")
      ) {
        return candidate;
      }
    } catch {}
  }

  if (process.env.AUTH_MODE === "entra") {
    return new URL("/.auth/logout?post_logout_redirect_uri=/login", origin);
  }
  // SIGNING OUT LANDS ON THE LANDING PAGE, not back on a sign-in form. The
  // form is where you go to get IN; being dropped on it the instant you leave
  // reads as a failed logout (Anir, Aug 7: "when I log out, it should take me
  // to the landing page, not this page"). The landing page now knows you are
  // signed out and offers the way back in.
  if (process.env.AUTH_MODE === "supabase") {
    return new URL("/?signedOut=1", origin);
  }
  return new URL("/", origin);
}

export async function GET(request: NextRequest) {
  let destination: URL;
  try {
    destination = safeLogoutUrl(request);
  } catch {
    return NextResponse.json(
      { error: "Authentication redirect is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
  const response = NextResponse.redirect(destination);
  for (const name of AUTH_COOKIES) {
    response.cookies.set(name, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: requestUsesHttps(request),
      path: "/",
      expires: new Date(0),
      maxAge: 0,
    });
  }
  response.headers.set("Cache-Control", "no-store");
  return response;
}
