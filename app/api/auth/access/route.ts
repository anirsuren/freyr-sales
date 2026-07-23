import { NextRequest, NextResponse } from "next/server";
import {
  ACCESS_COOKIE,
  ACCESS_TTL_SECONDS,
  isApprovalGateEnabled,
  signAccessGrant,
} from "@/lib/accessControl";
import { resolveWorkspaceAccess } from "@/lib/accessStore";
import { requestUsesHttps } from "@/lib/appSession";
import { authenticatedRequestPrincipal } from "@/lib/requestPrincipal";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const principal = await authenticatedRequestPrincipal(request);
  if (!principal) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }

  if (!isApprovalGateEnabled()) {
    return NextResponse.json({ ok: true });
  }

  try {
    const access = await resolveWorkspaceAccess(principal);
    if (access.status === "pending") {
      return NextResponse.json(
        { error: "Workspace owner approval required" },
        { status: 403 }
      );
    }

    const token = await signAccessGrant({
      sub: principal.id,
      userId: access.userId,
      email: principal.email,
      role: access.role,
      workspaceId: access.workspaceId,
    });
    const response = NextResponse.json({
      ok: true,
      role: access.role,
    });
    response.cookies.set(ACCESS_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: requestUsesHttps(request),
      path: "/",
      maxAge: ACCESS_TTL_SECONDS,
    });
    return response;
  } catch {
    return NextResponse.json(
      { error: "Authentication service unavailable" },
      { status: 503 }
    );
  }
}
