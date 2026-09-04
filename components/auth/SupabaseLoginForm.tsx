"use client";

import { FULL_NAME_HINT, isFullName } from "@/lib/fullName";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  ArrowRight,
  Eye,
  EyeOff,
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

/**
 * THE ACTUAL MICROSOFT LOGO (Anir, Aug 15: "I need the actual Microsoft
 * logo"). A generic building icon was standing in for it, which is both
 * off-brand and, on a sign-in button, genuinely less recognisable — the four
 * squares are the thing people look for.
 *
 * Drawn inline rather than fetched: Microsoft's own guidance is the four
 * equal squares in these exact hues, and an inline SVG cannot fail to load,
 * cannot be blocked, and needs no network round trip on the login screen.
 */
function MicrosoftMark() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 23 23"
      aria-hidden="true"
      className="shrink-0"
    >
      <rect x="1" y="1" width="10" height="10" fill="#F25022" />
      <rect x="12" y="1" width="10" height="10" fill="#7FBA00" />
      <rect x="1" y="12" width="10" height="10" fill="#00A4EF" />
      <rect x="12" y="12" width="10" height="10" fill="#FFB900" />
    </svg>
  );
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
  const [ssoBusy, setSsoBusy] = useState(false);
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

  /**
   * HAND THE PERSON TO MICROSOFT, and let Supabase bring them back.
   *
   * signInWithSSO returns a URL rather than a session: the browser goes to
   * Entra, the person signs in with their Freyr account, and Microsoft posts a
   * signed assertion back to Supabase, which redirects here with the tokens in
   * the URL fragment. The effect handler at the top of this component already
   * watches for that fragment and calls establishSession, which is the same
   * final step the password path uses — so the app session is minted the one
   * way it always has been.
   */
  async function startMicrosoftSignIn() {
    if (!supabase) {
      setError("Sign-in is not configured yet.");
      return;
    }
    setError(null);
    setSsoBusy(true);
    try {
      const { data, error: ssoError } = await supabase.auth.signInWithSSO({
        domain: "freyrsolutions.com",
        options: { redirectTo: `${window.location.origin}/login` },
      });
      if (ssoError) throw ssoError;
      if (!data?.url) throw new Error("Microsoft sign-in is not available yet.");
      window.location.href = data.url;
    } catch (caught) {
      setSsoBusy(false);
      setError(friendlyAuthError(caught) || "Could not reach Microsoft.");
    }
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
      // A CODE, not a link: company mail security opens every link in an
      // email before the person can, which burned single-use reset links
      // (Veda, Aug 17 — "expired" within a minute, four times). A typed code
      // cannot be pre-clicked.
      //
      // Straight to the code page, no delay. The first version showed a
      // message and then jumped 2.5 seconds later, which read as a glitch
      // (Anir, Aug 17: "it glitched out, and then it went here"). The email
      // rides along in sessionStorage — never the URL — so the code page has
      // it filled in already.
      try {
        window.sessionStorage.setItem("freyr.reset.email", normalizedEmail);
      } catch {
        /* private-mode storage failures just mean retyping the email */
      }
      window.location.assign("/auth/reset-password");
    } catch (caught) {
      setError(friendlyAuthError(caught));
    } finally {
      setResetBusy(false);
    }
  }

  /**
   * THE EYE CHROME NEVER GAVE US (Saras via Anir, Aug 27: "the sign-in window
   * doesn't show the 'Show Password' option with the eye icon. It's there in
   * Microsoft Edge though"). Edge draws its own reveal control on password
   * boxes; Chrome, Safari and Firefox draw nothing, so half the team could
   * check their typing and half could not. One app-drawn eye on every
   * password box makes the form identical in every browser — and Edge's own
   * duplicate is switched off in CSS, or its users would see two eyes.
   */
  const [showPassword, setShowPassword] = useState(false);

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
              placeholder="you@freyrsolutions.com"
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
              placeholder="First name and last name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={inputClass}
            />
            {name.trim() !== "" && !isFullName(name) && (
              <span className="mt-1 block text-[11px] font-normal text-[color:var(--ink-orange)]">
                {FULL_NAME_HINT}
              </span>
            )}
          </label>
          <label className="block text-[12px] font-semibold text-text-secondary">
            Choose a password
            <span className="relative block">
              <input
                required
                minLength={8}
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={`${inputClass} pr-11 [&::-ms-reveal]:hidden`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                tabIndex={-1}
                className="absolute inset-y-0 right-0 top-1.5 flex w-11 cursor-pointer items-center justify-center text-text-tertiary transition-colors hover:text-text-primary"
              >
                {showPassword ? (
                  <EyeOff size={16} strokeWidth={2} />
                ) : (
                  <Eye size={16} strokeWidth={2} />
                )}
              </button>
            </span>
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
          <span className="relative block">
            <input
              id="login-password"
              required
              autoFocus
              minLength={8}
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={`${inputClass} pr-11 [&::-ms-reveal]:hidden`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              tabIndex={-1}
              className="absolute inset-y-0 right-0 top-1.5 flex w-11 cursor-pointer items-center justify-center text-text-tertiary transition-colors hover:text-text-primary"
            >
              {showPassword ? (
                <EyeOff size={16} strokeWidth={2} />
              ) : (
                <Eye size={16} strokeWidth={2} />
              )}
            </button>
          </span>
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
            {/* MICROSOFT IS REAL NOW (Anir, Aug 15: "I want to create a new
                account with SSO"). It used to say "Coming soon" because the
                Entra provider did not exist; it is registered against the
                freyrsolutions.com domain, so this hands the person to
                Microsoft and Supabase brings them back with a session.
                Additive on purpose: the email and password paths above are
                untouched, so anyone Entra does not know — the +2/+3 test
                accounts, anyone outside the tenant — signs in exactly as
                before. */}
            <button
              type="button"
              disabled={busy || ssoBusy}
              onClick={startMicrosoftSignIn}
              className="flex min-h-14 w-full cursor-pointer items-center gap-2.5 rounded-md border border-border-light bg-white px-3 text-left transition-colors hover:border-blue-subtle hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
            >
              {ssoBusy ? (
                <Loader2 size={16} className="shrink-0 animate-spin text-blue-primary" />
              ) : (
                <MicrosoftMark />
              )}
              <span className="min-w-0">
                <span className="block text-[12px] font-semibold text-text-primary">
                  Microsoft
                </span>
                <span className="block text-[10.5px] font-medium text-text-tertiary">
                  {ssoBusy ? "Taking you to Microsoft…" : "Use your Freyr work account"}
                </span>
              </span>
            </button>
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
