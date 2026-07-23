"use client";

import { FormEvent, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { ArrowRight, Loader2, LockKeyhole, UserPlus } from "lucide-react";

type Mode = "signin" | "request";

function safeNext(): string {
  const value = new URLSearchParams(window.location.search).get("next") || "/dashboard";
  try {
    const candidate = new URL(value, window.location.origin);
    if (
      value.startsWith("/") &&
      !value.startsWith("//") &&
      !value.includes("\\") &&
      candidate.origin === window.location.origin
    ) {
      return `${candidate.pathname}${candidate.search}${candidate.hash}`;
    }
  } catch {}
  return "/dashboard";
}

export function SupabaseLoginForm({ allowedDomain }: { allowedDomain: string }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
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

  async function establishSession(accessToken: string) {
    const response = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken }),
    });
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
      approved?: boolean;
    };
    if (!response.ok) {
      throw new Error(body.error || "Could not complete sign-in.");
    }
    // Let the browser commit both HttpOnly cookies before the top-level
    // navigation. The session endpoint issues login and workspace grants
    // atomically, so an approved user never needs an intermediate redirect.
    await new Promise((resolve) => window.setTimeout(resolve, 100));
    window.location.assign(
      body.approved
        ? safeNext()
        : `/access-pending?email=${encodeURIComponent(email.trim().toLowerCase())}`
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (!supabase) throw new Error("Sign-in is not configured yet.");
      const normalizedEmail = email.trim().toLowerCase();
      if (!normalizedEmail.endsWith(`@${allowedDomain}`)) {
        throw new Error(`Use your @${allowedDomain} company email.`);
      }
      if (mode === "request") {
        const response = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: normalizedEmail,
            password,
            name: name.trim(),
          }),
        });
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
        };
        if (!response.ok) {
          throw new Error(body.error || "Could not create your account.");
        }
        setPassword("");
        setMessage(
          body.message ||
            "Check your company inbox to confirm your account, then sign in."
        );
      } else {
        const { data, error: signInError } =
          await supabase.auth.signInWithPassword({
            email: normalizedEmail,
            password,
          });
        if (signInError) throw signInError;
        if (!data.session?.access_token) throw new Error("Could not establish a sign-in session.");
        await establishSession(data.session.access_token);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-5 grid grid-cols-2 rounded-md bg-surface p-1" role="tablist" aria-label="Sign-in options">
        <button
          type="button"
          className={`h-9 rounded text-[13px] font-semibold ${mode === "signin" ? "bg-white text-text-primary shadow-sm" : "text-text-secondary"}`}
          onClick={() => { setMode("signin"); setError(null); setMessage(null); }}
        >
          Sign in
        </button>
        <button
          type="button"
          className={`h-9 rounded text-[13px] font-semibold ${mode === "request" ? "bg-white text-text-primary shadow-sm" : "text-text-secondary"}`}
          onClick={() => { setMode("request"); setError(null); setMessage(null); }}
        >
          Create account
        </button>
      </div>

      <form onSubmit={submit} className="space-y-4">
        {mode === "request" && (
          <label className="block text-[12px] font-semibold text-text-secondary">
            Full name
            <input
              required
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1.5 h-11 w-full rounded-md border border-border bg-white px-3 text-[14px] text-text-primary outline-none focus:border-blue-primary focus:ring-2 focus:ring-blue-100"
            />
          </label>
        )}
        <label className="block text-[12px] font-semibold text-text-secondary">
          Work email
          <input
            required
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1.5 h-11 w-full rounded-md border border-border bg-white px-3 text-[14px] text-text-primary outline-none focus:border-blue-primary focus:ring-2 focus:ring-blue-100"
          />
        </label>
        <p className="-mt-2 text-[11px] text-text-tertiary">
          Use your @{allowedDomain} work email. We will send a confirmation
          link before you can sign in.
        </p>
        <label className="block text-[12px] font-semibold text-text-secondary">
          Password
          <input
            required
            minLength={8}
            type="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1.5 h-11 w-full rounded-md border border-border bg-white px-3 text-[14px] text-text-primary outline-none focus:border-blue-primary focus:ring-2 focus:ring-blue-100"
          />
        </label>

        {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</p>}
        {message && <p className="rounded-md bg-green-50 px-3 py-2 text-[12px] leading-relaxed text-green-800">{message}</p>}

        <button
          type="submit"
          disabled={busy}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-blue-primary text-[14px] font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? <Loader2 size={17} className="animate-spin" /> : mode === "signin" ? <LockKeyhole size={17} /> : <UserPlus size={17} />}
          {mode === "signin" ? "Sign in securely" : "Create account"}
          {!busy && <ArrowRight size={16} />}
        </button>
      </form>
    </div>
  );
}
