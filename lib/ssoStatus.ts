import { createClient } from "@supabase/supabase-js";

/**
 * IS MICROSOFT SIGN-IN LINKED TO THIS PERSON? (Anir, Aug 17: "in my settings
 * I should be able to see if I'm already connected to SSO… everyone who has
 * an account should be able to connect their SSO account.")
 *
 * Supabase keeps a SAML sign-in as its own auth user, so "connected" means:
 * some auth user with this VERIFIED email carries an SSO identity. The
 * workspace resolver links any such sign-in to the one membership by email,
 * so this is purely a statement of fact for the settings page — connecting
 * is just signing in with Microsoft once.
 */
export type SsoStatus = {
  /** A Microsoft/SAML sign-in exists for this email. */
  connected: boolean;
  /** When that sign-in identity was first created, if known. */
  connectedAt: string | null;
  /** An email+password (or passkey-backed) sign-in exists for this email. */
  passwordLogin: boolean;
};

export async function ssoStatusForEmail(email: string | null): Promise<SsoStatus | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !email) return null;
  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const wanted = email.trim().toLowerCase();
  try {
    // The workspace is ~dozens of people; one page is plenty and the call is
    // a settings-page read, not a hot path.
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) throw error;
    let connected = false;
    let connectedAt: string | null = null;
    let passwordLogin = false;
    for (const user of data.users) {
      if ((user.email ?? "").trim().toLowerCase() !== wanted) continue;
      for (const identity of user.identities ?? []) {
        const provider = (identity.provider ?? "").toLowerCase();
        if (provider === "email") passwordLogin = true;
        // SAML identities arrive as "sso:<provider-id>"; OAuth Azure would be
        // "azure". Either counts as the Microsoft door.
        if (provider.startsWith("sso") || provider === "azure") {
          connected = true;
          connectedAt = identity.created_at ?? user.created_at ?? null;
        }
      }
    }
    return { connected, connectedAt, passwordLogin };
  } catch {
    // The settings page must render even if the admin API hiccups — the card
    // simply says it could not check, rather than guessing.
    return null;
  }
}
