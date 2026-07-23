import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  APP_SESSION_COOKIE,
  APP_SESSION_TTL_SECONDS,
  requestUsesHttps,
  signAppSession,
} from "@/lib/appSession";
import {
  allowedAuthEmailDomains,
  isAllowedAuthEmail,
} from "@/lib/authEmailPolicy";

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
  const domains = allowedAuthEmailDomains();
  if (domains.length === 0 || !isAllowedAuthEmail(user.email, domains)) {
    return NextResponse.json(
      {
        error:
          domains.length > 0
            ? `Use your @${domains[0]} company email.`
            : "Company email access is not configured.",
      },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }
  let token: string;
  try {
    token = await signAppSession({
      id: user.id,
      name:
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        user.email?.split("@")[0] ||
        "Freyr user",
      email: user.email || null,
      roles: Array.isArray(user.app_metadata?.roles)
        ? user.app_metadata.roles.map(String)
        : [],
    });
  } catch {
    return NextResponse.json(
      { error: "Sign-in is not fully configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(APP_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: requestUsesHttps(request),
    path: "/",
    maxAge: APP_SESSION_TTL_SECONDS,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
