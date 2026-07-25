import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isAutoApprovedEmail, normalizeAuthEmail } from "@/lib/authEmailPolicy";

/**
 * Decides what the login page asks for after someone types their email, so a
 * colleague never has to choose between "sign in" and "create account".
 *
 *   password    — this person has signed in before; ask for their password.
 *   activate    — first time; ask them to set a password (their account is
 *                 waiting because their company domain auto-joins, or because
 *                 a workspace owner invited them).
 *   invite-only — outside address with no invitation; nothing to set up.
 *
 * Deliberately says nothing an unauthenticated visitor could not already
 * discover by attempting a sign-in: whether an address can sign in here. It
 * never reveals names, roles, or workspace contents.
 */
type Step = "password" | "activate" | "invite-only";

/** Storage budget for the whole lookup. Past this we answer from the address. */
const LOOKUP_TIMEOUT_MS = 2500;

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST(request: NextRequest) {
  if (process.env.AUTH_MODE !== "supabase") {
    return json({ error: "Email sign-in is not enabled." }, 404);
  }

  let body: { email?: string };
  try {
    body = (await request.json()) as { email?: string };
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const email = normalizeAuthEmail(body.email);
  if (!email) return json({ error: "Enter a valid email address." }, 400);

  const domainMember = isAutoApprovedEmail(email);
  const client = adminClient();

  // No storage configured (or unreachable below): fall back to what we can
  // decide from the address alone. Company domains are always activatable; the
  // form still offers "already set a password?" so nobody is ever stuck.
  if (!client) {
    return json({
      step: domainMember ? "activate" : "password",
      domainMember,
      name: null,
      degraded: true,
    });
  }

  // The front door must answer quickly. If storage is slow or unreachable we
  // fall back to the address-only decision rather than leaving someone
  // watching a spinner — they can always still reach the password step.
  const deadline = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("lookup timed out")), LOOKUP_TIMEOUT_MS)
  );

  try {
    const existing = await Promise.race([
      client
        .from("app_users")
        .select("id, display_name")
        .eq("email", email)
        .limit(1)
        .maybeSingle(),
      deadline,
    ]);
    if (existing.error) throw new Error(existing.error.message);

    if (existing.data?.id) {
      return json({
        step: "password" satisfies Step,
        domainMember,
        name: null,
      });
    }

    if (domainMember) {
      return json({ step: "activate" satisfies Step, domainMember, name: null });
    }

    // Outside the company domain: only a live invitation opens the door.
    const invitation = await Promise.race([
      client
        .from("workspace_invitations")
        .select("display_name, status, expires_at")
        .eq("email", email)
        .eq("status", "pending")
        .limit(1)
        .maybeSingle(),
      deadline,
    ]);
    if (invitation.error) throw new Error(invitation.error.message);

    const invited =
      !!invitation.data &&
      (!invitation.data.expires_at ||
        new Date(invitation.data.expires_at).getTime() > Date.now());

    return json({
      step: (invited ? "activate" : "invite-only") satisfies Step,
      domainMember,
      name: invited ? invitation.data?.display_name || null : null,
    });
  } catch {
    // Storage hiccup must never lock the front door. Degrade to the same
    // address-only decision as the unconfigured case.
    return json({
      step: domainMember ? "activate" : "password",
      domainMember,
      name: null,
      degraded: true,
    });
  }
}
