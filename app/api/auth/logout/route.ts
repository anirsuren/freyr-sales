import { NextRequest, NextResponse } from "next/server";
import { ACCESS_COOKIE } from "@/lib/accessControl";
import {
  APP_SESSION_COOKIE,
  requestUsesHttps,
} from "@/lib/appSession";

const AUTH_COOKIES = [
  ACCESS_COOKIE,
  APP_SESSION_COOKIE,
  "AWSELBAuthSessionCookie",
  "AWSELBAuthSessionCookie-0",
  "AWSELBAuthSessionCookie-1",
  "AWSELBAuthSessionCookie-2",
  "AWSELBAuthSessionCookie-3",
];

function safeLogoutUrl(request: NextRequest): URL {
  const configured = process.env.AUTH_LOGOUT_URL;
  if (configured) {
    try {
      const candidate = new URL(configured, request.url);
      if (candidate.protocol === "https:" || candidate.origin === request.nextUrl.origin) {
        return candidate;
      }
    } catch {}
  }

  if (process.env.AUTH_MODE === "entra") {
    return new URL("/.auth/logout?post_logout_redirect_uri=/login", request.url);
  }
  if (process.env.AUTH_MODE === "supabase") {
    return new URL("/login?signedOut=1", request.url);
  }
  return new URL("/login", request.url);
}

export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(safeLogoutUrl(request));
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
