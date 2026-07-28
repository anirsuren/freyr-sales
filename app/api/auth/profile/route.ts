import { NextRequest, NextResponse } from "next/server";
import {
  APP_SESSION_COOKIE,
  APP_SESSION_TTL_SECONDS,
  requestUsesHttps,
  signAppSession,
  verifyAppSession,
} from "@/lib/appSession";
import {
  ACCESS_COOKIE,
  ACCESS_TTL_SECONDS,
  signAccessGrant,
  verifyAccessGrant,
} from "@/lib/accessControl";
import { updateWorkspaceMember } from "@/lib/accessStore";

// Rename the signed-in member. The canonical directory name lives on the
// app_users row (Supabase user metadata is account-holder-editable and never
// trusted for attribution), so this writes the directory and then re-mints
// both cookies so the header reflects the new name without a re-login.
export async function PATCH(request: NextRequest) {
  if (process.env.AUTH_MODE !== "supabase") {
    return NextResponse.json(
      { error: "Profile updates are not enabled." },
      { status: 404, headers: { "Cache-Control": "no-store" } }
    );
  }

  const session = await verifyAppSession(
    request.cookies.get(APP_SESSION_COOKIE)?.value
  );
  if (!session) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  const grant = await verifyAccessGrant(
    request.cookies.get(ACCESS_COOKIE)?.value
  );
  if (!grant || grant.sub !== session.id) {
    return NextResponse.json(
      { error: "Join the workspace before editing your profile." },
      { status: 403 }
    );
  }

  let name: string | undefined;
  try {
    const body = (await request.json()) as { name?: string };
    name = body.name?.trim();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!name || name.length > 120) {
    return NextResponse.json({ error: "Enter your full name." }, { status: 400 });
  }

  try {
    await updateWorkspaceMember(grant.workspaceId, grant.userId, {
      displayName: name,
    });
  } catch {
    return NextResponse.json(
      { error: "Couldn't update your profile. Try again." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  let sessionToken: string;
  let grantToken: string;
  try {
    sessionToken = await signAppSession({
      id: session.id,
      name,
      email: session.email,
      roles: session.roles,
    });
    grantToken = await signAccessGrant({
      sub: grant.sub,
      userId: grant.userId,
      email: grant.email,
      displayName: name,
      role: grant.role,
      workspaceId: grant.workspaceId,
    });
  } catch {
    return NextResponse.json(
      { error: "Profile saved: sign in again to see it everywhere." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  const response = NextResponse.json({ ok: true, name });
  const secure = requestUsesHttps(request);
  response.cookies.set(APP_SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: APP_SESSION_TTL_SECONDS,
  });
  response.cookies.set(ACCESS_COOKIE, grantToken, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: ACCESS_TTL_SECONDS,
  });
  return response;
}
