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
  Compass,
  Eye,
  MousePointerClick,
  Navigation,
  RotateCcw,
  X,
} from "lucide-react";
import type { ProductTourStep } from "@/lib/productTourCatalog";
import { navIntroSelectorsFor } from "@/lib/productTourCatalog";
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
const FALLBACK_TARGETS = new Set([
  '[data-tour="page-content"]',
  "#main-content",
  "main",
]);

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
 * THE SIDEBAR POINTER FOR ROUTE TRANSITIONS (Anir, Sep 6: "show that we're
 * clicking on this on the left side"). While the tour moves between pages,
 * this finds the nav entry being opened and measures it so the transition
 * card can spotlight it. Null on phones (the sidebar hides behind the
 * hamburger) — the card then simply says where it is going.
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
      // Keep tracking: the sidebar can settle/scroll during the page load.
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
    if (!enabled) {
      setTarget(null);
      setMatchedSelector(null);
      setRect(null);
      return;
    }

    let cancelled = false;
    let timer: number | undefined;
    let attempts = 0;
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
        return;
      }

      // Give a slow page longer to render its real content before settling for
      // the page-shaped fallback. Customers and Market Intel are heavy, dynamic
      // pages: at 1.8s the tour was measuring their loading skeleton, so the
      // search box it wanted to point at did not exist yet. The MutationObserver
      // below still upgrades to the real target the moment it appears.
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
    // flashes in its fallback position and jumps to the search bar.
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
      // the entrance animation instead of lagging behind it with another tween.
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

function dialogPosition({
  rect,
  dialogWidth,
  dialogHeight,
  viewport,
  placement,
  fallback,
}: {
  rect: TourRect | null;
  dialogWidth: number;
  dialogHeight: number;
  viewport: Viewport;
  placement: ProductTourStep["placement"];
  fallback: boolean;
}): CSSProperties {
  const margin = 48;
  const safe = 16;
  const width = Math.min(408, viewport.width - safe * 2);
  const height = dialogHeight || 270;
  const keepInsideViewport = (style: CSSProperties): CSSProperties => {
    const requestedTop =
      typeof style.top === "number" ? style.top : safe;
    const minimumDialogHeight = 208;
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
      left: Math.max(safe, viewport.width - width - 24),
      top: clamp(76, safe, Math.max(safe, viewport.height - height - safe)),
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
      left: clamp(
        rect.left + rect.width / 2 - width / 2,
        safe,
        viewport.width - width - safe
      ),
      width,
    });
  }
  if (preferred === "top") {
    return keepInsideViewport({
      top: Math.max(safe, rect.top - height - margin),
      left: clamp(
        rect.left + rect.width / 2 - width / 2,
        safe,
        viewport.width - width - safe
      ),
      width,
    });
  }
  if (preferred === "right") {
    return keepInsideViewport({
      left: rect.right + margin,
      top: clamp(
        rect.top + rect.height / 2 - height / 2,
        safe,
        viewport.height - height - safe
      ),
      width,
    });
  }
  if (preferred === "left") {
    return keepInsideViewport({
      left: Math.max(safe, rect.left - width - margin),
      top: clamp(
        rect.top + rect.height / 2 - height / 2,
        safe,
        viewport.height - height - safe
      ),
      width,
    });
  }

  return keepInsideViewport({
    left: Math.max(safe, viewport.width - width - 24),
    top: safe,
    width,
  });
}

export function ProductTourOverlay({
  step,
  currentStep,
  totalSteps,
  routeReady,
  awaitingNavigation = false,
  saving,
  error,
  onBack,
  onNext,
  onSkip,
  onRetry,
}: {
  step: ProductTourStep;
  currentStep: number;
  totalSteps: number;
  routeReady: boolean;
  awaitingNavigation?: boolean;
  saving: boolean;
  error: string | null;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
  onRetry: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const viewport = useViewport();
  const reducedMotion = useReducedMotion();
  const compact = viewport.width < 720 || viewport.height < 560;
  // A destination preview stays open until Next confirms the navigation.
  const transitioning = awaitingNavigation || !routeReady;
  const { rect, isFallback } = useTourTarget(
    step,
    viewport,
    routeReady && !awaitingNavigation
  );
  const navRect = useNavIntroRect(step.route, transitioning, viewport);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [stepMotion, setStepMotion] = useState<{
    step: number;
    direction: "forward" | "backward";
  }>({ step: currentStep, direction: "forward" });
  const [dialogSize, setDialogSize] = useState({ width: 408, height: 288 });
  const lastStep = currentStep === totalSteps - 1;
  const stepKind = step.kind;
  const isNavigationStep = stepKind === "navigation";
  const isModeStep = stepKind === "mode";
  const pageName = step.pageName || routeLabel(step.route);
  const stepDirection =
    stepMotion.step === currentStep
      ? stepMotion.direction
      : currentStep < stepMotion.step
        ? "backward"
        : "forward";
  const eyebrow = step.eyebrow;

  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    if (stepMotion.step === currentStep) return;
    setStepMotion({ step: currentStep, direction: stepDirection });
  }, [currentStep, stepDirection, stepMotion.step]);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const measure = () => {
      const next = {
        width: dialog.offsetWidth || 408,
        height: Array.from(dialog.children).reduce(
          (height, child) => height + (child as HTMLElement).scrollHeight, 4
        ) || 288,
      };
      setDialogSize((previous) =>
        previous.width === next.width && previous.height === next.height
          ? previous
          : next
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(dialog);
    return () => observer.disconnect();
  }, [currentStep, error, mounted]);

  useEffect(() => {
    if (!mounted) return;
    if (!previousFocusRef.current) {
      previousFocusRef.current = document.activeElement as HTMLElement | null;
    }
    const frame = window.requestAnimationFrame(() => dialogRef.current?.focus());
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
      const target = event.target as HTMLElement | null;
      const typing =
        target?.matches("input, textarea, select, [contenteditable='true']") ||
        false;

      if (event.key === "Escape") {
        event.preventDefault();
        onSkip();
        return;
      }
      if (awaitingNavigation && !typing && event.key === "ArrowRight") {
        event.preventDefault();
        onNext();
        return;
      }
      if (awaitingNavigation && !typing && event.key === "ArrowLeft") {
        event.preventDefault();
        onBack();
        return;
      }
      if (!routeReady || awaitingNavigation) {
        if (event.key === "Tab") {
          const focusable = Array.from(
            dialog.querySelectorAll<HTMLElement>(
              'button:not([disabled]), [tabindex]:not([tabindex="-1"])'
            )
          ).filter((element) => elementIsVisible(element));
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (focusable.length === 0) {
            event.preventDefault();
            dialog.focus();
          } else if (
            event.shiftKey &&
            (document.activeElement === first ||
              document.activeElement === dialog)
          ) {
            event.preventDefault();
            last.focus();
          } else if (
            !event.shiftKey &&
            (document.activeElement === last ||
              document.activeElement === dialog)
          ) {
            event.preventDefault();
            first.focus();
          }
        }
        return;
      }
      if (!typing && event.key === "ArrowRight") {
        event.preventDefault();
        onNext();
        return;
      }
      if (!typing && event.key === "ArrowLeft") {
        event.preventDefault();
        if (currentStep > 0) onBack();
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
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [currentStep, onBack, onNext, onSkip, routeReady, saving, awaitingNavigation]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  const position = useMemo<CSSProperties>(() => {
    if (compact) {
      return {
        left: 12,
        right: 12,
        bottom: 12,
        width: "auto",
        maxHeight: "min(62vh, 480px)",
      };
    }
    return dialogPosition({
      rect,
      dialogWidth: dialogSize.width,
      dialogHeight: dialogSize.height,
      viewport,
      placement: step.placement,
      fallback: isFallback,
    });
  }, [
    compact,
    dialogSize.height,
    dialogSize.width,
    isFallback,
    rect,
    step.placement,
    viewport,
  ]);

  if (!mounted) return null;

  // Retain the same destination card until navigation commits; never unmount
  // the entire tour for the gap between routes. No extra loading screen.
  if (transitioning) {
    return createPortal(
      <>
        <div
          aria-hidden="true"
          className="product-tour-backdrop fixed inset-0 z-[105] cursor-default"
          style={{ background: navRect ? "transparent" : "rgba(8,15,28,0.66)" }}
          onMouseDown={(event) => event.preventDefault()}
        />
        {/* THE POINTER AT THE SIDEBAR (Anir: "show that we're clicking on
            this on the left side"): ring the nav entry being opened, with a
            label, while the transition card explains. Absent on phones,
            where the sidebar is behind the hamburger. */}
        {navRect && (
          <>
            <div
              aria-hidden="true"
              className="pointer-events-none fixed z-[106] rounded-xl border-2 border-blue-primary"
              style={{
                boxShadow: "0 0 0 3px white, 0 0 0 9999px rgba(8,15,28,0.66)",
                top: navRect.top,
                left: navRect.left,
                width: navRect.width,
                height: navRect.height,
              }}
            />
            <div
              aria-hidden="true"
              className="pointer-events-none fixed z-[108] inline-flex h-7 items-center gap-1.5 rounded-full border border-white/60 bg-blue-primary px-2.5 text-[10.5px] font-semibold text-white shadow-[0_7px_22px_rgba(0,71,171,0.42)]"
              style={{
                top: Math.max(8, navRect.top - 34),
                left: Math.min(
                  Math.max(10, navRect.left + 8),
                  viewport.width - 130
                ),
              }}
            >
              <Eye size={12} strokeWidth={2.4} />
              Opening this
            </div>
          </>
        )}
        <div className="pointer-events-none fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-busy={false}
            aria-labelledby="product-tour-transition-title"
            aria-describedby="product-tour-transition-description"
            tabIndex={-1}
            data-testid="product-tour-route-transition"
            className="product-tour-card pointer-events-auto w-full max-w-[360px] overflow-hidden rounded-[20px] border border-white/20 bg-white text-text-primary shadow-[0_32px_90px_-18px_rgba(0,0,0,0.58),0_0_0_1px_rgba(0,113,227,0.24)] outline-none"
          >
            <div className="relative flex items-center justify-between overflow-hidden bg-[linear-gradient(135deg,#111c30_0%,#17345c_56%,#075cad_100%)] px-5 py-4 text-white">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-10 -top-14 h-28 w-28 rounded-full border border-white/[0.15] bg-white/10"
              />
              <div className="relative flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-white/20 bg-white/[0.14]">
                  <Navigation size={15} strokeWidth={2.2} />
                </span>
                <div>
                  <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white/[0.72]">
                    Guided walkthrough
                  </p>
                  <p className="mt-0.5 text-[11px] font-medium text-white/80 tnum">
                    Step {currentStep + 1} of {totalSteps}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onSkip}
                disabled={false}
                aria-label="Close and skip tour"
                className="relative flex h-8 w-8 items-center justify-center rounded-full border border-transparent text-white/[0.72] transition-colors hover:border-white/[0.15] hover:bg-white/10 hover:text-white disabled:opacity-50"
              >
                <X size={17} />
              </button>
            </div>
            <div className="px-5 py-6 text-center">
              <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-blue-primary/[0.15] bg-blue-light text-blue-primary">
                <Navigation size={21} strokeWidth={2.2} />
              </span>
              <h2
                id="product-tour-transition-title"
                className="mt-4 text-[19px] font-semibold tracking-[-0.02em] text-text-primary"
              >
                Open {pageName}
              </h2>
              <p
                id="product-tour-transition-description"
                className="mt-1.5 text-[13px] leading-relaxed text-text-secondary"
              >
                {`Press Next to open ${pageName}${navRect ? " from the highlighted menu item" : ""}.`}
              </p>

            </div>
            <div className="flex justify-center border-t border-border-light bg-surface/60 px-5 py-3">
              <button
                type="button"
                onClick={onSkip}
                disabled={false}
                className="text-[12px] font-semibold text-text-secondary transition-colors hover:text-text-primary disabled:opacity-50"
              >
                Skip tour
              </button>
              <button type="button" onClick={onBack} disabled={!awaitingNavigation && currentStep === 0} className="ml-auto px-3 py-2 text-sm disabled:opacity-40">Back</button>
              <button type="button" onClick={onNext} className="rounded-lg bg-blue-primary px-4 py-2 text-sm font-semibold text-white">Next</button>
            </div>
          </div>
        </div>
        <span className="sr-only" role="status" aria-live="polite">
          Press Next to open {pageName}.
        </span>
      </>,
      document.body
    );
  }

  /**
   * NO RECTANGLE IS BETTER THAN A RECTANGLE ROUND EVERYTHING (Anir, Aug 13:
   * "the rectangles aren't really aligned properly").
   *
   * When the specific thing a step is about has not rendered yet, the target
   * falls back to the page container — and drawing the highlight around that
   * outlines the whole screen, which points at nothing and reads as broken.
   * A fallback now simply dims the page and shows the card; the highlight
   * reappears by itself the moment the real element lands.
   */
  const spotlight =
    rect && !isFallback && rect.width > 0 && rect.height > 0 ? (
      <>
        <div
          aria-hidden="true"
          data-testid="product-tour-spotlight"
          className={cn(
            "product-tour-spotlight pointer-events-none fixed z-[106] rounded-xl border-2 border-blue-primary",
            "will-change-[top,left,width,height]"
          )}
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            boxShadow:
              "0 0 0 3px rgba(255,255,255,0.96), 0 0 0 9999px rgba(8, 15, 28, 0.66), 0 14px 42px rgba(0, 113, 227, 0.28)",
          }}
        />
        <div
          aria-hidden="true"
          data-testid="product-tour-focus-label"
          className={cn(
            "pointer-events-none fixed z-[108] inline-flex h-7 items-center gap-1.5 rounded-full border border-white/60 bg-blue-primary px-2.5 text-[10.5px] font-semibold text-white shadow-[0_7px_22px_rgba(0,71,171,0.42)]",
            !reducedMotion && "product-tour-focus-label"
          )}
          style={{
            top:
              rect.top >= 42
                ? rect.top - 34
                : Math.min(viewport.height - 34, rect.bottom + 7),
            left: clamp(
              rect.left + Math.min(18, Math.max(8, rect.width / 4)),
              10,
              viewport.width - 92
            ),
          }}
        >
          <Eye size={12} strokeWidth={2.4} />
          Look here
        </div>
      </>
    ) : null;

  return createPortal(
    <>
      <div
        aria-hidden="true"
        className={cn(
          "product-tour-backdrop fixed inset-0 z-[105] cursor-default",
          !spotlight && "bg-black/60"
        )}
        onMouseDown={(event) => event.preventDefault()}
      />
      {spotlight}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-tour-title"
        aria-describedby="product-tour-description"
        tabIndex={-1}
        data-testid="product-tour-dialog"
        data-step-kind={stepKind}
        className={cn(
          "product-tour-card fixed z-[110] flex max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-[20px] border border-white/20 bg-white text-text-primary shadow-[0_32px_90px_-18px_rgba(0,0,0,0.58),0_0_0_1px_rgba(0,113,227,0.24)] outline-none",
          compact && "rounded-xl"
        )}
        style={position}
      >
        <div
          className={cn(
            "relative flex shrink-0 items-center justify-between gap-4 overflow-hidden px-5 py-4 text-white",
            isNavigationStep
              ? "bg-[linear-gradient(135deg,#075dc7_0%,#0071e3_58%,#35a2ff_100%)]"
              : isModeStep
                ? "bg-[linear-gradient(135deg,#17345c_0%,#0a5ca8_52%,#087fba_100%)]"
                : "bg-[linear-gradient(135deg,#111c30_0%,#17345c_56%,#075cad_100%)]"
          )}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-10 -top-14 h-28 w-28 rounded-full border border-white/[0.15] bg-white/10"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-12 right-16 h-20 w-20 rounded-full bg-blue-300/10 blur-xl"
          />
          <div
            data-testid="product-tour-progress"
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={totalSteps}
            aria-valuenow={currentStep + 1}
            className="relative flex min-w-0 flex-1 items-center gap-3"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-white/20 bg-white/[0.14] text-white shadow-inner">
              {isNavigationStep ? (
                <Navigation size={15} strokeWidth={2.2} />
              ) : isModeStep ? (
                <MousePointerClick size={15} strokeWidth={2.2} />
              ) : (
                <Compass size={15} strokeWidth={2.2} />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white/[0.72]">
                  Guided walkthrough
                </span>
                <span className="shrink-0 text-[11px] font-semibold text-white/80 tnum">
                  Step {currentStep + 1} of {totalSteps}
                </span>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/20">
                <div
                  className={cn(
                    "h-full rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.55)]",
                    !reducedMotion &&
                      "transition-[width] duration-300 ease-out"
                  )}
                  style={{
                    width: `${((currentStep + 1) / totalSteps) * 100}%`,
                  }}
                />
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onSkip}
            disabled={false}
            aria-label="Close and skip tour"
            className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-transparent text-white/[0.72] transition-colors hover:border-white/[0.15] hover:bg-white/10 hover:text-white disabled:opacity-50"
          >
            <X size={17} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] px-5 py-5">
          <div
            key={step.id}
            className={cn(
              !reducedMotion &&
                (stepDirection === "backward"
                  ? "product-tour-step-backward"
                  : "product-tour-step-forward")
            )}
          >
            <div className="mb-2.5 flex items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em]",
                  isNavigationStep
                    ? "border-blue-primary/20 bg-blue-light text-blue-primary"
                    : isModeStep
                      ? "border-cyan-200 bg-cyan-50 text-cyan-700"
                      : "border-border-light bg-surface text-text-secondary"
                )}
              >
                {isNavigationStep && (
                  <Navigation size={11} strokeWidth={2.4} />
                )}
                {eyebrow}
              </span>
            </div>

            <h2
              id="product-tour-title"
              className="text-[20px] font-semibold tracking-[-0.025em] text-text-primary"
            >
              {step.title}
            </h2>
            <p
              id="product-tour-description"
              className="mt-2 text-[13.5px] leading-[1.62] text-text-secondary"
            >
              {step.description}
            </p>

            {error && (
              <div
                role="alert"
                className="mt-4 flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5"
              >
                <p className="text-[12px] leading-relaxed text-red-700">
                  {error}
                </p>
                <button
                  type="button"
                  onClick={onRetry}
                  disabled={false}
                  className="inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-red-700 hover:underline disabled:opacity-50"
                >
                  <RotateCcw size={13} /> Retry
                </button>
              </div>
            )}

            {!compact && (
              <div className="mt-4 flex items-center gap-1.5 text-[10.5px] text-text-tertiary">
                <MousePointerClick size={12} />
                Follow the blue highlight · Use ← and → to move
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border-light bg-white px-5 py-3.5">
          <button
            type="button"
            onClick={onSkip}
            disabled={false}
            className="text-[12.5px] font-semibold text-text-secondary hover:text-text-primary disabled:opacity-50"
          >
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onBack}
              data-testid="product-tour-back"
              disabled={currentStep === 0}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-white px-3.5 text-[13px] font-semibold text-text-primary transition-[background-color,border-color,transform] hover:-translate-x-0.5 hover:border-text-tertiary hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-x-0"
            >
              <ArrowLeft size={14} /> Back
            </button>
            <button
              type="button"
              onClick={onNext}
              data-testid="product-tour-next"
              disabled={false}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-primary px-4 text-[13px] font-semibold text-white shadow-[0_6px_16px_rgba(0,113,227,0.24)] transition-[background-color,box-shadow,transform] hover:translate-x-0.5 hover:bg-blue-hover hover:shadow-[0_8px_20px_rgba(0,113,227,0.3)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-x-0"
            >
              {lastStep ? (
                <>
                  <Check size={14} /> Finish tour
                </>
              ) : (
                <>
                  {step.nextLabel || "Next"} <ArrowRight size={14} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
      <span className="sr-only" aria-live="polite">
        Step {currentStep + 1} of {totalSteps}: {step.title}
      </span>
    </>,
    document.body
  );
}
