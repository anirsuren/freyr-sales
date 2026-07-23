import { NextRequest, NextResponse } from "next/server";
import { requestUsesHttps } from "@/lib/appSession";
import {
  ACCESS_COOKIE,
  ACCESS_TTL_SECONDS,
  isApprovalGateEnabled,
  signAccessGrant,
} from "@/lib/accessControl";
import { resolveWorkspaceAccess } from "@/lib/accessStore";
import { authenticatedRequestPrincipal } from "@/lib/requestPrincipal";

function safeNext(request: NextRequest): string {
  const value = request.nextUrl.searchParams.get("next") || "/offerings";
  try {
    const candidate = new URL(value, request.nextUrl.origin);
    if (
      value.startsWith("/") &&
      !value.startsWith("//") &&
      !value.includes("\\") &&
      candidate.origin === request.nextUrl.origin
    ) {
      return `${candidate.pathname}${candidate.search}${candidate.hash}`;
    }
  } catch {}
  return "/offerings";
}

export async function GET(request: NextRequest) {
  const next = safeNext(request);
  const principal = await authenticatedRequestPrincipal(request);
  if (!principal) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", next);
    return NextResponse.redirect(login);
  }
  if (!isApprovalGateEnabled()) {
    return NextResponse.redirect(new URL(next, request.url));
  }

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
      secure: requestUsesHttps(request),
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
