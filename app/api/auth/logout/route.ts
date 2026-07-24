import { NextRequest, NextResponse } from "next/server";
import { ACCESS_COOKIE } from "@/lib/accessControl";
import {
  APP_SESSION_COOKIE,
  requestUsesHttps,
} from "@/lib/appSession";
import { authUrl, configuredAuthOrigin } from "@/lib/authOrigin";

const AUTH_COOKIES = [
  ACCESS_COOKIE,
  "freyr_access",
  APP_SESSION_COOKIE,
  "AWSELBAuthSessionCookie",
  "AWSELBAuthSessionCookie-0",
  "AWSELBAuthSessionCookie-1",
  "AWSELBAuthSessionCookie-2",
  "AWSELBAuthSessionCookie-3",
];

function safeLogoutUrl(): URL {
  const origin = configuredAuthOrigin();
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
    return authUrl("/.auth/logout?post_logout_redirect_uri=/login");
  }
  if (process.env.AUTH_MODE === "supabase") {
    return authUrl("/login?signedOut=1");
  }
  return authUrl("/login");
}

export async function GET(request: NextRequest) {
  let destination: URL;
  try {
    destination = safeLogoutUrl();
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
