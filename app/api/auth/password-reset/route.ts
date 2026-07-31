import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authUrl } from "@/lib/authOrigin";
import { getCurrentUser } from "@/lib/currentUser";
import { normalizeAuthEmail } from "@/lib/authEmailPolicy";

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Send a recovery link for the signed-in account.
 *
 * The address is deliberately taken from the verified server-side identity,
 * never from the request body. Settings must not become a way to trigger reset
 * emails for arbitrary addresses or probe which accounts exist.
 */
export async function POST() {
  if (process.env.AUTH_MODE !== "supabase") {
    return json({ error: "Password reset is managed by your identity provider." }, 400);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return json({ error: "Password reset is not configured." }, 503);
  }

  const user = await getCurrentUser();
  const email = normalizeAuthEmail(user.email);
  if (!email) {
    return json({ error: "Your signed-in account has no verified email address." }, 400);
  }

  let redirectTo: string;
  try {
    redirectTo = authUrl("/auth/reset-password").toString();
  } catch {
    return json({ error: "Password reset is not configured." }, 503);
  }

  const supabase = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });
  if (error) {
    console.error("[auth/password-reset] reset email failed:", error.message);
    return json({ error: "We could not send the reset email. Try again shortly." }, 502);
  }

  return json({ ok: true, email });
}
