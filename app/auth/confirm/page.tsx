"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

/**
 * Where the account-confirmation email lands. Supabase verifies the link and
 * redirects here with a fresh session in the URL fragment; this page exchanges
 * it for the app's HttpOnly session cookie and walks straight into the
 * product. Clicking the email IS the sign-in — nobody re-enters the password
 * they chose sixty seconds ago (Anir, Jul 27: "they should log in straight
 * from the email").
 *
 * The tokens ride in the #fragment, which never reaches any server log — this
 * page must be a client component, and it must never echo the tokens anywhere.
 */
export default function ConfirmLandingPage() {
  const [status, setStatus] = useState<"working" | "failed">("working");
  const [detail, setDetail] = useState<string | null>(null);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const query = new URLSearchParams(window.location.search);
    const accessToken = hash.get("access_token");
    const errorCode = hash.get("error_code") || query.get("error_code");

    // Strip the tokens from the address bar immediately — they should not
    // survive into history entries or a copied URL.
    window.history.replaceState(null, "", "/auth/confirm");

    async function run() {
      if (!accessToken) {
        // Expired or already-used links arrive as an error fragment instead of
        // a session. Send them to the login page with an honest reason — the
        // login form offers a fresh email from there.
        const reason =
          errorCode === "otp_expired" ? "link-expired" : "link-invalid";
        window.location.replace(`/login?confirm=${reason}`);
        return;
      }
      try {
        const response = await fetch("/api/auth/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessToken }),
        });
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
          approved?: boolean;
        };
        if (!response.ok) throw new Error(body.error || "Sign-in failed.");
        // Give the browser a beat to commit the HttpOnly cookies (same wait
        // the password form uses) before the top-level navigation.
        await new Promise((resolve) => window.setTimeout(resolve, 100));
        window.location.replace(body.approved ? "/dashboard" : "/access-pending");
      } catch (err) {
        setStatus("failed");
        setDetail(err instanceof Error ? err.message : "Sign-in failed.");
      }
    }
    void run();
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-6">
      <div className="w-full max-w-sm rounded-2xl border border-border-light bg-white p-8 text-center shadow-card">
        <p className="text-[22px] font-bold tracking-tight text-blue-primary">FREYR</p>
        {status === "working" ? (
          <>
            <Loader2
              size={22}
              className="mx-auto mt-5 animate-spin text-blue-primary"
            />
            <p className="mt-3 text-[14px] font-semibold text-text-primary">
              Confirming your email…
            </p>
            <p className="mt-1 text-[12.5px] text-text-tertiary">
              Signing you in — one moment.
            </p>
          </>
        ) : (
          <>
            <p className="mt-5 text-[14px] font-semibold text-text-primary">
              That didn&apos;t work
            </p>
            <p className="mt-1 text-[12.5px] text-text-secondary">{detail}</p>
            <a
              href="/login"
              className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-md bg-blue-primary text-[13.5px] font-semibold text-white hover:bg-blue-hover"
            >
              Go to sign-in
            </a>
          </>
        )}
      </div>
    </div>
  );
}
