import { NextRequest, NextResponse } from "next/server";
import { parseAlbOidcPrincipal, parseEasyAuthPrincipal } from "@/lib/auth";
import {
  ACCESS_COOKIE,
  ACCESS_TTL_SECONDS,
  isApprovalGateEnabled,
  signAccessGrant,
} from "@/lib/accessControl";
import { resolveWorkspaceAccess } from "@/lib/accessStore";

function safeNext(request: NextRequest): string {
  const value = request.nextUrl.searchParams.get("next") || "/offerings";
  return value.startsWith("/") && !value.startsWith("//") ? value : "/offerings";
}

export async function GET(request: NextRequest) {
  const next = safeNext(request);
  if (!isApprovalGateEnabled()) return NextResponse.redirect(new URL(next, request.url));

  const principal =
    parseEasyAuthPrincipal(request.headers.get("x-ms-client-principal")) ||
    parseAlbOidcPrincipal(
      request.headers.get("x-amzn-oidc-data"),
      request.headers.get("x-amzn-oidc-identity")
    );
  if (!principal) return NextResponse.redirect(new URL("/login", request.url));

  try {
    const access = await resolveWorkspaceAccess(principal);
    if (access.status === "pending") {
      const pending = new URL("/access-pending", request.url);
      if (principal.email) pending.searchParams.set("email", principal.email);
      return NextResponse.redirect(pending);
    }

    const token = await signAccessGrant({
      sub: principal.id,
      userId: access.userId,
      email: principal.email,
      role: access.role,
      workspaceId: access.workspaceId,
    });
    const response = NextResponse.redirect(new URL(next, request.url));
    response.cookies.set(ACCESS_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: ACCESS_TTL_SECONDS,
    });
    return response;
  } catch {
    const unavailable = new URL("/access-pending", request.url);
    unavailable.searchParams.set("configuration", "error");
    return NextResponse.redirect(unavailable);
  }
}
