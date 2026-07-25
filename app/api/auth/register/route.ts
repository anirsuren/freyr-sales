import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { normalizeAuthEmail } from "@/lib/authEmailPolicy";
import { authUrl } from "@/lib/authOrigin";
import { ensureCompanyDomainInvitation } from "@/lib/accessStore";

type RegistrationRequest = {
  email?: string;
  password?: string;
  name?: string;
};

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: NextRequest) {
  if (process.env.AUTH_MODE !== "supabase") {
    return json({ error: "Account registration is not enabled." }, 404);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return json({ error: "Account registration is not configured." }, 503);
  }

  let body: RegistrationRequest;
  try {
    body = (await request.json()) as RegistrationRequest;
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const email = normalizeAuthEmail(body.email);
  const password = body.password || "";
  const name = body.name?.trim();
  if (!email) {
    return json({ error: "Enter a valid email address." }, 400);
  }
  if (!name || name.length > 120) {
    return json({ error: "Enter your full name." }, 400);
  }
  if (password.length < 8 || password.length > 128) {
    return json({ error: "Use a password between 8 and 128 characters." }, 400);
  }

  // Supabase Auth refuses to create an identity without a live invitation
  // (migration 009), which predates company-domain auto-join. Record the
  // entitlement the domain policy already implies before asking Auth to create
  // the account, so a colleague is not rejected by a rule the product does not
  // apply to them. Never fatal: if this fails, signUp reports the real problem.
  try {
    await ensureCompanyDomainInvitation(email, name);
  } catch {
    // Fall through — the signup attempt below surfaces the actionable error.
  }

  const supabase = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  let emailRedirectTo: string;
  try {
    emailRedirectTo = authUrl("/login").toString();
  } catch {
    return json({ error: "Account confirmation is not configured." }, 503);
  }
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: name },
      emailRedirectTo,
    },
  });
  if (error) {
    // Supabase Auth runs a before-user-created hook that refuses addresses
    // which are neither on an approved company domain nor invited. Say so:
    // "try again shortly" sent people back to retry something that could never
    // succeed. The hook keeps malformed, uninvited, expired, and revoked
    // addresses indistinguishable, so this leaks nothing about who exists.
    const blockedBySignupPolicy = error.status === 403;
    return json(
      {
        error: blockedBySignupPolicy
          ? "That address can't create an account here. Use your company email, or ask a workspace owner to invite you."
          : "We could not create that account. Try again shortly.",
      },
      error.status && error.status >= 400 && error.status < 500
        ? error.status
        : 502
    );
  }

  return json({
    ok: true,
    message:
      "Check your inbox to confirm your account, then sign in.",
  });
}
