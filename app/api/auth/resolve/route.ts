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
import { appHomePath } from "@/lib/appHome";

function safeNext(request: NextRequest, origin: string): string {
  const value = request.nextUrl.searchParams.get("next") || appHomePath();
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
  return appHomePath();
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
    // RETRY THE BLIP. This catch used to fire on ANY error — including a
    // one-off "fetch failed" to Supabase — and render "the workspace approval
    // service is not fully configured", which misdiagnoses a network hiccup
    // as an admin problem and dead-ends the person (Anir, Aug 8: "idk why it
    // keeps saying this"). Same check, same rules; a moment of patience first.
    let access: Awaited<ReturnType<typeof resolveWorkspaceAccess>> | null = null;
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        access = await resolveWorkspaceAccess(principal);
        break;
      } catch (caught) {
        lastError = caught;
        const transient = /fetch failed|ECONN|ETIMEDOUT|ENOTFOUND|network|timeout/i.test(
          caught instanceof Error ? `${caught.message} ${caught.cause ?? ""}` : String(caught)
        );
        if (!transient || attempt === 2) throw caught;
        await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
      }
    }
    if (!access) throw lastError;
    if (access.status === "pending") {
      const pending = authUrl("/access-pending");
      if (principal.email) pending.searchParams.set("email", principal.email);
      return NextResponse.redirect(pending);
    }

    const token = await signAccessGrant({
      sub: principal.id,
      userId: access.userId,
      email: principal.email,
      displayName: access.displayName,
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
    // Carry the destination so "Try again" resumes the SAME sign-in instead
    // of dumping the person back at the start.
    unavailable.searchParams.set("next", next);
    return NextResponse.redirect(unavailable);
  }
}
