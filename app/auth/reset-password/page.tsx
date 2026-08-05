"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { CheckCircle2, Loader2, LockKeyhole } from "lucide-react";

type State = "checking" | "ready" | "saving" | "invalid" | "saved";

/** Complete the Supabase recovery flow and let the account choose a new password. */
export default function ResetPasswordPage() {
  const [state, setState] = useState<State>("checking");
  const [detail, setDetail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [client, setClient] = useState<SupabaseClient | null>(null);

  const configured = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    return url && key ? { url, key } : null;
  }, []);

  useEffect(() => {
    if (!configured) {
      setDetail("Password reset is not configured.");
      setState("invalid");
      return;
    }

    const supabase = createClient(configured.url, configured.key, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    });
    setClient(supabase);

    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const query = new URLSearchParams(window.location.search);
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");
    const code = query.get("code");
    const errorCode = hash.get("error_code") || query.get("error_code");

    // Recovery credentials never remain in browser history or copied URLs.
    window.history.replaceState(null, "", "/auth/reset-password");

    async function establishRecoverySession() {
      try {
        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
        } else if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else {
          throw new Error(
            errorCode === "otp_expired"
              ? "That reset link expired. Request a new one from the sign-in page."
              : "That reset link is invalid or has already been used."
          );
        }
        setState("ready");
      } catch (error) {
        setDetail(
          error instanceof Error
            ? error.message
            : "That reset link is invalid or has expired."
        );
        setState("invalid");
      }
    }

    void establishRecoverySession();
  }, [configured]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!client || state !== "ready") return;
    if (password.length < 8 || password.length > 128) {
      setDetail("Use a password between 8 and 128 characters.");
      return;
    }
    if (password !== confirm) {
      setDetail("The passwords do not match.");
      return;
    }

    setDetail("");
    setState("saving");
    const { error } = await client.auth.updateUser({ password });
    if (error) {
      setDetail(error.message || "Could not update the password.");
      setState("ready");
      return;
    }
    setState("saved");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-6">
      <section className="w-full max-w-md rounded-2xl border border-border-light bg-white p-8 shadow-card">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-light text-blue-primary">
          {state === "saved" ? <CheckCircle2 size={21} /> : <LockKeyhole size={21} />}
        </div>
        <h1 className="mt-5 text-[24px] font-bold tracking-tight text-text-primary">
          {state === "saved" ? "Password updated" : "Choose a new password"}
        </h1>

        {state === "checking" || state === "saving" ? (
          <div className="mt-6 flex items-center gap-3 text-[13px] text-text-secondary">
            <Loader2 size={18} className="animate-spin text-blue-primary" />
            {state === "checking" ? "Checking your reset link…" : "Updating your password…"}
          </div>
        ) : state === "saved" ? (
          <div className="mt-4">
            <p className="text-[13.5px] leading-relaxed text-text-secondary">
              Your new password is ready. Sign in again with it on your next visit.
            </p>
            <a
              href="/api/auth/logout"
              className="mt-5 inline-flex h-10 w-full items-center justify-center rounded-md bg-blue-primary text-[13.5px] font-semibold text-white hover:bg-blue-hover"
            >
              Continue to sign in
            </a>
          </div>
        ) : state === "invalid" ? (
          <div className="mt-4">
            <p className="text-[13.5px] leading-relaxed text-red-600">{detail}</p>
            <a
              href="/login"
              className="mt-5 inline-flex h-10 w-full items-center justify-center rounded-md border border-border text-[13.5px] font-semibold text-text-primary hover:bg-surface"
            >
              Return to sign in
            </a>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-5 space-y-4">
            <label className="block text-[12px] font-semibold text-text-secondary">
              New password
              <input
                required
                autoFocus
                minLength={8}
                maxLength={128}
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1.5 h-11 w-full rounded-md border border-border bg-white px-3 text-[14px] text-text-primary outline-none focus:border-blue-primary"
              />
            </label>
            <label className="block text-[12px] font-semibold text-text-secondary">
              Confirm new password
              <input
                required
                minLength={8}
                maxLength={128}
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                className="mt-1.5 h-11 w-full rounded-md border border-border bg-white px-3 text-[14px] text-text-primary outline-none focus:border-blue-primary"
              />
            </label>
            <p className="text-[11.5px] text-text-tertiary">Use at least 8 characters.</p>
            {detail && <p className="text-[12px] font-medium text-red-600">{detail}</p>}
            <button
              type="submit"
              className="inline-flex h-10 w-full items-center justify-center rounded-md bg-blue-primary text-[13.5px] font-semibold text-white hover:bg-blue-hover"
            >
              Update password
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
