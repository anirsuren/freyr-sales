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
  if (process.env.AUTH_MODE === "supabase") {
    return new URL("/login?signedOut=1", origin);
  }
  return new URL("/login", origin);
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
