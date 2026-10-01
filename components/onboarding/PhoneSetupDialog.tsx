"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useCurrentUserOrNull } from "@/components/auth/CurrentUserProvider";
import { DEMO_SCENES, WhatsAppDemoPhone, prettyPhone } from "@/components/onboarding/WhatsAppDemoPhone";

/**
 * CONNECT YOUR PHONE: the one pop-up for it, at sign-up and from Settings
 * (Anir, Oct 1: "it has to have the QR code... it should be clear that they
 * have to scan it... I can't even click out of it... In settings, I should be
 * able to bring this pop-up back").
 *
 * The QR opens WhatsApp with the person's six-digit code already typed in;
 * one tap on Send links the phone it came from (proof of possession, so
 * nobody types a phone number). The code is made the moment the pop-up opens,
 * renewed before it runs out, and the pop-up turns to "connected" on its own
 * when the text lands. The X, a click outside and Escape all close it. The
 * frame is one fixed size whatever state it is in.
 */

type Status = {
  configured: boolean;
  canSend: boolean;
  businessNumber: string;
  link: { number: string; linkedAt?: string; name?: string } | null;
  pending: { code: string; expires: string; waMe: string | null; qr: string | null } | null;
};

export type PhoneSetupOutcome = "connected" | "dismissed";

/** Other surfaces (the Settings card) refresh when a phone connects here. */
export const WHATSAPP_CHANGED_EVENT = "freyr:whatsapp-changed";

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';
const POLL_MS = 3_000;

const STEPS = [
  { title: "Scan with your phone's camera", sub: "Point it at this code" },
  { title: "Tap Send in WhatsApp", sub: "Your code is already typed in" },
  { title: "That's it", sub: "This window updates by itself" },
];

const fmtCode = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;

export function PhoneSetupDialog({
  mode,
  onClose,
}: {
  mode: "onboarding" | "settings";
  onClose: (outcome: PhoneSetupOutcome) => void;
}) {
  const user = useCurrentUserOrNull();
  // The generic identity ("Freyr user") has no first name worth greeting.
  const firstName = /^freyr user$/i.test(user?.name ?? "") ? "" : ((user?.name ?? "").trim().split(/\s+/)[0] ?? "");
  const [mounted, setMounted] = useState(false);
  const [phase, setPhase] = useState<"loading" | "ready" | "unavailable" | "error">("loading");
  const [status, setStatus] = useState<Status | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [scene, setScene] = useState(0);
  const dialog = useRef<HTMLDivElement>(null);
  const renewing = useRef(false);
  const connected = !!status?.link;
  const connectedRef = useRef(connected);
  connectedRef.current = connected;

  useEffect(() => setMounted(true), []);

  const close = useCallback(() => onClose(connectedRef.current ? "connected" : "dismissed"), [onClose]);
  const closeRef = useRef(close);
  closeRef.current = close;

  const fetchStatus = useCallback(async (): Promise<Status> => {
    const response = await fetch("/api/profile/whatsapp", { cache: "no-store" });
    if (!response.ok) throw new Error("status");
    return (await response.json()) as Status;
  }, []);

  /** A fresh code (and with it a fresh QR). */
  const newCode = useCallback(async () => {
    if (renewing.current) return;
    renewing.current = true;
    try {
      const response = await fetch("/api/profile/whatsapp", { method: "POST" });
      const data = (await response.json().catch(() => null)) as (Status & { error?: string }) | null;
      if (!response.ok || !data) throw new Error(data?.error || "Could not make a code.");
      setStatus(data);
    } finally {
      renewing.current = false;
    }
  }, []);

  // Open: where is this person, and a code ready to scan straight away.
  useEffect(() => {
    let alive = true;
    setPhase("loading");
    (async () => {
      try {
        const current = await fetchStatus();
        if (!alive) return;
        setStatus(current);
        if (current.link) return setPhase("ready");
        if (!current.configured || !current.businessNumber) return setPhase("unavailable");
        if (!current.pending || Date.parse(current.pending.expires) - Date.now() < 60_000) await newCode();
        if (alive) setPhase("ready");
      } catch {
        if (alive) setPhase("error");
      }
    })();
    return () => {
      alive = false;
    };
  }, [fetchStatus, newCode, attempt]);

  // Waiting: watch for the text to land, and renew the code before it lapses.
  const waiting = phase === "ready" && !connected;
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(async () => {
      try {
        const current = await fetchStatus();
        if (current.link) {
          setStatus(current);
          window.dispatchEvent(new CustomEvent(WHATSAPP_CHANGED_EVENT));
          return;
        }
        if (!current.pending || Date.parse(current.pending.expires) - Date.now() < 30_000) await newCode();
        else setStatus(current);
      } catch {
        // A missed check is not a failure; the next one asks again.
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [waiting, fetchStatus, newCode]);

  // The QR, drawn here at full error correction so Freyr's mark can sit in the middle.
  const waMe = status?.pending?.waMe ?? null;
  const serverQr = status?.pending?.qr ?? null;
  useEffect(() => {
    let alive = true;
    if (!waMe) {
      setQr(null);
      return;
    }
    import("qrcode")
      .then(({ toDataURL }) =>
        toDataURL(waMe, { errorCorrectionLevel: "H", margin: 0, width: 520, color: { dark: "#0B1F3A", light: "#FFFFFF" } }),
      )
      .then((url) => alive && setQr(url))
      .catch(() => alive && setQr(serverQr));
    return () => {
      alive = false;
    };
  }, [waMe, serverQr]);

  // Keyboard: Escape closes, Tab stays inside, focus returns to where it was.
  useEffect(() => {
    if (!mounted) return;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialog.current) return;
      const items = [...dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetWidth > 0 || el.offsetHeight > 0);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey ? active === first || active === dialog.current : active === last) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (previous && document.contains(previous)) previous.focus();
    };
  }, [mounted]);

  if (!mounted) return null;
  const pending = status?.pending ?? null;
  const number = prettyPhone(status?.businessNumber ?? "");
  const Scene = DEMO_SCENES[scene];

  return createPortal(
    <div
      className="backdrop-in fixed inset-0 z-[130] flex items-center justify-center bg-black/45 p-6 backdrop-blur-[4px]"
      // Above the agent bubble (z-120), so its nudges never float over the pop-up.
      // A click outside closes it, and stops here so nothing underneath opens too.
      onClick={(event) => {
        event.stopPropagation();
        close();
      }}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="phone-setup-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="modal-in relative grid h-[min(680px,calc(100vh-3rem))] w-full max-w-[1060px] grid-cols-1 overflow-hidden rounded-[28px] bg-white shadow-[0_40px_120px_-30px_rgba(0,0,0,0.55)] outline-none md:grid-cols-[minmax(0,1fr)_minmax(0,470px)]"
      >
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full bg-white/85 text-text-primary shadow-[0_1px_3px_rgba(0,0,0,0.12)] ring-1 ring-black/[0.06] backdrop-blur transition hover:bg-white hover:shadow-[0_2px_8px_rgba(0,0,0,0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-primary/40"
        >
          <X size={17} strokeWidth={2} />
        </button>

        {/* Left: what it is, and the one thing to do. */}
        <section className="flex min-h-0 flex-col overflow-y-auto px-10 pb-7 pt-9">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/freyr-mark.png" alt="" width={32} height={32} className="h-8 w-8 rounded-[9px]" />
            <span className="text-[13px] font-semibold text-text-primary">Freyr</span>
            <span className="h-3.5 w-px bg-border-light" aria-hidden="true" />
            <span className="text-[13px] font-medium text-text-secondary">Your agent on WhatsApp</span>
          </div>

          <h2 id="phone-setup-title" className="mt-7 text-[34px] font-semibold leading-[1.08] tracking-[-0.03em] text-text-primary [text-wrap:balance]">
            Your agent,
            <br />
            one text away.
          </h2>
          <p className="mt-3 max-w-[410px] text-[14px] leading-[1.55] text-text-secondary">
            Briefs, files, voice notes and changes you approve with a YES, from the WhatsApp you already use. It works with your access, nothing more.
          </p>

          {phase === "unavailable" ? (
            <div className="mt-7 rounded-[22px] bg-blue-light/50 p-6 ring-1 ring-blue-primary/10">
              <p className="text-[15px] font-semibold text-text-primary">WhatsApp isn&apos;t switched on here yet</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-text-secondary">
                Once an admin adds Freyr&apos;s WhatsApp number, connect from Settings, then Integrations.
              </p>
            </div>
          ) : phase === "error" ? (
            <div className="mt-7 rounded-[22px] bg-blue-light/50 p-6 ring-1 ring-blue-primary/10">
              <p className="text-[15px] font-semibold text-text-primary">Your code didn&apos;t load</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-text-secondary">Check the connection and try again.</p>
              <Button variant="secondary" className="mt-4" onClick={() => setAttempt((n) => n + 1)}>
                <RefreshCw size={14} strokeWidth={2} aria-hidden="true" />
                Try again
              </Button>
            </div>
          ) : connected && status?.link ? (
            <div className="mt-7 rounded-[22px] bg-success/[0.08] p-6 ring-1 ring-success/25">
              <div className="flex items-center gap-4">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-success text-white shadow-[0_8px_20px_-8px_rgba(52,199,89,0.8)]">
                  <Check size={24} strokeWidth={2.8} />
                </span>
                <div className="min-w-0">
                  <p className="text-[17px] font-semibold text-text-primary">You&apos;re connected</p>
                  <p className="mt-0.5 text-[13px] text-text-secondary">
                    <span className="font-semibold tabular-nums text-text-primary">{prettyPhone(status.link.number)}</span> now reaches your agent.
                  </p>
                </div>
              </div>
              <p className="mt-4 text-[13px] leading-relaxed text-text-secondary">
                Say hi on WhatsApp{number ? <> at <span className="font-semibold tabular-nums text-text-primary">{number}</span></> : null}. Try &ldquo;brief me&rdquo;, or send it a PDF.
              </p>
            </div>
          ) : (
            <>
              <div className="mt-7 rounded-[22px] bg-[linear-gradient(180deg,rgba(0,113,227,0.075),rgba(0,113,227,0.03))] p-5 ring-1 ring-blue-primary/10">
                <div className="flex items-center gap-6">
                  <div className="relative grid h-[176px] w-[176px] shrink-0 place-items-center rounded-[18px] bg-white p-3 shadow-[0_1px_2px_rgba(0,0,0,0.05),0_12px_28px_-14px_rgba(0,113,227,0.5)]">
                    {qr ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={qr} alt="QR code: scan it with your phone to connect WhatsApp to Freyr" className="h-full w-full" />
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src="/freyr-mark.png"
                          alt=""
                          width={38}
                          height={38}
                          className="absolute left-1/2 top-1/2 h-[38px] w-[38px] -translate-x-1/2 -translate-y-1/2 rounded-[10px] ring-[5px] ring-white"
                        />
                      </>
                    ) : (
                      <span className="h-full w-full animate-pulse rounded-[10px] bg-blue-light" aria-label="Making your code" />
                    )}
                  </div>
                  <ol className="flex min-w-0 flex-col gap-4">
                    {STEPS.map((step, i) => (
                      <li key={step.title} className="flex gap-3">
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white text-[12px] font-semibold text-blue-primary shadow-[0_0_0_1px_rgba(0,113,227,0.2)]">
                          {i + 1}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[13.5px] font-medium leading-5 text-text-primary">{step.title}</span>
                          <span className="block text-[12px] leading-4 text-text-secondary">{step.sub}</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
                <div className="mt-4 flex items-center gap-2 border-t border-blue-primary/10 pt-3.5 text-[12.5px] font-medium text-blue-primary" role="status">
                  <span className="relative flex h-2 w-2" aria-hidden="true">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-primary/50" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-primary" />
                  </span>
                  {phase === "loading" ? "Making your code" : "Waiting for your message"}
                </div>
              </div>
              <p className="mt-4 text-[12.5px] leading-relaxed text-text-secondary">
                {pending ? (
                  <>
                    No camera? Text <span className="font-semibold tabular-nums text-text-primary">{fmtCode(pending.code)}</span>
                    {number ? <> to <span className="font-semibold tabular-nums text-text-primary">{number}</span></> : null}
                    {pending.waMe ? (
                      <>
                        {" · "}
                        <a href={pending.waMe} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-primary hover:underline">
                          open WhatsApp here
                        </a>
                      </>
                    ) : null}
                  </>
                ) : (
                  " "
                )}
              </p>
            </>
          )}

          <div className="mt-auto flex items-center justify-between gap-4 pt-6">
            {connected ? (
              <>
                <span />
                <Button onClick={close}>{mode === "onboarding" ? "Start using Freyr" : "Done"}</Button>
              </>
            ) : mode === "onboarding" ? (
              <>
                <Button variant="ghost" className="-ml-3" onClick={close}>
                  Skip for now
                </Button>
                <span className="text-[12px] text-text-secondary">You can connect later in Settings</span>
              </>
            ) : (
              <span />
            )}
          </div>
        </section>

        {/* Right: the agent at work, as it looks on the phone. */}
        <section className="relative hidden min-h-0 flex-col overflow-hidden bg-[radial-gradient(130%_85%_at_50%_0%,#E3EEFF_0%,#EEF4FF_45%,#F6F8FC_100%)] md:flex dark:bg-[radial-gradient(130%_85%_at_50%_0%,#13284A_0%,#0E1B31_50%,#0B1424_100%)]">
          <div className="flex min-h-0 flex-1 items-center justify-center px-8 pt-9">
            <WhatsAppDemoPhone businessNumber={status?.businessNumber ?? ""} firstName={firstName} onScene={setScene} />
          </div>
          <div className="flex h-[78px] shrink-0 flex-col items-center justify-center gap-2.5">
            <p key={scene} className="modal-in flex items-center gap-2 text-[13px] font-medium text-text-primary">
              <Scene.icon size={15} strokeWidth={2} className="text-blue-primary" aria-hidden="true" />
              {Scene.label}
            </p>
            <div className="flex items-center gap-1.5" aria-hidden="true">
              {DEMO_SCENES.map((s, i) => (
                <span
                  key={s.label}
                  className={`h-1.5 rounded-full transition-all duration-300 ${i === scene ? "w-5 bg-blue-primary" : "w-1.5 bg-blue-primary/25"}`}
                />
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>,
    document.body,
  );
}
