"use client";

import { useEffect, useState } from "react";
import { friendlyAuthError } from "@/lib/authErrors";
import { useRouter } from "next/navigation";
import { Fingerprint } from "lucide-react";
import { startAuthentication } from "@simplewebauthn/browser";

/**
 * "Sign in with Touch ID" on /login. Only renders where passkeys exist, so a
 * browser that cannot do this never sees a button that would fail.
 */
export function PasskeySignIn({ next }: { next?: string }) {
  const router = useRouter();
  const [supported, setSupported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSupported(typeof window !== "undefined" && !!window.PublicKeyCredential);
  }, []);
  if (!supported) return null;

  async function signIn() {
    setBusy(true);
    setError(null);
    try {
      const optionsRes = await fetch("/api/auth/passkey/login/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!optionsRes.ok) throw new Error("Could not start sign-in.");
      const options = await optionsRes.json();
      const assertion = await startAuthentication({ optionsJSON: options });
      const verifyRes = await fetch("/api/auth/passkey/login/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: assertion, challenge: options.challenge }),
      });
      if (!verifyRes.ok) {
        throw new Error((await verifyRes.json()).error || "That passkey was not accepted.");
      }
      // Same landing rule the password path uses.
      router.push(next || "/offerings");
      router.refresh();
    } catch (caught) {
      const message = friendlyAuthError(caught) || "Sign-in failed.";
      // A cancelled prompt is silent. But "nothing matched" is the case that
      // actually confuses people: no passkey is enrolled on this device yet,
      // and the browser just shows an empty security-key dialog. Say so.
      setError(
        /NotAllowed|abort/i.test(message)
          ? "No passkey on this device yet. Sign in with your password, then set up Touch ID in Settings."
          : message
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={signIn}
        disabled={busy}
        className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-white text-[14px] font-semibold text-text-primary transition-colors hover:border-blue-primary hover:text-blue-primary disabled:opacity-50"
      >
        <Fingerprint size={18} strokeWidth={2} />
        {busy ? "Waiting for Touch ID…" : "Sign in with Touch ID"}
      </button>
      {error && <p className="mt-2 text-[12.5px] text-error">{error}</p>}
    </div>
  );
}
