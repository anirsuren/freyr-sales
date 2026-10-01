"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, Check, FileText, MessageCircle, Smartphone } from "lucide-react";
import { useCurrentUserOrNull } from "@/components/auth/CurrentUserProvider";
import { PhoneSetupDialog, WHATSAPP_CHANGED_EVENT } from "@/components/onboarding/PhoneSetupDialog";
import { WhatsAppDemoPhone, prettyPhone } from "@/components/onboarding/WhatsAppDemoPhone";
import { cn } from "@/lib/utils";

/**
 * THE WHATSAPP STOP ON THE TOUR (Anir, Oct 1: "It doesn't look like I got any
 * message about a WhatsApp agent... Now the user doesn't even know that it
 * exists").
 *
 * Not a highlight on the page: the agent on the phone is the thing to see, so
 * the step shows it working, says what it does in four lines, and offers the
 * one-scan connect right there. Connecting opens THE phone pop-up (the same
 * one Settings opens), above the tour; closing it lands back on this step.
 */

type WhatsAppStatus = {
  configured: boolean;
  businessNumber: string;
  link: { number: string } | null;
};

const POINTS = [
  { icon: MessageCircle, title: "Ask anything", body: "Deals, customers, goals and offerings, answered with your access." },
  { icon: FileText, title: "Voice notes and files", body: "Send a voice note, a PDF, a deck or a photo and it reads it." },
  { icon: BellRing, title: "Reminders at your time", body: "Say \"remind me at 4pm\" and the text arrives at 4pm." },
  { icon: Check, title: "Nothing saved without you", body: "It drafts, you reply YES, and only then is it saved." },
] as const;

export function TourWhatsAppShowcase({
  description,
  reducedMotion,
}: {
  description: string;
  reducedMotion: boolean;
}) {
  const user = useCurrentUserOrNull();
  const firstName = /^freyr user$/i.test(user?.name ?? "") ? "" : (user?.name ?? "").trim().split(/\s+/)[0] ?? "";
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [connecting, setConnecting] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/profile/whatsapp", { cache: "no-store" });
      if (!response.ok) return;
      setStatus((await response.json()) as WhatsAppStatus);
    } catch {
      // The demo and the copy still stand; the button simply waits.
    }
  }, []);

  useEffect(() => {
    void load();
    const refresh = () => void load();
    window.addEventListener(WHATSAPP_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(WHATSAPP_CHANGED_EVENT, refresh);
  }, [load]);

  const linked = status?.link?.number ?? null;

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_300px] gap-8">
      <div className="flex min-h-0 flex-col">
        <p className="text-[13.5px] leading-[1.62] text-text-secondary">{description}</p>
        <ul className={cn("mt-5 space-y-3.5", !reducedMotion && "tour-stagger")}>
          {POINTS.map((point) => (
            <li key={point.title} className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-blue-light text-blue-primary">
                <point.icon size={15} strokeWidth={2.1} aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-text-primary">{point.title}</span>
                <span className="block text-[12.5px] leading-snug text-text-secondary">{point.body}</span>
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-auto pt-5">
          {linked ? (
            <div className="flex items-center gap-2.5 rounded-xl border border-success/25 bg-success/[0.06] px-3.5 py-3" role="status">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-success text-white">
                <Check size={15} strokeWidth={2.6} aria-hidden="true" />
              </span>
              <span className="text-[13px] text-text-primary">
                <span className="font-semibold">Connected.</span> Text{" "}
                <span className="tabular-nums">{status?.businessNumber ? prettyPhone(status.businessNumber) : "the Freyr number"}</span>{" "}
                from <span className="tabular-nums">{prettyPhone(linked)}</span> and your agent answers.
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <button
                type="button"
                onClick={() => setConnecting(true)}
                disabled={!status?.configured}
                data-testid="product-tour-connect-phone"
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-primary px-4 text-[13.5px] font-semibold text-white shadow-[0_8px_22px_-6px_rgba(0,113,227,0.55)] transition-[background-color,transform,box-shadow] hover:-translate-y-px hover:bg-blue-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
              >
                <Smartphone size={16} strokeWidth={2.1} aria-hidden="true" />
                Connect my phone
              </button>
              <span className="text-[12px] leading-snug text-text-tertiary">
                One scan with your camera. Or later, from Settings.
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="relative flex min-h-0 items-center justify-center overflow-hidden rounded-[22px] bg-blue-light/70">
        <div aria-hidden="true" className="tour-whatsapp-glow pointer-events-none absolute inset-x-6 top-10 h-40 rounded-full bg-blue-primary/20 blur-3xl" />
        {/* The phone scales to the room it has; it is never cropped. */}
        <div className="relative h-full max-h-[460px] py-5">
          <WhatsAppDemoPhone businessNumber={status?.businessNumber ?? ""} firstName={firstName} />
        </div>
      </div>

      {connecting && (
        <PhoneSetupDialog
          mode="settings"
          onClose={() => {
            setConnecting(false);
            void load();
          }}
        />
      )}
    </div>
  );
}
