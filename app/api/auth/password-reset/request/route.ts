import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authUrl } from "@/lib/authOrigin";
import { normalizeAuthEmail } from "@/lib/authEmailPolicy";

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Send a recovery link from the signed-out login screen.
 *
 * Supabase deliberately returns the same result for known and unknown
 * addresses. Keep that non-enumerating behaviour here: this endpoint never
 * reveals whether an account exists.
 */
export async function POST(request: NextRequest) {
  if (process.env.AUTH_MODE !== "supabase") {
    return json({ error: "Password reset is managed by your identity provider." }, 400);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return json({ error: "Password reset is not configured." }, 503);
  }

  const body = (await request.json().catch(() => null)) as
    | { email?: unknown }
    | null;
  const email = normalizeAuthEmail(
    typeof body?.email === "string" ? body.email : null
  );
  if (!email) {
    return json({ error: "Enter a valid email address." }, 400);
  }

  let redirectTo: string;
  try {
    redirectTo = authUrl("/auth/reset-password").toString();
  } catch {
    return json({ error: "Password reset is not configured." }, 503);
  }

  const supabase = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });
  if (error) {
    console.error("[auth/password-reset/request] reset email failed:", error.message);
    return json({ error: "We could not send the reset email. Try again shortly." }, 502);
  }

  return json({ ok: true });
}
