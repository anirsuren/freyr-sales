"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { CheckCircle2, Loader2, LockKeyhole } from "lucide-react";

type State = "checking" | "code" | "verifying" | "ready" | "saving" | "invalid" | "saved";

/**
 * Complete the Supabase recovery flow and let the account choose a new password.
 *
 * THE EMAIL CARRIES A CODE, NOT A LINK (Aug 17). Veda clicked her reset link
 * within a minute of it arriving and got "expired", four times in a row.
 * Proven cause, not guessed: recovery links are single-use, and Freyr's mail
 * security (Microsoft Safe Links) opens every URL in an email before the
 * person can — her link was redeemed 58 seconds after it was sent, so every
 * human click was the second click. Two fetches of the same link showed
 * exactly that: first gets tokens, second gets otp_expired.
 *
 * A scanner cannot type. So the email now carries an 8-digit code and no URL
 * at all, and this page asks for the email plus that code. The old link path
 * stays below for any email already in flight.
 */
export default function ResetPasswordPage() {
  const [state, setState] = useState<State>("checking");
  const [detail, setDetail] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
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
    const codeParam = query.get("code");

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
        } else if (codeParam) {
          const { error } = await supabase.auth.exchangeCodeForSession(codeParam);
          if (error) throw error;
        } else {
          // No link tokens — the normal path now. Ask for the emailed code.
          // This is also where a burned or expired link lands, and the code
          // box is a better answer than a dead end: the person types the
          // code from the same email and carries on.
          //
          // The sign-in page stashes the address it just sent the code to, so
          // arriving here means typing eight digits, not your email again.
          try {
            const stashed = window.sessionStorage.getItem("freyr.reset.email");
            if (stashed) {
              setEmail(stashed);
              window.sessionStorage.removeItem("freyr.reset.email");
            }
          } catch {
            /* nothing stashed is fine — the field is right there */
          }
          setState("code");
          return;
        }
        setState("ready");
      } catch {
        setDetail(
          "That reset link could not be used. Enter the code from the email instead. It is typed here, so it always works."
        );
        setState("code");
      }
    }

    void establishRecoverySession();
  }, [configured]);

  /** Email + 8-digit code → a recovery session, no link involved. */
  async function verifyCode(event: FormEvent) {
    event.preventDefault();
    if (!client || state !== "code") return;
    const cleanEmail = email.trim().toLowerCase();
    const cleanCode = code.replace(/\s+/g, "");
    if (!cleanEmail.includes("@")) {
      setDetail("Enter the email address the code was sent to.");
      return;
    }
    if (!/^\d{6,10}$/.test(cleanCode)) {
      setDetail("The code is the 8 digits from the email.");
      return;
    }
    setDetail("");
    setState("verifying");
    const { error } = await client.auth.verifyOtp({
      type: "recovery",
      email: cleanEmail,
      token: cleanCode,
    });
    if (error) {
      setDetail(
        /expired|invalid/i.test(error.message)
          ? "That code did not match or has expired. Request a fresh one from the sign-in page. Codes last an hour."
          : error.message || "Could not verify the code."
      );
      setState("code");
      return;
    }
    setState("ready");
  }

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

  const inputCls =
    "mt-1.5 h-11 w-full rounded-md border border-border bg-white px-3 text-[14px] text-text-primary outline-none focus:border-blue-primary";

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-6">
      <section className="w-full max-w-md rounded-2xl border border-border-light bg-white p-8 shadow-card">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-light text-blue-primary">
          {state === "saved" ? <CheckCircle2 size={21} /> : <LockKeyhole size={21} />}
        </div>
        <h1 className="mt-5 text-[24px] font-bold tracking-tight text-text-primary">
          {state === "saved"
            ? "Password updated"
            : state === "code" || state === "verifying"
              ? "Enter your reset code"
              : "Choose a new password"}
        </h1>

        {state === "checking" || state === "saving" || state === "verifying" ? (
          <div className="mt-6 flex items-center gap-3 text-[13px] text-text-secondary">
            <Loader2 size={18} className="animate-spin text-blue-primary" />
            {state === "checking"
              ? "Checking your reset link…"
              : state === "verifying"
                ? "Checking the code…"
                : "Updating your password…"}
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
        ) : state === "code" ? (
          <form onSubmit={verifyCode} className="mt-4 space-y-4">
            <p className="text-[13.5px] leading-relaxed text-text-secondary">
              The reset email from Freyr Sales has an 8-digit code. Type it
              here with your email address.
            </p>
            <label className="block text-[12px] font-semibold text-text-secondary">
              Work email
              <input
                required
                autoFocus={email === ""}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@freyrsolutions.com"
                className={inputCls}
              />
            </label>
            <label className="block text-[12px] font-semibold text-text-secondary">
              Reset code
              <input
                required
                autoFocus={email !== ""}
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="8 digits from the email"
                className={`${inputCls} tracking-[0.2em] tnum`}
              />
            </label>
            {detail && <p className="text-[12px] font-medium text-red-600">{detail}</p>}
            <button
              type="submit"
              className="inline-flex h-10 w-full items-center justify-center rounded-md bg-blue-primary text-[13.5px] font-semibold text-white hover:bg-blue-hover"
            >
              Continue
            </button>
            <a
              href="/login"
              className="inline-flex h-10 w-full items-center justify-center rounded-md border border-border text-[13.5px] font-semibold text-text-primary hover:bg-surface"
            >
              Back to sign in
            </a>
          </form>
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
                className={inputCls}
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
                className={inputCls}
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
