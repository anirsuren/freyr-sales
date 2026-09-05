import { NextRequest, NextResponse } from "next/server";
import { linkedInUrl } from "@/lib/safeUrl";
import { bumpUsage } from "@/lib/usageCounters";
import { getDb } from "@/lib/db";
import { createClient } from "@supabase/supabase-js";
import {
  APP_SESSION_COOKIE,
  APP_SESSION_TTL_SECONDS,
  requestUsesHttps,
  signAppSession,
} from "@/lib/appSession";
import { normalizeAuthEmail } from "@/lib/authEmailPolicy";
import {
  ACCESS_COOKIE,
  ACCESS_TTL_SECONDS,
  signAccessGrant,
} from "@/lib/accessControl";
import { resolveWorkspaceAccess } from "@/lib/accessStore";
import { DATA_MODE_COOKIE } from "@/lib/dataMode";

export async function POST(request: NextRequest) {
  if (process.env.AUTH_MODE !== "supabase") {
    return NextResponse.json(
      { error: "Supabase sign-in is not enabled." },
      { status: 404, headers: { "Cache-Control": "no-store" } }
    );
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json({ error: "Sign-in is not configured." }, { status: 503 });
  }

  let accessToken: string | undefined;
  try {
    const body = (await request.json()) as { accessToken?: string };
    accessToken = body.accessToken;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!accessToken) {
    return NextResponse.json({ error: "Missing sign-in token." }, { status: 400 });
  }

  const supabase = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) {
    return NextResponse.json({ error: "Your sign-in has expired. Please try again." }, { status: 401 });
  }

  const user = data.user;
  if (!user.email || !user.email_confirmed_at) {
    return NextResponse.json(
      { error: "Confirm your email before signing in." },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }
  const email = normalizeAuthEmail(user.email);
  if (!email) {
    return NextResponse.json(
      { error: "Your account does not have a valid email address." },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }
  const assertedPrincipal = {
    id: user.id,
    name:
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      email.split("@")[0] ||
      "Freyr user",
    email,
    roles: Array.isArray(user.app_metadata?.roles)
      ? user.app_metadata.roles.map(String)
      : [],
  };

  let access: Awaited<ReturnType<typeof resolveWorkspaceAccess>>;
  try {
    access = await resolveWorkspaceAccess(assertedPrincipal);
  } catch (caught) {
    // The client only ever sees the generic message; the real reason must
    // reach the server log or a 503 here is undiagnosable (it cost a full
    // debugging round on Jul 27 to learn that nothing was being recorded).
    console.error(
      "[auth/session] resolveWorkspaceAccess failed:",
      caught instanceof Error ? caught.message : caught
    );
    return NextResponse.json(
      { error: "Authentication service unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  // Once a subject has joined the workspace, its canonical directory name is
  // the identity used throughout the app. Supabase user metadata is editable
  // by the account holder and therefore cannot be trusted for attribution.
  const principal =
    access.status === "approved"
      ? { ...assertedPrincipal, name: access.displayName }
      : assertedPrincipal;

  // Onboarding LinkedIn: the activate form stored the URL in auth metadata
  // (no member row existed yet). Copy it into agent_prefs on the first
  // approved sign-in so the agent knows who this rep is from day one — never
  // overwriting a URL the rep has since set, and never blocking sign-in.
  /* VALIDATED, NOT PATTERN-MATCHED. This used to accept any string CONTAINING
     "linkedin.com/", which let through both "javascript:alert(1)//linkedin.com/"
     and "https://evil.com/linkedin.com/" — the first executes when a colleague
     clicks the chip, the second is simply somebody else's site wearing our
     label. linkedInUrl parses it and demands http(s) on a real linkedin.com
     host, and what gets stored is its normalised form. Refusing here only means
     the URL is not copied; sign-in is untouched either way. */
  const onboardingLinkedin = linkedInUrl(user.user_metadata?.linkedin_url);
  if (access.status === "approved" && onboardingLinkedin) {
    try {
      const scope = { workspaceId: access.workspaceId, userId: access.userId };
      const db = getDb();
      const prefs = await db.agentPrefs.get(scope);
      if (!prefs?.linkedin_url) {
        await db.agentPrefs.update(scope, {
          linkedin_url: onboardingLinkedin,
        });
      }
    } catch {
      // Sign-in must never fail on a nice-to-have.
    }
  }

  let token: string;
  let accessGrantToken: string | null = null;
  const approved = access.status === "approved";
  // ONE OF THE THREE NUMBERS THE MONTHLY NOTE REPORTS. Counted here because
  // this is the only place a session is actually created — `last_seen_at` is
  // touched on every page and would count visits, not sign-ins.
  if (access.status === "approved") bumpUsage(access.userId, "login");
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
    return NextResponse.json(
      { error: "Sign-in is not fully configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  const response = NextResponse.json({ ok: true, approved });
  // A newly authenticated session always begins in Real mode. Mock can be
  // selected afterward, but it never carries from a previous signed-in user.
  response.cookies.set(DATA_MODE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: requestUsesHttps(request),
    path: "/",
    expires: new Date(0),
    maxAge: 0,
  });
  response.cookies.set(APP_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: requestUsesHttps(request),
    path: "/",
    maxAge: APP_SESSION_TTL_SECONDS,
  });
  if (accessGrantToken) {
    response.cookies.set(ACCESS_COOKIE, accessGrantToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: requestUsesHttps(request),
      path: "/",
      maxAge: ACCESS_TTL_SECONDS,
    });
  } else {
    response.cookies.set(ACCESS_COOKIE, "", {
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
