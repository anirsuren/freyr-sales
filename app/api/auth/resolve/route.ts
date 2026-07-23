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
import { authUrl, configuredAuthOrigin } from "@/lib/authOrigin";

function safeNext(request: NextRequest, origin: string): string {
  const value = request.nextUrl.searchParams.get("next") || "/offerings";
  try {
    const candidate = new URL(value, origin);
    if (
      value.startsWith("/") &&
      !value.startsWith("//") &&
      !value.includes("\\") &&
      candidate.origin === origin
    ) {
      return `${candidate.pathname}${candidate.search}${candidate.hash}`;
    }
  } catch {}
  return "/offerings";
}

export async function GET(request: NextRequest) {
  const origin = configuredAuthOrigin();
  if (!origin) {
    return NextResponse.json(
      { error: "Authentication redirect is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
  const next = safeNext(request, origin);
  const principal = await authenticatedRequestPrincipal(request);
  if (!principal) {
    const login = authUrl("/login");
    login.searchParams.set("next", next);
    return NextResponse.redirect(login);
  }
  if (!isApprovalGateEnabled()) {
    return NextResponse.redirect(authUrl(next));
  }

  try {
    const access = await resolveWorkspaceAccess(principal);
    if (access.status === "pending") {
      const pending = authUrl("/access-pending");
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
    const response = NextResponse.redirect(authUrl(next));
    response.cookies.set(ACCESS_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: requestUsesHttps(request),
      path: "/",
      maxAge: ACCESS_TTL_SECONDS,
    });
    return response;
  } catch {
    const unavailable = authUrl("/access-pending");
    unavailable.searchParams.set("configuration", "error");
    return NextResponse.redirect(unavailable);
  }
}
