"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { ArrowRight, Loader2, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { normalizeAuthEmail } from "@/lib/authEmailPolicy";

/**
 * Email-first sign-in. A colleague never has to decide whether they are
 * "signing in" or "creating an account" — they type their work address and the
 * form asks for the one thing that is actually missing: their password, either
 * to set for the first time or to sign in with.
 */
type Step = "email" | "password" | "activate" | "invite-only";

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

export function SupabaseLoginForm({
  joinDomainLabel = null,
}: {
  /** e.g. "@freyrsolutions.com" — company domains that join without an invite. */
  joinDomainLabel?: string | null;
} = {}) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const invitedEmail = normalizeAuthEmail(params.get("email"));
    const invitedName = params.get("name")?.trim();
    if (invitedEmail) setEmail(invitedEmail);
    if (invitedName && invitedName.length <= 120) setName(invitedName);
  }, []);

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

  function resetTo(next: Step) {
    setStep(next);
    setError(null);
    setMessage(null);
  }

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

  /** Step 1 — decide what this address needs, without asking the person. */
  async function continueWithEmail(normalizedEmail: string) {
    const response = await fetch("/api/auth/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: normalizedEmail }),
    });
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
      step?: Step;
      name?: string | null;
    };
    if (!response.ok) throw new Error(body.error || "Could not check that address.");
    if (body.name && !name) setName(body.name);
    setStep(body.step === "password" || body.step === "invite-only" ? body.step : "activate");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const normalizedEmail = normalizeAuthEmail(email);
      if (!normalizedEmail) throw new Error("Enter a valid email address.");

      if (step === "email") {
        await continueWithEmail(normalizedEmail);
        return;
      }

      if (step === "activate") {
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
        if (!response.ok) throw new Error(body.error || "Could not set up your account.");
        setPassword("");
        setMessage(
          body.message ||
            "Check your inbox to confirm your email, then come back and sign in."
        );
        return;
      }

      if (!supabase) throw new Error("Sign-in is not configured yet.");
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      if (signInError) throw signInError;
      if (!data.session?.access_token) {
        throw new Error("Could not establish a sign-in session.");
      }
      await establishSession(data.session.access_token);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Something went wrong. Please try again."
      );
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    "mt-1.5 h-11 w-full rounded-md border border-border bg-white px-3 text-[14px] text-text-primary outline-none focus:border-blue-primary focus:ring-2 focus:ring-blue-100";

  return (
    <form onSubmit={submit} className="space-y-4">
      {step === "email" ? (
        <>
          <label className="block text-[12px] font-semibold text-text-secondary">
            Work email
            <input
              required
              autoFocus
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={inputClass}
            />
          </label>
          <p className="-mt-2 text-[11px] text-text-tertiary">
            {joinDomainLabel
              ? `Your ${joinDomainLabel} address gets in automatically — no invitation needed.`
              : "Use the exact address your workspace owner invited."}
          </p>
        </>
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-md bg-surface px-3 py-2.5">
          <span className="truncate text-[13px] font-medium text-text-primary">{email}</span>
          <button
            type="button"
            onClick={() => {
              setPassword("");
              resetTo("email");
            }}
            className="shrink-0 text-[12px] font-semibold text-blue-primary hover:underline"
          >
            Change
          </button>
        </div>
      )}

      {step === "activate" && (
        <>
          <p className="rounded-md bg-blue-50 px-3 py-2.5 text-[12px] leading-relaxed text-blue-900">
            Your account is ready — just add your name and choose a password.
          </p>
          <label className="block text-[12px] font-semibold text-text-secondary">
            Full name
            <input
              required
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block text-[12px] font-semibold text-text-secondary">
            Choose a password
            <input
              required
              minLength={8}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={inputClass}
            />
          </label>
          <p className="-mt-2 text-[11px] text-text-tertiary">
            At least 8 characters. We&apos;ll email you a confirmation link before your
            first sign-in.
          </p>
        </>
      )}

      {step === "password" && (
        <label className="block text-[12px] font-semibold text-text-secondary">
          Password
          <input
            required
            autoFocus
            minLength={8}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={inputClass}
          />
        </label>
      )}

      {step === "invite-only" && (
        <p className="rounded-md border border-border bg-surface px-3 py-3 text-[12px] leading-relaxed text-text-secondary">
          That address isn&apos;t set up for this workspace yet. Ask a Freyr workspace
          owner to invite it, then come back and enter it here.
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-[12px] text-red-700">
          {error}
        </p>
      )}
      {message && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-[12px] leading-relaxed text-green-800">
          {message}
        </p>
      )}

      {step !== "invite-only" && (
        <button
          type="submit"
          disabled={busy}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-blue-primary text-[14px] font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? (
            <Loader2 size={17} className="animate-spin" />
          ) : step === "email" ? (
            <Mail size={17} />
          ) : step === "activate" ? (
            <ShieldCheck size={17} />
          ) : (
            <LockKeyhole size={17} />
          )}
          {step === "email"
            ? "Continue"
            : step === "activate"
              ? "Set password and continue"
              : "Sign in securely"}
          {!busy && <ArrowRight size={16} />}
        </button>
      )}

      {/* Escape hatch: someone who set a password but has not confirmed their
          email yet is not in the members table, so the lookup still says
          "activate". Let them jump straight to signing in. */}
      {step === "activate" && (
        <button
          type="button"
          onClick={() => {
            setPassword("");
            resetTo("password");
          }}
          className="w-full text-center text-[12px] font-semibold text-blue-primary hover:underline"
        >
          Already set a password? Sign in instead
        </button>
      )}
    </form>
  );
}
