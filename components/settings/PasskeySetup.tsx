"use client";

import { useCallback, useEffect, useState } from "react";
import { Fingerprint, Trash2 } from "lucide-react";
import { startRegistration } from "@simplewebauthn/browser";
import { Button } from "@/components/ui/Button";

type Passkey = { id: string; label: string | null; createdAt: string; lastUsedAt: string | null };

/**
 * "Set up Touch ID" — enrol this device as a passkey (Anir, Aug 7: "I hate
 * logging in, I want to use Touch ID"). Your password keeps working; this is
 * an additional key to the same account.
 */
export function PasskeySetup() {
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [supported, setSupported] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/passkey");
      if (!res.ok) return;
      const data = (await res.json()) as { passkeys: Passkey[] };
      setPasskeys(data.passkeys || []);
    } catch {
      // A failed list must never block the rest of Settings.
    }
  }, []);

  useEffect(() => {
    setSupported(typeof window !== "undefined" && !!window.PublicKeyCredential);
    void load();
  }, [load]);

  async function enrol() {
    setBusy(true);
    setNote(null);
    try {
      const optionsRes = await fetch("/api/auth/passkey/register/options", { method: "POST" });
      if (!optionsRes.ok) throw new Error((await optionsRes.json()).error || "Could not start.");
      const options = await optionsRes.json();
      const attestation = await startRegistration({ optionsJSON: options });
      const label =
        /Mac/i.test(navigator.userAgent) ? "Touch ID on this Mac"
        : /iPhone|iPad/i.test(navigator.userAgent) ? "Face ID on this iPhone"
        : /Windows/i.test(navigator.userAgent) ? "Windows Hello"
        : "This device";
      const verifyRes = await fetch("/api/auth/passkey/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: attestation, challenge: options.challenge, label }),
      });
      if (!verifyRes.ok) throw new Error((await verifyRes.json()).error || "Could not save it.");
      setNote({ ok: true, text: "Done. Next time, sign in with Touch ID." });
      await load();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Something went wrong.";
      setNote({
        ok: false,
        // A cancelled prompt is not an error worth shouting about.
        text: /NotAllowed|abort/i.test(message) ? "Cancelled." : message,
      });
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/auth/passkey?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="rounded-xl border border-border-light bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[14px] font-semibold text-text-primary">
            <Fingerprint size={16} strokeWidth={2} className="text-blue-primary" />
            Touch ID and passkeys
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-text-secondary">
            {passkeys.length > 0
              ? `Touch ID is on for this account. Sign in with your fingerprint instead of a password${
                  passkeys.length === 1 ? "" : ` on ${passkeys.length} devices`
                }.`
              : "Sign in with your fingerprint or face instead of typing a password. Your password still works."}
          </p>
        </div>
        {/* THE BUTTON SAYS WHAT IT WILL DO NEXT. It read "Set up Touch ID"
            even once you had, which reads as "that did not work" (Anir, Aug 7:
            "I just set up Touch ID and now it's saying I have to set up Touch
            ID again"). With a key already on this device the job is adding
            another one. */}
        <Button
          onClick={enrol}
          loading={busy}
          disabled={!supported}
          variant={passkeys.length > 0 ? "secondary" : "primary"}
          className="shrink-0"
        >
          {passkeys.length > 0 ? "Add another device" : "Set up Touch ID"}
        </Button>
      </div>

      {!supported && (
        <p className="mt-3 text-[12px] text-text-tertiary">
          This browser does not support passkeys.
        </p>
      )}
      {note && (
        <p
          className={`mt-3 text-[12.5px] font-medium ${
            note.ok ? "text-success" : "text-error"
          }`}
        >
          {note.text}
        </p>
      )}

      {passkeys.length > 0 && (
        <ul className="mt-4 space-y-2">
          {passkeys.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-3 rounded-lg border border-border-light px-3 py-2"
            >
              <Fingerprint size={14} strokeWidth={2} className="shrink-0 text-blue-primary" />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold text-text-primary">
                  {p.label || "Passkey"}
                </span>
                <span className="block text-[11.5px] text-text-tertiary">
                  Added {new Date(p.createdAt).toLocaleDateString()}
                  {p.lastUsedAt
                    ? ` · last used ${new Date(p.lastUsedAt).toLocaleDateString()}`
                    : " · not used yet"}
                </span>
              </span>
              <button
                type="button"
                onClick={() => remove(p.id)}
                aria-label={`Remove ${p.label || "passkey"}`}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-error/10 hover:text-error"
              >
                <Trash2 size={14} strokeWidth={2} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
