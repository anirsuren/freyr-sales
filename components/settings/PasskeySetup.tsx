"use client";

import { useCallback, useEffect, useState } from "react";
import { Fingerprint, RotateCw, Trash2 } from "lucide-react";
import { startRegistration } from "@simplewebauthn/browser";
import { Button } from "@/components/ui/Button";

type Passkey = { id: string; label: string | null; createdAt: string; lastUsedAt: string | null };

/**
 * "Set up Touch ID" — enrol this device as a passkey (Anir, Aug 7: "I hate
 * logging in, I want to use Touch ID"). Your password keeps working; this is
 * an additional key to the same account.
 *
 * ONE SWITCH, NOT A DEVICE LIST. Touch ID is on or off for your account, and
 * while it is on you can Reset it (start over on the machine you are holding)
 * or Remove it. The first version listed each stored key as a row with its
 * own buttons and offered "Add another device" — which read like managing
 * sessions (Anir, Aug 8: "Why would it go on a session?... Why the fuck would
 * they add it to another device? They should be able to remove it or reset
 * it"). Reset and Remove act on every stored key, so a glitched one can never
 * survive by hiding behind a second row.
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

  async function deleteAllKeys() {
    for (const key of passkeys) {
      await fetch(`/api/auth/passkey?id=${encodeURIComponent(key.id)}`, { method: "DELETE" });
    }
    await load();
  }

  /** Turn Touch ID off. Password and the email link keep signing you in. */
  async function removeAll() {
    setBusy(true);
    setNote(null);
    try {
      await deleteAllKeys();
      setNote({ ok: true, text: "Touch ID is off. Your password and email link still work." });
    } finally {
      setBusy(false);
    }
  }

  /** Start over: throw every stored key away and enrol this device fresh. A
   *  glitched passkey must never need itself to get fixed (Anir, Aug 8: "I
   *  should be able to reset my touch ID for any reason... if something
   *  glitches") — this runs on your signed-in session alone. Cancelling the
   *  new prompt just leaves Touch ID off; you are never locked out. */
  async function resetAll() {
    setBusy(true);
    setNote(null);
    try {
      await deleteAllKeys();
    } finally {
      setBusy(false);
    }
    await enrol();
  }

  const on = passkeys.length > 0;
  const setUpAt = on
    ? new Date(Math.min(...passkeys.map((p) => new Date(p.createdAt).getTime())))
    : null;
  const lastUsedTimes = passkeys
    .map((p) => (p.lastUsedAt ? new Date(p.lastUsedAt).getTime() : null))
    .filter((t): t is number => t !== null);
  const lastUsedAt = lastUsedTimes.length ? new Date(Math.max(...lastUsedTimes)) : null;

  return (
    <div className="rounded-xl border border-border-light bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[14px] font-semibold text-text-primary">
            <Fingerprint size={16} strokeWidth={2} className="text-blue-primary" />
            Touch ID and passkeys
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-text-secondary">
            {on
              ? "Touch ID is on for this account. Sign in with your fingerprint instead of a password."
              : "Sign in with your fingerprint or face instead of typing a password. Your password still works."}
          </p>
          {on && setUpAt && (
            <p className="mt-1 text-[11.5px] text-text-tertiary tnum">
              Set up {setUpAt.toLocaleDateString()}
              {lastUsedAt ? ` · last used ${lastUsedAt.toLocaleDateString()}` : " · not used yet"}
            </p>
          )}
        </div>
        {on ? (
          <div className="text-[color:#DC2626] flex shrink-0 items-center gap-2">
            <Button
              onClick={() => void resetAll()}
              loading={busy}
              disabled={!supported}
              variant="secondary"
              title="Start over: remove Touch ID and set it up again on this device"
            >
              <RotateCw size={13} strokeWidth={2} />
              Reset
            </Button>
            {/* Every delete reads red (Anir, Aug 16: "all delete buttons
                have to be red"). */}
            <Button
              onClick={() => void removeAll()}
              disabled={busy}
              variant="destructive"
              title="Turn Touch ID off for this account"
            >
              <Trash2 size={13} strokeWidth={2} />
              Remove
            </Button>
          </div>
        ) : (
          <Button
            onClick={enrol}
            loading={busy}
            disabled={!supported}
            variant="primary"
            className="shrink-0"
          >
            Set up Touch ID
          </Button>
        )}
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
    </div>
  );
}
