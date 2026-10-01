"use client";

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  BookOpen,
  Briefcase,
  Compass,
  Gauge,
  Settings2,
  Smartphone,
  Sparkles,
  UsersRound,
  X,
} from "lucide-react";
import { RoleTag } from "@/components/ui/RoleTag";
import { cn } from "@/lib/utils";
import {
  tourChaptersOf,
  type ProductTourStep,
  type TourChapter,
} from "@/lib/productTourCatalog";

export const CHAPTER_ICONS: Record<TourChapter, ComponentType<{ size?: number; strokeWidth?: number; className?: string }>> = {
  "Getting around": Compass,
  "Your agent": Sparkles,
  Knowledge: BookOpen,
  Selling: Briefcase,
  Performance: Gauge,
  "Your team": UsersRound,
  Settings: Settings2,
};

/** The short name of a stop, for the itinerary chips. */
function stopLabel(step: ProductTourStep): string {
  switch (step.id) {
    case "top-search":
      return "Search";
    case "account-menu":
      return "Your account";
    case "notifications-bell":
      return "Notifications";
    case "sidebar-modules":
      return "The menu";
    case "agent-workspace":
      return "Agent";
    case "agent-dock":
      return "On every page";
    case "whatsapp-agent":
      return "WhatsApp";
    default:
      return step.eyebrow.startsWith("Settings · ")
        ? step.eyebrow.slice("Settings · ".length)
        : step.pageName;
  }
}

/**
 * THE FRONT DOOR OF THE TOUR (Anir, Oct 1: "You can't just go straight into
 * it. You have to say 'Begin onboarding' or whatever. It should be a pop-up").
 *
 * A first sign-in used to drop people straight into a spotlight. Now they
 * meet this card: who they are signed in as, what the tour will show THEM
 * (the itinerary is the same role- and access-filtered list the tour walks),
 * how long it takes, and two choices. "Not now", the X, Escape and a click
 * outside all mean the same thing. One fixed size, whatever it holds.
 */
export function OnboardingWelcome({
  steps,
  role,
  firstName,
  returning,
  whatsApp = false,
  onBegin,
  onDismiss,
}: {
  steps: readonly ProductTourStep[];
  role: string | null | undefined;
  firstName: string;
  /** The workspace has a WhatsApp number, so the phone comes after the tour. */
  whatsApp?: boolean;
  /**
   * They finished the tour before and chose to take it again from Settings.
   * Only then does it say "refresher" (Anir, Oct 1: "that makes sense... if
   * its only there for users who are explicitly going to settings and doing
   * it again"). A first sign-in, or someone who skipped it, is welcomed.
   */
  returning: boolean;
  onBegin: () => void;
  onDismiss: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [leaving, setLeaving] = useState<"begin" | "dismiss" | null>(null);
  const beginRef = useRef<HTMLButtonElement>(null);
  const chapters = useMemo(() => tourChaptersOf(steps), [steps]);
  const minutes = Math.max(2, Math.round((steps.length * 9) / 60));

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!mounted) return;
    const frame = window.requestAnimationFrame(() => beginRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [mounted]);

  // Leave with a short exit animation, then hand over.
  useEffect(() => {
    if (!leaving) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => (leaving === "begin" ? onBegin() : onDismiss()), reduce ? 0 : 260);
    return () => window.clearTimeout(timer);
  }, [leaving, onBegin, onDismiss]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setLeaving((current) => current ?? "dismiss");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div
      className={cn("tour-welcome-root fixed inset-0 z-[124] flex items-center justify-center p-6", leaving && "is-leaving")}
      data-testid="onboarding-welcome"
    >
      <div
        aria-hidden="true"
        className="tour-welcome-backdrop absolute inset-0 bg-[rgba(8,15,28,0.58)] backdrop-blur-[6px]"
        onMouseDown={() => setLeaving((current) => current ?? "dismiss")}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-welcome-title"
        aria-describedby="onboarding-welcome-description"
        className="tour-welcome-card relative grid h-[min(600px,calc(100vh-3rem))] w-full max-w-[960px] grid-cols-[minmax(0,1fr)_minmax(0,1.02fr)] overflow-hidden rounded-[28px] bg-white shadow-[0_40px_120px_-30px_rgba(8,15,28,0.65),0_0_0_1px_rgba(0,113,227,0.18)]"
      >
        <button
          type="button"
          onClick={() => setLeaving((current) => current ?? "dismiss")}
          aria-label="Close"
          className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full text-text-tertiary transition-colors hover:bg-surface hover:text-text-primary"
        >
          <X size={18} />
        </button>

        {/* Left: who, what, how long, and the two choices. */}
        <section className="relative flex min-h-0 flex-col px-10 pb-9 pt-10">
          <div className="tour-welcome-mark relative flex h-14 w-14 items-center justify-center">
            <span aria-hidden="true" className="tour-welcome-halo absolute inset-0 rounded-[18px] bg-blue-primary/25" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/freyr-mark.png"
              alt="Freyr"
              width={56}
              height={56}
              className="relative h-14 w-14 rounded-[18px] shadow-[0_14px_30px_-10px_rgba(0,113,227,0.7)]"
            />
          </div>

          <p className="tour-welcome-rise mt-7 text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-primary" style={{ animationDelay: "80ms" }}>
            {returning ? "The guided tour" : "Welcome to Freyr"}
          </p>
          <h2
            id="onboarding-welcome-title"
            className="tour-welcome-rise mt-2 text-balance text-[30px] font-semibold leading-[1.12] tracking-[-0.03em] text-text-primary"
            style={{ animationDelay: "130ms" }}
          >
            {returning
              ? `Ready for a refresher${firstName ? `, ${firstName}` : ""}?`
              : `Hi${firstName ? ` ${firstName}` : ""}, let's get you set up.`}
          </h2>
          <p
            id="onboarding-welcome-description"
            className="tour-welcome-rise mt-3 max-w-[400px] text-[14px] leading-[1.6] text-text-secondary"
            style={{ animationDelay: "180ms" }}
          >
            A walk through everything your account can open, and your own AI agent. About {minutes} minutes, and you can stop at any point.
          </p>

          <div className="tour-welcome-rise mt-5 flex flex-wrap items-center gap-2 text-[12px] text-text-secondary" style={{ animationDelay: "230ms" }}>
            <span>Signed in as</span>
            <RoleTag role={role} size="sm" />
            <span aria-hidden="true" className="h-1 w-1 rounded-full bg-border" />
            <span className="tabular-nums">{steps.length} stops</span>
          </div>

          {/* THE AGENT ON THE PHONE, SAID UP FRONT (Anir, Oct 1: "the user
              doesn't even know that it exists"). Even a "Not now" sees it.
              Setting it up comes AFTER the tour, finished or skipped (Anir,
              Oct 1), so this only says what is coming. */}
          {whatsApp && (
            <div
              className="tour-welcome-rise mt-6 flex max-w-[420px] items-start gap-3 rounded-2xl border border-blue-primary/15 bg-blue-light/50 px-4 py-3.5"
              style={{ animationDelay: "260ms" }}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-primary text-white shadow-[0_8px_18px_-8px_rgba(0,113,227,0.8)]">
                <Smartphone size={17} strokeWidth={2.1} aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-text-primary">Your agent is on WhatsApp too</span>
                <span className="mt-0.5 block text-[12.5px] leading-snug text-text-secondary">
                  Text it from your phone: questions, voice notes, files and reminders. Right after the tour, one scan connects your phone.
                </span>
              </span>
            </div>
          )}

          <div className="mt-auto">
            <div className="tour-welcome-rise flex items-center gap-3" style={{ animationDelay: "300ms" }}>
              <button
                ref={beginRef}
                type="button"
                data-testid="onboarding-welcome-begin"
                onClick={() => setLeaving((current) => current ?? "begin")}
                className="group inline-flex h-12 items-center gap-2 rounded-2xl bg-blue-primary px-6 text-[15px] font-semibold text-white shadow-[0_14px_30px_-10px_rgba(0,113,227,0.75)] outline-none transition-[background-color,transform,box-shadow] hover:-translate-y-0.5 hover:bg-blue-hover hover:shadow-[0_18px_36px_-12px_rgba(0,113,227,0.8)] focus-visible:ring-4 focus-visible:ring-blue-primary/30"
              >
                {returning ? "Start the tour" : "Begin onboarding"}
                <ArrowRight size={17} strokeWidth={2.2} className="transition-transform group-hover:translate-x-0.5" />
              </button>
              <button
                type="button"
                data-testid="onboarding-welcome-later"
                onClick={() => setLeaving((current) => current ?? "dismiss")}
                className="h-12 rounded-2xl px-4 text-[14px] font-semibold text-text-secondary transition-colors hover:bg-surface hover:text-text-primary"
              >
                Not now
              </button>
            </div>
            <p className="tour-welcome-rise mt-3 text-[12px] text-text-tertiary" style={{ animationDelay: "320ms" }}>
              You can take it any time from Settings.
            </p>
          </div>
        </section>

        {/* Right: the itinerary, exactly the stops this person will get. */}
        <section className="relative min-h-0 overflow-hidden bg-blue-light/60">
          <div aria-hidden="true" className="tour-welcome-orb pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-blue-primary/[0.14] blur-2xl" />
          <div aria-hidden="true" className="tour-welcome-orb pointer-events-none absolute -bottom-28 -left-16 h-64 w-64 rounded-full bg-blue-primary/[0.1] blur-2xl" style={{ animationDelay: "-4s" }} />
          <div className="relative flex h-full min-h-0 flex-col px-8 pb-7 pt-9">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">What you will see</p>
            <ol className="mt-3.5 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
              {chapters.map((chapter, index) => {
                const Icon = CHAPTER_ICONS[chapter.chapter];
                const labels = [...new Set(steps.slice(chapter.start, chapter.start + chapter.count).map(stopLabel))];
                return (
                  <li
                    key={chapter.chapter}
                    className="tour-welcome-chapter flex items-center gap-3 rounded-2xl bg-white/80 px-3.5 py-2.5 shadow-[0_1px_0_rgba(8,15,28,0.04),0_0_0_1px_rgba(0,113,227,0.08)]"
                    style={{ animationDelay: `${220 + index * 70}ms` }}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-blue-primary/10 text-blue-primary">
                      <Icon size={15} strokeWidth={2.1} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-semibold text-text-primary">{chapter.chapter}</span>
                        <span className="text-[11px] tabular-nums text-text-tertiary">{chapter.count}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-[12px] text-text-secondary">{labels.join(", ")}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>
      </div>
    </div>,
    document.body
  );
}
