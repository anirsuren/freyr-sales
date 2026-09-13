import { NextRequest, NextResponse } from "next/server";
import { ACCESS_COOKIE } from "@/lib/accessControl";
import { requestUsesHttps } from "@/lib/appSession";

/** Remove a stale grant after an authoritative denial, never a service outage. */
export function clearAccessGrant(response: NextResponse, request: NextRequest) {
  response.cookies.set(ACCESS_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: requestUsesHttps(request),
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
