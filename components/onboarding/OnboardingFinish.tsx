"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ArrowRight, MessageCircle, Sparkles, X } from "lucide-react";
import { addMockModePrefix, isMockModePath } from "@/lib/modeUrl";
import { cn } from "@/lib/utils";

/**
 * THE LAST CARD OF THE TOUR. It says the tour is over, and offers the three
 * first moves that matter most: ask the agent, finish your profile, and get
 * to work. The phone is not one of them: the WhatsApp pop-up comes right
 * after this card closes (Anir, Oct 1: "the whatsapp agent has to come after
 * the onboarding is done or skipped"). Same frame rules as the welcome card:
 * X, Escape and a click outside close it, and it never changes size.
 */
export function OnboardingFinish({
  firstName,
  home,
  homeName,
  canOpenAgent,
  onClose,
}: {
  firstName: string;
  home: string;
  homeName: string;
  canOpenAgent: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const doneRef = useRef<HTMLButtonElement>(null);
  const after = useRef<(() => void) | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted) return;
    const frame = window.requestAnimationFrame(() => doneRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [mounted]);

  const leave = useCallback((then?: () => void) => {
    after.current = then ?? null;
    setLeaving(true);
  }, []);

  useEffect(() => {
    if (!leaving) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => {
      onClose();
      after.current?.();
    }, reduce ? 0 : 240);
    return () => window.clearTimeout(timer);
  }, [leaving, onClose]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      leave();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [leave]);

  const go = (route: string) => () =>
    leave(() => router.push(isMockModePath(window.location.pathname) ? addMockModePrefix(route) : route));

  if (!mounted) return null;

  return createPortal(
    <div className={cn("tour-welcome-root fixed inset-0 z-[124] flex items-center justify-center p-6", leaving && "is-leaving")} data-testid="onboarding-finish">
      <div
        aria-hidden="true"
        className="tour-welcome-backdrop absolute inset-0 bg-[rgba(8,15,28,0.58)] backdrop-blur-[6px]"
        onMouseDown={() => leave()}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-finish-title"
        className="tour-welcome-card relative flex h-[min(520px,calc(100vh-3rem))] w-full max-w-[640px] flex-col overflow-hidden rounded-[28px] bg-white px-10 pb-9 pt-11 text-center shadow-[0_40px_120px_-30px_rgba(8,15,28,0.65),0_0_0_1px_rgba(0,113,227,0.18)]"
      >
        <button
          type="button"
          onClick={() => leave()}
          aria-label="Close"
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-text-tertiary transition-colors hover:bg-surface hover:text-text-primary"
        >
          <X size={18} />
        </button>

        <div className="relative mx-auto flex h-[72px] w-[72px] items-center justify-center">
          <span aria-hidden="true" className="tour-finish-ring absolute inset-0 rounded-full border-2 border-blue-primary/40" />
          <span aria-hidden="true" className="tour-finish-ring absolute inset-0 rounded-full border-2 border-blue-primary/25" style={{ animationDelay: "0.35s" }} />
          <span className="tour-finish-badge relative flex h-[72px] w-[72px] items-center justify-center rounded-full bg-blue-primary text-white shadow-[0_16px_34px_-12px_rgba(0,113,227,0.8)]">
            <svg width="34" height="34" viewBox="0 0 24 24" aria-hidden="true">
              <path className="tour-finish-check" d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </div>

        <h2 id="onboarding-finish-title" className="tour-welcome-rise mt-6 text-[26px] font-semibold tracking-[-0.03em] text-text-primary" style={{ animationDelay: "120ms" }}>
          {`You're all set${firstName ? `, ${firstName}` : ""}.`}
        </h2>
        <p className="tour-welcome-rise mx-auto mt-2 max-w-[460px] text-balance text-[14px] leading-relaxed text-text-secondary" style={{ animationDelay: "170ms" }}>
          That is everything your account can open today. Three good first moves:
        </p>

        <div className="tour-welcome-rise mt-6 grid grid-cols-3 gap-3 text-left" style={{ animationDelay: "230ms" }}>
          <button
            type="button"
            onClick={go("/agent")}
            disabled={!canOpenAgent}
            className="group flex flex-col items-start rounded-2xl border border-border-light bg-white p-4 text-left transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-blue-primary/40 hover:shadow-[0_12px_28px_-14px_rgba(0,113,227,0.45)] disabled:pointer-events-none disabled:opacity-50"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-light text-blue-primary">
              <Sparkles size={17} strokeWidth={2} />
            </span>
            <span className="mt-3 text-[13.5px] font-semibold text-text-primary">Ask your agent</span>
            <span className="mt-1 text-[12px] leading-snug text-text-secondary">What should I know before my next meeting?</span>
          </button>

          <button
            type="button"
            onClick={go("/settings?tab=profile")}
            className="group flex flex-col items-start rounded-2xl border border-border-light bg-white p-4 text-left transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-blue-primary/40 hover:shadow-[0_12px_28px_-14px_rgba(0,113,227,0.45)]"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-light text-blue-primary">
              <MessageCircle size={17} strokeWidth={2} />
            </span>
            <span className="mt-3 text-[13.5px] font-semibold text-text-primary">Finish your profile</span>
            <span className="mt-1 text-[12px] leading-snug text-text-secondary">Your photo and title, as your team sees them.</span>
          </button>

          <button
            type="button"
            onClick={go(home)}
            className="group flex flex-col items-start rounded-2xl border border-border-light bg-white p-4 text-left transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-blue-primary/40 hover:shadow-[0_12px_28px_-14px_rgba(0,113,227,0.45)]"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-light text-blue-primary">
              <ArrowRight size={17} strokeWidth={2} />
            </span>
            <span className="mt-3 text-[13.5px] font-semibold text-text-primary">Open {homeName}</span>
            <span className="mt-1 text-[12px] leading-snug text-text-secondary">Start where most days start.</span>
          </button>
        </div>

        <div className="mt-auto flex items-center justify-between gap-4 pt-6">
          <span className="text-[12px] text-text-tertiary">Take the tour again any time from Settings.</span>
          <button
            ref={doneRef}
            type="button"
            data-testid="onboarding-finish-done"
            onClick={() => leave()}
            className="inline-flex h-11 items-center gap-2 rounded-2xl bg-blue-primary px-5 text-[14px] font-semibold text-white shadow-[0_12px_26px_-10px_rgba(0,113,227,0.75)] outline-none transition-[background-color,transform] hover:-translate-y-0.5 hover:bg-blue-hover focus-visible:ring-4 focus-visible:ring-blue-primary/30"
          >
            Start using Freyr
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
