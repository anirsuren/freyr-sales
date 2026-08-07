import { NextRequest, NextResponse } from "next/server";
import type { AuthenticatedUser } from "@/lib/auth";
import {
  APP_SESSION_COOKIE,
  APP_SESSION_TTL_SECONDS,
  requestUsesHttps,
  signAppSession,
} from "@/lib/appSession";
import {
  ACCESS_COOKIE,
  ACCESS_TTL_SECONDS,
  signAccessGrant,
} from "@/lib/accessControl";
import { resolveWorkspaceAccess } from "@/lib/accessStore";
import { DATA_MODE_COOKIE } from "@/lib/dataMode";

/**
 * THE ONE PLACE A SIGN-IN BECOMES A SESSION.
 *
 * Password sign-in and passkey sign-in must land a user in exactly the same
 * state — same session cookie, same workspace access grant, same reset of the
 * data-view cookie. Duplicating that in a second auth route is how the two
 * paths silently drift and how auth bugs are born, so both call this.
 *
 * The caller has already PROVEN who the principal is (a verified Supabase
 * token, or a verified WebAuthn assertion). This function does not
 * authenticate; it decides workspace access and issues cookies.
 */
export async function establishSignedInSession(
  request: NextRequest,
  assertedPrincipal: AuthenticatedUser,
  body: Record<string, unknown> = {}
): Promise<{ response: NextResponse; approved: boolean } | { error: NextResponse }> {
  let access: Awaited<ReturnType<typeof resolveWorkspaceAccess>>;
  try {
    access = await resolveWorkspaceAccess(assertedPrincipal);
  } catch (caught) {
    console.error(
      "[signIn] resolveWorkspaceAccess failed:",
      caught instanceof Error ? caught.message : caught
    );
    return {
      error: NextResponse.json(
        { error: "Authentication service unavailable." },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      ),
    };
  }

  // Once a subject has joined the workspace, the directory name is the identity
  // used throughout the app — never the self-editable metadata name.
  const approved = access.status === "approved";
  const principal =
    access.status === "approved"
      ? { ...assertedPrincipal, name: access.displayName }
      : assertedPrincipal;
  let token: string;
  let accessGrantToken: string | null = null;
  try {
    token = await signAppSession(principal);
    if (access.status === "approved") {
      accessGrantToken = await signAccessGrant({
        sub: principal.id,
        userId: access.userId,
        email: principal.email,
        displayName: access.displayName,
        role: access.role,
        workspaceId: access.workspaceId,
      });
    }
  } catch {
    return {
      error: NextResponse.json(
        { error: "Sign-in is not fully configured." },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      ),
    };
  }

  const response = NextResponse.json({ ok: true, approved, ...body });
  const secure = requestUsesHttps(request);
  // A newly authenticated session always begins in Real mode. Mock never
  // carries over from a previous signed-in user.
  response.cookies.set(DATA_MODE_COOKIE, "", {
    httpOnly: true, sameSite: "lax", secure, path: "/", expires: new Date(0), maxAge: 0,
  });
  response.cookies.set(APP_SESSION_COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: APP_SESSION_TTL_SECONDS,
  });
  if (accessGrantToken) {
    response.cookies.set(ACCESS_COOKIE, accessGrantToken, {
      httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: ACCESS_TTL_SECONDS,
    });
  } else {
    response.cookies.set(ACCESS_COOKIE, "", {
      httpOnly: true, sameSite: "lax", secure, path: "/", expires: new Date(0), maxAge: 0,
    });
  }
  response.headers.set("Cache-Control", "no-store");
  return { response, approved };
}
