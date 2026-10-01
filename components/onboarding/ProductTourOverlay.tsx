"use client";

import {
  type CSSProperties,
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  MousePointerClick,
  RotateCcw,
  X,
} from "lucide-react";
import type { ProductTourStep, TourChapter } from "@/lib/productTourCatalog";
import { navIntroSelectorsFor } from "@/lib/productTourCatalog";
import { CHAPTER_ICONS } from "./OnboardingWelcome";
import { TourWhatsAppShowcase } from "./TourWhatsAppShowcase";
import { cn } from "@/lib/utils";

type Viewport = { width: number; height: number };
type TourRect = {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
};
export type TourChapterSpan = { chapter: TourChapter; start: number; count: number };

const FALLBACK_TARGETS = new Set([
  '[data-tour="page-content"]',
  "#main-content",
  "main",
]);

/** The tour sits above the agent bubble (z-120) and below the phone pop-up (z-130). */
const Z = { backdrop: 121, spotlight: 122, label: 123, card: 124 } as const;

function routeLabel(route: string): string {
  const pathname = route.split("?")[0];
  const segment = pathname.split("/").filter(Boolean).at(-1) || "dashboard";
  return segment
    .split("-")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function elementIsVisible(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    Number(style.opacity || "1") > 0 &&
    rect.width > 0 &&
    rect.height > 0 &&
    rect.right > 0 &&
    rect.bottom > 0 &&
    rect.left < window.innerWidth &&
    rect.top < window.innerHeight
  );
}

function paddedRect(rect: DOMRect, viewport: Viewport): TourRect {
  const padding = 8;
  const left = Math.max(6, rect.left - padding);
  const top = Math.max(6, rect.top - padding);
  const right = Math.min(viewport.width - 6, rect.right + padding);
  const bottom = Math.min(viewport.height - 6, rect.bottom + padding);
  return {
    left,
    top,
    right,
    bottom,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

function sameTourRect(previous: TourRect | null, next: TourRect | null): boolean {
  if (previous === next) return true;
  if (!previous || !next) return false;
  return (
    Math.abs(previous.top - next.top) < 0.5 &&
    Math.abs(previous.right - next.right) < 0.5 &&
    Math.abs(previous.bottom - next.bottom) < 0.5 &&
    Math.abs(previous.left - next.left) < 0.5 &&
    Math.abs(previous.width - next.width) < 0.5 &&
    Math.abs(previous.height - next.height) < 0.5
  );
}

function updateTourRect(
  setter: Dispatch<SetStateAction<TourRect | null>>,
  next: TourRect | null
) {
  setter((previous) => (sameTourRect(previous, next) ? previous : next));
}

function needsViewportScroll(rect: DOMRect, viewport: Viewport): boolean {
  const safeMargin = 24;
  return (
    rect.top < safeMargin ||
    rect.left < safeMargin ||
    rect.bottom > viewport.height - safeMargin ||
    rect.right > viewport.width - safeMargin
  );
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

function useViewport(): Viewport {
  const [viewport, setViewport] = useState<Viewport>({
    width: 1280,
    height: 800,
  });
  useEffect(() => {
    const update = () =>
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return viewport;
}

/**
 * THE SIDEBAR POINTER FOR PAGE CHANGES (Anir, Sep 6: "show that we're
 * clicking on this on the left side"). While the tour moves between pages,
 * this finds the entry being opened (a sidebar item, the account menu, or a
 * Settings tab) and keeps measuring it, so the highlight can sit on it while
 * the page loads.
 */
function useNavIntroRect(
  route: string,
  active: boolean,
  viewport: Viewport
): TourRect | null {
  const [rect, setRect] = useState<TourRect | null>(null);
  useEffect(() => {
    if (!active) {
      updateTourRect(setRect, null);
      return;
    }
    let cancelled = false;
    let raf = 0;
    let scrolled: HTMLElement | null = null;
    const measure = () => {
      if (cancelled) return;
      let element: HTMLElement | null = null;
      for (const selector of navIntroSelectorsFor(route)) {
        const match = document.querySelector<HTMLElement>(selector);
        if (match && elementIsVisible(match)) {
          element = match;
          break;
        }
      }
      if (!element) {
        updateTourRect(setRect, null);
        raf = window.requestAnimationFrame(measure);
        return;
      }
      if (scrolled !== element && needsViewportScroll(element.getBoundingClientRect(), viewport)) {
        scrolled = element;
        element.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
      }
      updateTourRect(
        setRect,
        paddedRect(element.getBoundingClientRect(), viewport)
      );
      // Keep tracking: the sidebar can settle or scroll while the page loads.
      raf = window.requestAnimationFrame(measure);
    };
    raf = window.requestAnimationFrame(measure);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
    };
  }, [route, active, viewport]);
  return rect;
}

function useTourTarget(
  step: ProductTourStep,
  viewport: Viewport,
  enabled: boolean
) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [matchedSelector, setMatchedSelector] = useState<string | null>(null);
  const [rect, setRect] = useState<TourRect | null>(null);

  useLayoutEffect(() => {
    if (!enabled || step.targets.length === 0) {
      setTarget(null);
      setMatchedSelector(null);
      setRect(null);
      return;
    }

    let cancelled = false;
    let timer: number | undefined;
    let attempts = 0;
    let upgrades = 0;
    let currentMatch: HTMLElement | null = null;
    let currentSelector: string | null = null;
    let scrolledMatch: HTMLElement | null = null;

    const locate = () => {
      if (cancelled) return;
      let match: HTMLElement | null = null;
      let selector: string | null = null;
      for (const candidate of step.targets) {
        const element = document.querySelector<HTMLElement>(candidate);
        if (element && elementIsVisible(element)) {
          match = element;
          selector = candidate;
          break;
        }
      }

      if (match) {
        const fallback = !!selector && FALLBACK_TARGETS.has(selector);
        const matchRect = match.getBoundingClientRect();
        if (
          !fallback &&
          scrolledMatch !== match &&
          needsViewportScroll(matchRect, viewport)
        ) {
          scrolledMatch = match;
          match.scrollIntoView({
            block: "center",
            inline: "nearest",
            behavior: "auto",
          });
        }
        if (currentMatch !== match) {
          currentMatch = match;
          setTarget(match);
        }
        if (currentSelector !== selector) {
          currentSelector = selector;
          setMatchedSelector(selector);
        }
        // A better target that is in the page but still fading in (the bell's
        // panel opening, a Settings tab entering) is invisible at the moment
        // its mutation fires, and nothing fires again when the fade ends.
        // Look again shortly instead of settling for the lesser match.
        const rank = selector ? step.targets.indexOf(selector) : -1;
        const betterPending = step.targets
          .slice(0, Math.max(0, rank))
          .some((candidate) => document.querySelector(candidate));
        if (betterPending && upgrades < 30) {
          upgrades += 1;
          if (timer) window.clearTimeout(timer);
          timer = window.setTimeout(locate, 120);
        }
        return;
      }

      // Give a slow page longer to render its real content before settling for
      // the page-shaped fallback. The MutationObserver below still upgrades to
      // the real target the moment it appears.
      if (attempts < 60) {
        attempts += 1;
        timer = window.setTimeout(locate, 100);
      } else {
        const fallback =
          document.querySelector<HTMLElement>(
            '[data-tour="page-content"], #main-content, main'
          ) || null;
        const fallbackSelector = fallback
          ? '[data-tour="page-content"]'
          : null;
        if (currentMatch !== fallback) {
          currentMatch = fallback;
          setTarget(fallback);
        }
        if (currentSelector !== fallbackSelector) {
          currentSelector = fallbackSelector;
          setMatchedSelector(fallbackSelector);
        }
      }
    };

    // Resolve existing targets before the first paint; otherwise the card
    // flashes in its fallback position and jumps to the real target.
    locate();
    const observer = new MutationObserver(locate);
    const body = document.body;
    if (body) {
      observer.observe(body, { childList: true, subtree: true });
    }
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      observer.disconnect();
      setTarget(null);
      setRect(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, step.id, step.targets]);

  useLayoutEffect(() => {
    if (!target) {
      setRect(null);
      return;
    }

    let frame = 0;
    let trackUntil = performance.now() + 1200;
    const measure = () => {
      frame = 0;
      if (!target.isConnected || !elementIsVisible(target)) {
        updateTourRect(setRect, null);
        return;
      }
      updateTourRect(setRect, paddedRect(target.getBoundingClientRect(), viewport));
      // CSS transforms do not trigger ResizeObserver. Follow every frame of
      // an entrance animation instead of lagging behind it.
      if (performance.now() < trackUntil) frame = requestAnimationFrame(measure);
    };
    const followMotion = () => {
      trackUntil = performance.now() + 1200;
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    const resizeObserver = new ResizeObserver(followMotion);
    resizeObserver.observe(target);
    if (document.body) resizeObserver.observe(document.body);
    window.addEventListener("resize", followMotion);
    window.addEventListener("scroll", followMotion, true);
    const onAnimation = (event: Event) => {
      const element = event.target;
      if (element instanceof Element &&
          (element === target || element.contains(target))) followMotion();
    };
    document.addEventListener("animationstart", onAnimation, true);
    document.addEventListener("transitionrun", onAnimation, true);
    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener("resize", followMotion);
      window.removeEventListener("scroll", followMotion, true);
      document.removeEventListener("animationstart", onAnimation, true);
      document.removeEventListener("transitionrun", onAnimation, true);
    };
  }, [target, viewport]);

  return {
    rect,
    isFallback: !!matchedSelector && FALLBACK_TARGETS.has(matchedSelector) && step.targets[0] !== matchedSelector,
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

const CARD_WIDTH = 404;

function dialogPosition({
  rect,
  dialogHeight,
  viewport,
  placement,
  fallback,
}: {
  rect: TourRect | null;
  dialogHeight: number;
  viewport: Viewport;
  placement: ProductTourStep["placement"];
  fallback: boolean;
}): CSSProperties {
  const margin = 28;
  const safe = 16;
  const width = Math.min(CARD_WIDTH, viewport.width - safe * 2);
  const height = dialogHeight || 280;
  const keepInsideViewport = (style: CSSProperties): CSSProperties => {
    const requestedTop = typeof style.top === "number" ? style.top : safe;
    const minimumDialogHeight = 220;
    const top = clamp(
      requestedTop,
      safe,
      Math.max(safe, viewport.height - minimumDialogHeight - safe)
    );
    return {
      ...style,
      top,
      maxHeight: Math.max(minimumDialogHeight, viewport.height - top - safe),
    };
  };

  if (!rect || fallback) {
    return keepInsideViewport({
      left: Math.max(safe, viewport.width - width - 28),
      top: clamp(84, safe, Math.max(safe, viewport.height - height - safe)),
      width,
    });
  }

  const available = {
    bottom: viewport.height - rect.bottom,
    top: rect.top,
    right: viewport.width - rect.right,
    left: rect.left,
  };
  const fits = {
    bottom: available.bottom >= height + margin,
    top: available.top >= height + margin,
    right: available.right >= width + margin,
    left: available.left >= width + margin,
  };
  const preferred =
    placement && placement !== "auto" && fits[placement]
      ? placement
      : (["bottom", "right", "left", "top"] as const).find(
          (side) => fits[side]
        );

  if (preferred === "bottom") {
    return keepInsideViewport({
      top: rect.bottom + margin,
      left: clamp(rect.left + rect.width / 2 - width / 2, safe, viewport.width - width - safe),
      width,
    });
  }
  if (preferred === "top") {
    return keepInsideViewport({
      top: Math.max(safe, rect.top - height - margin),
      left: clamp(rect.left + rect.width / 2 - width / 2, safe, viewport.width - width - safe),
      width,
    });
  }
  if (preferred === "right") {
    return keepInsideViewport({
      left: rect.right + margin,
      top: clamp(rect.top + rect.height / 2 - height / 2, safe, viewport.height - height - safe),
      width,
    });
  }
  if (preferred === "left") {
    return keepInsideViewport({
      left: Math.max(safe, rect.left - width - margin),
      top: clamp(rect.top + rect.height / 2 - height / 2, safe, viewport.height - height - safe),
      width,
    });
  }

  // A highlight that fills the page (a whole module) leaves no side free:
  // sit in the top-right corner over it rather than nowhere.
  return keepInsideViewport({
    left: Math.max(safe, viewport.width - width - 28),
    top: clamp(84, safe, Math.max(safe, viewport.height - height - safe)),
    width,
  });
}

/** The inner height of an element, kept current, so a wrapper can morph to it. */
function useMeasuredHeight<T extends HTMLElement>(): [React.RefObject<T | null>, number | null] {
  const ref = useRef<T>(null);
  const [height, setHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setHeight(element.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, height];
}

/**
 * THE TOUR CARD AND ITS HIGHLIGHT (Anir, Oct 1: "Nice transition, nice
 * animations between the steps").
 *
 * One highlight and one card for the whole tour, never re-mounted between
 * steps, so everything MOVES instead of blinking: the highlight glides from
 * the search bar to the bell to the sidebar, the card glides beside it and
 * its contents slide in the direction of travel. A page change presses the
 * sidebar entry first (a ripple on the item, "Opening Customers"), holds the
 * highlight there while the page loads, then glides into the new page. Next
 * is one click; there is no separate "Open Customers" card to confirm.
 *
 * NO RECTANGLE IS BETTER THAN A RECTANGLE ROUND EVERYTHING (Anir, Aug 13):
 * when the thing a step is about has not rendered, the page is dimmed and the
 * card waits in the corner; the highlight arrives by itself the moment the
 * element does.
 */
export function ProductTourOverlay({
  step,
  currentStep,
  totalSteps,
  chapters,
  routeReady,
  awaitingNavigation = false,
  saving,
  error,
  onBack,
  onNext,
  onSkip,
  onRetry,
  onJump,
}: {
  step: ProductTourStep;
  currentStep: number;
  totalSteps: number;
  chapters: readonly TourChapterSpan[];
  routeReady: boolean;
  /** The sidebar press is playing before the page changes. */
  awaitingNavigation?: boolean;
  saving: boolean;
  error: string | null;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
  onRetry: () => void;
  onJump: (index: number) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const viewport = useViewport();
  const reducedMotion = useReducedMotion();
  const compact = viewport.width < 720 || viewport.height < 560;
  const transitioning = awaitingNavigation || !routeReady;
  const showcase = step.kind === "showcase";
  const { rect, isFallback } = useTourTarget(
    step,
    viewport,
    routeReady && !awaitingNavigation && !showcase
  );
  const navRect = useNavIntroRect(step.route, transitioning, viewport);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [stepMotion, setStepMotion] = useState<{
    step: number;
    direction: "forward" | "backward";
  }>({ step: currentStep, direction: "forward" });
  const [dialogHeight, setDialogHeight] = useState(300);
  const [bodyRef, bodyHeight] = useMeasuredHeight<HTMLDivElement>();
  const lastStep = currentStep === totalSteps - 1;
  const pageName = step.pageName || routeLabel(step.route);
  const stepDirection =
    stepMotion.step === currentStep
      ? stepMotion.direction
      : currentStep < stepMotion.step
        ? "backward"
        : "forward";
  const chapterIndex = Math.max(
    0,
    chapters.findIndex((span) => currentStep >= span.start && currentStep < span.start + span.count)
  );
  const ChapterIcon = CHAPTER_ICONS[step.chapter];

  // The highlight sits on the sidebar entry while a page change plays, on
  // the step's element once the page is there, and nowhere for a showcase.
  const spotlightRect: TourRect | null = showcase
    ? null
    : transitioning
      ? navRect
      : rect && !isFallback && rect.width > 0 && rect.height > 0
        ? rect
        : null;
  const lastSpotlight = useRef<TourRect | null>(null);
  if (spotlightRect) lastSpotlight.current = spotlightRect;
  const drawnSpotlight = spotlightRect ?? lastSpotlight.current;
  // The first highlight appears in place; only later ones glide.
  const [glide, setGlide] = useState(false);
  useEffect(() => {
    if (!spotlightRect || glide) return;
    const frame = window.requestAnimationFrame(() => setGlide(true));
    return () => window.cancelAnimationFrame(frame);
  }, [glide, spotlightRect]);

  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    if (stepMotion.step === currentStep) return;
    setStepMotion({ step: currentStep, direction: stepDirection });
  }, [currentStep, stepDirection, stepMotion.step]);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const measure = () => setDialogHeight(dialog.offsetHeight || 300);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(dialog);
    return () => observer.disconnect();
  }, [currentStep, error, mounted, showcase]);

  useEffect(() => {
    if (!mounted) return;
    if (!previousFocusRef.current) {
      previousFocusRef.current = document.activeElement as HTMLElement | null;
    }
    const frame = window.requestAnimationFrame(() => dialogRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [currentStep, mounted, routeReady]);

  useEffect(
    () => () => {
      previousFocusRef.current?.focus?.();
    },
    []
  );

  const handleKey = useCallback(
    (event: KeyboardEvent) => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      // Another pop-up above the tour (the phone set-up) owns the keyboard.
      const active = document.activeElement;
      const otherDialog = active instanceof Element ? active.closest('[role="dialog"]') : null;
      if (otherDialog && otherDialog !== dialog) return;
      const target = event.target as HTMLElement | null;
      const typing =
        target?.matches("input, textarea, select, [contenteditable='true']") ||
        false;

      if (event.key === "Escape") {
        event.preventDefault();
        onSkip();
        return;
      }
      if (!typing && event.key === "ArrowRight") {
        event.preventDefault();
        onNext();
        return;
      }
      if (!typing && event.key === "ArrowLeft") {
        event.preventDefault();
        if (currentStep > 0 || awaitingNavigation) onBack();
        return;
      }
      if (event.key === "Enter" && target === dialog) {
        event.preventDefault();
        onNext();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => elementIsVisible(element));
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [awaitingNavigation, currentStep, onBack, onNext, onSkip]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  const position = useMemo<CSSProperties>(() => {
    if (showcase) {
      const width = Math.min(960, viewport.width - 48);
      const height = Math.min(700, viewport.height - 48);
      return {
        left: Math.round((viewport.width - width) / 2),
        top: Math.round((viewport.height - height) / 2),
        width,
        height,
      };
    }
    if (compact) {
      return {
        left: 12,
        right: 12,
        bottom: 12,
        width: "auto",
        maxHeight: "min(62vh, 480px)",
      };
    }
    if (transitioning) {
      // Beside the entry being pressed: right of a sidebar item, under the
      // account menu or a Settings tab.
      return dialogPosition({
        rect: navRect,
        dialogHeight,
        viewport,
        placement: navRect && navRect.left < viewport.width * 0.3 ? "right" : "bottom",
        fallback: false,
      });
    }
    return dialogPosition({
      rect,
      dialogHeight,
      viewport,
      placement: step.placement,
      fallback: isFallback,
    });
  }, [compact, dialogHeight, isFallback, navRect, rect, showcase, step.placement, transitioning, viewport]);

  if (!mounted) return null;

  const pressing = awaitingNavigation && !!navRect;
  // "Look here" points at something; a highlight round the whole page needs no pointer.
  const wholePage =
    !!spotlightRect &&
    spotlightRect.width * spotlightRect.height > viewport.width * viewport.height * 0.45;
  const labelRect = wholePage && !transitioning ? null : spotlightRect;
  const progress = (currentStep + 1) / totalSteps;

  return createPortal(
    <>
      <div
        aria-hidden="true"
        data-testid="product-tour-backdrop"
        className={cn(
          "product-tour-backdrop fixed inset-0 cursor-default",
          !reducedMotion && "transition-[background-color,backdrop-filter] duration-300 ease-out"
        )}
        style={{
          zIndex: Z.backdrop,
          backgroundColor: spotlightRect ? "rgba(8,15,28,0)" : "rgba(8,15,28,0.62)",
          backdropFilter: showcase ? "blur(5px)" : "blur(0px)",
        }}
        onMouseDown={(event) => event.preventDefault()}
      />

      {drawnSpotlight && (
        <div
          aria-hidden="true"
          data-testid={spotlightRect ? "product-tour-spotlight" : undefined}
          className={cn(
            "product-tour-spotlight pointer-events-none fixed rounded-[14px] border-2 border-blue-primary",
            glide && !reducedMotion && "product-tour-spotlight-glide",
            pressing && !reducedMotion && "product-tour-spotlight-press"
          )}
          style={{
            zIndex: Z.spotlight,
            top: drawnSpotlight.top,
            left: drawnSpotlight.left,
            width: drawnSpotlight.width,
            height: drawnSpotlight.height,
            opacity: spotlightRect ? 1 : 0,
            boxShadow:
              "0 0 0 3px rgba(255,255,255,0.96), 0 0 0 9999px rgba(8, 15, 28, 0.62), 0 14px 42px rgba(0, 113, 227, 0.3)",
          }}
        />
      )}

      {/* The press: a ripple on the entry the tour is about to open. */}
      {pressing && navRect && !reducedMotion && (
        <span
          key={`press-${step.id}`}
          aria-hidden="true"
          className="product-tour-press pointer-events-none fixed rounded-full bg-blue-primary/35"
          style={{
            zIndex: Z.label,
            top: navRect.top + navRect.height / 2 - 22,
            left: navRect.left + Math.min(36, navRect.width / 2) - 22,
            width: 44,
            height: 44,
          }}
        />
      )}

      {labelRect && !compact && (
        <div
          aria-hidden="true"
          data-testid="product-tour-focus-label"
          className={cn(
            "pointer-events-none fixed inline-flex h-7 items-center gap-1.5 rounded-full border border-white/60 bg-blue-primary px-2.5 text-[10.5px] font-semibold text-white shadow-[0_7px_22px_rgba(0,71,171,0.42)]",
            !reducedMotion && "product-tour-focus-label product-tour-label-glide"
          )}
          style={{
            zIndex: Z.label,
            top: labelRect.top >= 42 ? labelRect.top - 34 : Math.min(viewport.height - 34, labelRect.bottom + 7),
            left: clamp(labelRect.left + Math.min(18, Math.max(8, labelRect.width / 4)), 10, viewport.width - 150),
          }}
        >
          {transitioning ? <MousePointerClick size={12} strokeWidth={2.4} /> : <Eye size={12} strokeWidth={2.4} />}
          {transitioning ? `Opening ${pageName}` : "Look here"}
        </div>
      )}

      <div
        key={showcase ? "showcase" : "card"}
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-busy={transitioning}
        aria-labelledby="product-tour-title"
        aria-describedby="product-tour-description"
        tabIndex={-1}
        data-testid="product-tour-dialog"
        data-step-kind={step.kind}
        data-step-id={step.id}
        className={cn(
          "product-tour-card fixed flex flex-col overflow-hidden bg-white text-text-primary outline-none",
          showcase ? "rounded-[28px]" : compact ? "rounded-xl" : "rounded-[22px]",
          !reducedMotion && (showcase ? "product-tour-card-pop" : "product-tour-card-glide")
        )}
        style={{ ...position, zIndex: Z.card }}
      >
        {/* Header: the chapter, where you are in it, and the way out. */}
        <div className="shrink-0 px-5 pb-3 pt-4">
          <div className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-blue-light text-blue-primary">
                <ChapterIcon size={14} strokeWidth={2.2} />
              </span>
              <span key={step.chapter} className={cn("truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-primary", !reducedMotion && "product-tour-fade")}>
                {step.chapter}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <span className="text-[11px] font-semibold text-text-tertiary tnum" data-testid="product-tour-step-count">
                {currentStep + 1} of {totalSteps}
              </span>
              <button
                type="button"
                onClick={onSkip}
                aria-label="Close and skip tour"
                className="ml-1 flex h-8 w-8 items-center justify-center rounded-full text-text-tertiary transition-colors hover:bg-surface hover:text-text-primary"
              >
                <X size={17} />
              </button>
            </span>
          </div>

          {/* Progress, drawn per chapter. Each chapter jumps to its start. */}
          <div
            data-testid="product-tour-progress"
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={totalSteps}
            aria-valuenow={currentStep + 1}
            aria-valuetext={`Step ${currentStep + 1} of ${totalSteps}, ${step.chapter}`}
            className="mt-3 flex items-center gap-1"
          >
            {chapters.map((span, index) => {
              const done = currentStep >= span.start + span.count;
              const here = index === chapterIndex;
              const fill = done ? 1 : here ? (currentStep - span.start + 1) / span.count : 0;
              return (
                <button
                  key={span.chapter}
                  type="button"
                  onClick={() => onJump(span.start)}
                  title={span.chapter}
                  aria-label={`Jump to ${span.chapter}`}
                  className="group relative h-3 min-w-[10px] cursor-pointer py-1"
                  style={{ flexGrow: span.count, flexBasis: 0 }}
                >
                  <span className="block h-1 overflow-hidden rounded-full bg-blue-primary/[0.14] transition-colors group-hover:bg-blue-primary/25">
                    <span
                      className={cn("block h-full rounded-full bg-blue-primary", !reducedMotion && "transition-[width] duration-500 ease-out")}
                      style={{ width: `${fill * 100}%` }}
                    />
                  </span>
                </button>
              );
            })}
          </div>
          <span className="sr-only">{Math.round(progress * 100)}% through the tour</span>
        </div>

        {/* Body: slides in the direction of travel, and the card's height
            morphs to the new content instead of snapping. */}
        <div
          className={cn("min-h-0 flex-1 overflow-y-auto", !showcase && !reducedMotion && "transition-[height] duration-300 ease-out")}
          style={!showcase && bodyHeight !== null ? { height: bodyHeight, flex: "0 1 auto" } : undefined}
        >
          <div ref={bodyRef} className={cn("px-5 pb-5 pt-1", showcase && "h-full px-8 pb-6")}>
            <div
              key={step.id}
              className={cn(
                showcase && "flex h-full min-h-0 flex-col",
                !reducedMotion && (stepDirection === "backward" ? "product-tour-step-backward" : "product-tour-step-forward")
              )}
            >
              {step.eyebrow.toLowerCase() !== step.chapter.toLowerCase() && (
                <p className="text-[11.5px] font-semibold text-text-tertiary">{step.eyebrow}</p>
              )}
              <h2
                id="product-tour-title"
                className={cn(
                  "mt-1 font-semibold tracking-[-0.025em] text-text-primary text-balance",
                  showcase ? "text-[26px] leading-tight" : "text-[19px] leading-snug"
                )}
              >
                {step.title}
              </h2>
              {showcase ? (
                <div id="product-tour-description" className="mt-4 min-h-0 flex-1">
                  <TourWhatsAppShowcase description={step.description} reducedMotion={reducedMotion} />
                </div>
              ) : (
                <p
                  id="product-tour-description"
                  className="mt-2 text-[13.5px] leading-[1.62] text-text-secondary"
                >
                  {step.description}
                </p>
              )}

              {error && (
                <div
                  role="alert"
                  className="mt-4 flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5"
                >
                  <p className="text-[12px] leading-relaxed text-red-700">{error}</p>
                  <button
                    type="button"
                    onClick={onRetry}
                    className="inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-red-700 hover:underline"
                  >
                    <RotateCcw size={13} /> Retry
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer: the way out on the left, back and forward on the right. */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border-light px-5 py-3.5">
          <button
            type="button"
            onClick={onSkip}
            className="text-[12.5px] font-semibold text-text-secondary transition-colors hover:text-text-primary"
          >
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onBack}
              data-testid="product-tour-back"
              disabled={currentStep === 0 && !awaitingNavigation}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-white px-3.5 text-[13px] font-semibold text-text-primary transition-[background-color,border-color,transform] hover:-translate-x-0.5 hover:border-text-tertiary hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-x-0"
            >
              <ArrowLeft size={14} /> Back
            </button>
            <button
              type="button"
              onClick={onNext}
              data-testid="product-tour-next"
              aria-busy={saving}
              title="The arrow keys move through the tour too"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-blue-primary px-4 text-[13px] font-semibold text-white shadow-[0_8px_18px_-6px_rgba(0,113,227,0.55)] transition-[background-color,box-shadow,transform] hover:translate-x-0.5 hover:bg-blue-hover"
            >
              {lastStep && !transitioning ? (
                <>
                  <Check size={14} /> Finish tour
                </>
              ) : (
                <>
                  {/* While a page change plays, the step shown is the one
                      being opened; its own "Open X" would name the page
                      after it. */}
                  {transitioning ? "Next" : step.nextLabel || "Next"} <ArrowRight size={14} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
      <span className="sr-only" aria-live="polite">
        {transitioning
          ? `Opening ${pageName}.`
          : `Step ${currentStep + 1} of ${totalSteps}, ${step.chapter}: ${step.title}`}
      </span>
    </>,
    document.body
  );
}
