"use client";

import { useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { CheckCircle2, KeyRound, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { SsoStatus } from "@/lib/ssoStatus";

/**
 * SIGN-IN METHODS (Anir, Aug 17: "in my settings I should be able to see if
 * I'm already connected to SSO… everyone who has an account should be able
 * to connect their SSO account", and "it has to be optional now").
 *
 * There is no separate "connect" ceremony: signing in with Microsoft once,
 * with this same email, IS the connection — the app recognizes the email and
 * lands you in your one account. The button below simply starts that
 * Microsoft sign-in.
 */
export function SsoCard({
  status,
  email,
}: {
  status: SsoStatus | null;
  email: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    return url && key
      ? createClient(url, key, {
          auth: {
            autoRefreshToken: false,
            detectSessionInUrl: false,
            persistSession: false,
          },
        })
      : null;
  }, []);

  async function connectWithMicrosoft() {
    if (!supabase) {
      setError("Sign-in is not configured yet.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const { data, error: ssoError } = await supabase.auth.signInWithSSO({
        domain: "freyrsolutions.com",
        options: { redirectTo: `${window.location.origin}/login` },
      });
      if (ssoError) throw ssoError;
      if (!data?.url) throw new Error("Microsoft sign-in is not available yet.");
      window.location.href = data.url;
    } catch {
      setBusy(false);
      setError("Could not reach Microsoft. Try again in a minute.");
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-border-light bg-white p-4">
      <p className="text-[12.5px] font-semibold text-text-primary">Sign-in methods</p>
      <p className="mt-0.5 text-[11.5px] leading-relaxed text-text-secondary">
        Both doors lead to this same account{email ? ` (${email})` : ""}.
        Company sign-in is optional today.
      </p>

      <div className="mt-3 space-y-2">
        <div className="flex items-center gap-2.5 rounded-lg bg-surface px-3 py-2">
          <KeyRound size={14} strokeWidth={2.2} className="shrink-0 text-text-secondary" />
          <span className="min-w-0 flex-1 text-[12.5px] text-text-primary">
            Email &amp; password / Touch&nbsp;ID
          </span>
          {status === null ? (
            <span className="text-[11px] text-text-tertiary">could not check</span>
          ) : status.passwordLogin ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[color:#1A7A35]">
              <CheckCircle2 size={11.5} strokeWidth={2.6} /> Active
            </span>
          ) : (
            <span className="text-[11px] text-text-tertiary">not set up</span>
          )}
        </div>

        <div className="flex items-center gap-2.5 rounded-lg bg-surface px-3 py-2">
          <ShieldCheck size={14} strokeWidth={2.2} className="shrink-0 text-text-secondary" />
          <span className="min-w-0 flex-1 text-[12.5px] text-text-primary">
            Microsoft (Freyr sign-in)
          </span>
          {status === null ? (
            <span className="text-[11px] text-text-tertiary">could not check</span>
          ) : status.connected ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[color:#1A7A35]">
              <CheckCircle2 size={11.5} strokeWidth={2.6} /> Connected
            </span>
          ) : (
            <Button onClick={connectWithMicrosoft} loading={busy}>
              Connect
            </Button>
          )}
        </div>
      </div>

      {status !== null && !status.connected && (
        <p className="mt-2 text-[11px] leading-relaxed text-text-tertiary">
          Connecting just signs you in with Microsoft once, using this same
          email — the app recognizes it and links automatically. Nothing about
          your account or data changes.
        </p>
      )}
      {error && (
        <p className="mt-2 text-[11.5px] font-semibold text-[color:#DC2626]">{error}</p>
      )}
    </div>
  );
}
