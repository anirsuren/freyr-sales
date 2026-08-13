"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  ArrowRight,
  Building2,
  Loader2,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { normalizeAuthEmail } from "@/lib/authEmailPolicy";
import { friendlyAuthError } from "@/lib/authErrors";

/**
 * Email-first sign-in. A colleague never has to decide whether they are
 * "signing in" or "creating an account" — they type their work address and the
 * form asks for the one thing that is actually missing: their password, either
 * to set for the first time or to sign in with.
 */
type Step = "email" | "password" | "activate" | "invite-only" | "sent";

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
  // Optional at activation — the agent writes in the rep's voice from day one
  // when it knows who they are (Anir: "it should be in the onboarding").
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const invitedEmail = normalizeAuthEmail(params.get("email"));
    const invitedName = params.get("name")?.trim();
    if (invitedEmail) setEmail(invitedEmail);
    if (invitedName && invitedName.length <= 120) setName(invitedName);

    // /auth/confirm reports why it bounced someone here.
    const confirm = params.get("confirm");
    if (confirm === "link-expired") {
      setError("That confirmation link expired. Enter your email and we'll send a fresh one.");
    } else if (confirm === "link-invalid") {
      setError("That confirmation link was already used or isn't valid. Sign in below.");
    }

    // Safety net: if Supabase ever redirects a confirmation here instead of
    // /auth/confirm (e.g. a stale redirect allow-list), the session tokens
    // arrive in the fragment. Finish the sign-in instead of dropping them —
    // clicking the email must sign you in, never strand you at this form.
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const strayToken = hash.get("access_token");
    if (strayToken) {
      window.history.replaceState(null, "", window.location.pathname);
      setBusy(true);
      establishSession(strayToken).catch((caught) => {
        setBusy(false);
        setError(
          friendlyAuthError(caught) || "Could not complete sign-in."
        );
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            linkedinUrl: linkedinUrl.trim() || undefined,
          }),
        });
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
          alreadyRegistered?: boolean;
        };
        if (!response.ok) throw new Error(body.error || "Could not set up your account.");
        setPassword("");
        // Already had an account: stop asking them to invent a password they
        // already chose — hand them the sign-in screen (Anir: "I already did
        // that. Do you see what I'm saying?").
        if (body.alreadyRegistered) {
          setMessage("");
          setError("");
          resetTo("password");
          setMessage("You already have an account here: enter your password to sign in.");
          return;
        }
        setError("");
        setStep("sent");
        return;
      }

      if (!supabase) throw new Error("Sign-in is not configured yet.");
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      if (signInError) {
        // Say what's actually wrong: the password may be perfectly right and
        // the account merely unconfirmed. Supabase's raw "Email not confirmed"
        // gives no way forward, so offer one (the resend below).
        if (/not confirmed/i.test(signInError.message)) {
          setStep("sent");
          setError(null);
          setMessage(
            "Your email isn't confirmed yet: the sign-in link is in your inbox. Need a new one? Resend below."
          );
          return;
        }
        throw signInError;
      }
      if (!data.session?.access_token) {
        throw new Error("Could not establish a sign-in session.");
      }
      await establishSession(data.session.access_token);
    } catch (caught) {
      setError(
        friendlyAuthError(caught)
      );
    } finally {
      setBusy(false);
    }
  }

  async function requestPasswordReset() {
    const normalizedEmail = normalizeAuthEmail(email);
    if (!normalizedEmail) {
      setError("Enter a valid email address first.");
      return;
    }

    setResetBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(body.error || "Could not send the reset email.");
      }
      setMessage(
        "Password reset email sent. Open the newest email from Freyr Sales to choose a new password."
      );
    } catch (caught) {
      setError(friendlyAuthError(caught));
    } finally {
      setResetBusy(false);
    }
  }

  const inputClass =
    "mt-1.5 h-11 w-full rounded-md border border-border bg-white px-3 text-[14px] text-text-primary outline-none focus:border-blue-primary";

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
              ? `Your ${joinDomainLabel} address gets in automatically: no invitation needed.`
              : "Use the exact address your workspace owner invited."}
          </p>
        </>
      ) : step === "sent" ? null : (
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
            Your account is ready, just add your name and choose a password.
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
          <label className="block text-[12px] font-semibold text-text-secondary">
            LinkedIn profile <span className="font-normal text-text-tertiary">(optional)</span>
            <input
              type="url"
              inputMode="url"
              autoComplete="url"
              placeholder="https://www.linkedin.com/in/your-profile"
              value={linkedinUrl}
              onChange={(event) => setLinkedinUrl(event.target.value)}
              className={inputClass}
            />
          </label>
          <p className="-mt-2 text-[11px] text-text-tertiary">
            The AI agent reads this to learn your role and background, so what it
            drafts sounds like you, and it picks up your photo. You can add it
            later in Settings.
          </p>
        </>
      )}

      {step === "password" && (
        <div>
          <div className="flex items-center justify-between gap-3">
            <label
              htmlFor="login-password"
              className="text-[12px] font-semibold text-text-secondary"
            >
              Password
            </label>
            <button
              type="button"
              disabled={busy || resetBusy}
              onClick={() => void requestPasswordReset()}
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-blue-primary hover:underline disabled:cursor-not-allowed disabled:opacity-60"
            >
              {resetBusy && <Loader2 size={13} className="animate-spin" />}
              {resetBusy ? "Sending reset email…" : "Forgot password?"}
            </button>
          </div>
          <input
            id="login-password"
            required
            autoFocus
            minLength={8}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={inputClass}
          />
        </div>
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

      {/* No "I confirmed it" button. The email link itself signs you in and
          lands in the product, so there is nothing to click here (Anir, Jul
          27: "that button should not exist, they should log in straight from
          the email"). This screen's only jobs: say where the link went, and
          offer a fresh one if it never arrived. */}
      {step === "sent" && (
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-light text-blue-primary">
            <Mail size={22} strokeWidth={1.9} />
          </div>
          <div>
            <p className="text-[15px] font-semibold text-text-primary">
              Check your email
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-text-secondary">
              We sent a sign-in link to{" "}
              <span className="font-semibold text-text-primary">{email}</span>.
              Clicking it signs you in automatically, that&apos;s it.
            </p>
            {/* Say it before they wait ten minutes and give up. A first message
                from a new sender is exactly what a mail filter holds back, and
                the people signing up here are on Outlook (Anir, Aug 13: "make
                sure it tells them to check their spam or their junk"). */}
            <p className="mt-2 text-[12.5px] leading-relaxed text-text-tertiary">
              Not there? Check your spam or junk folder, it often lands there
              the first time.
            </p>
            {/* A refused RESEND used to leave a red error sitting over an
                unchanged "we sent it" panel, which reads as the whole thing
                having failed (Anir, Aug 13: "what the fuck does this mean").
                It had not: the first link was sent and still works, and that
                is the one sentence that matters here. */}
            {error && (
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-text-tertiary">
                Nothing else is needed. Open the link that is already there.
              </p>
            )}
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              if (!supabase) return;
              setBusy(true);
              setError(null);
              try {
                const { error: resendError } = await supabase.auth.resend({
                  type: "signup",
                  email: normalizeAuthEmail(email) || email,
                });
                if (resendError) throw resendError;
                setMessage("Sent: check your inbox for the newest email.");
              } catch (caught) {
                setError(
                  friendlyAuthError(caught) || "Could not resend the email."
                );
              } finally {
                setBusy(false);
              }
            }}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-md border border-border text-[13px] font-semibold text-text-secondary hover:bg-surface disabled:opacity-60"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />}
            Didn&apos;t get it? Resend the email
          </button>
          <button
            type="button"
            onClick={() => {
              setPassword("");
              resetTo("email");
            }}
            className="text-[12px] font-semibold text-blue-primary hover:underline"
          >
            Wrong address? Start over
          </button>
        </div>
      )}

      {step !== "invite-only" && step !== "sent" && (
        <button
          type="submit"
          disabled={busy || resetBusy}
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

      {step === "email" && (
        <div className="space-y-2 border-t border-border-light pt-4">
          <p className="text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
            More sign-in options
          </p>
          <div className="grid grid-cols-1 gap-2">
            {/* "Passkey — Coming soon" is gone: it sat directly above a
                working "Sign in with Touch ID" button and told you the exact
                opposite (Anir, Aug 7). Microsoft stays because it genuinely
                is not built. */}
            {[{ label: "Microsoft", Icon: Building2 }].map(({ label, Icon }) => (
              <div
                key={label}
                aria-disabled="true"
                className="flex min-h-14 items-center gap-2.5 rounded-md border border-border-light bg-surface px-3 text-left"
              >
                <Icon size={16} className="shrink-0 text-text-secondary" />
                <span className="min-w-0">
                  <span className="block text-[12px] font-semibold text-text-primary">
                    {label}
                  </span>
                  <span className="block text-[10.5px] font-medium text-text-tertiary">
                    Coming soon
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
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
