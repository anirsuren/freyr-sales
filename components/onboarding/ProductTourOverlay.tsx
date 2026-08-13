"use client";

import {
  type CSSProperties,
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
  LoaderCircle,
  MousePointerClick,
  Navigation,
  RotateCcw,
  X,
} from "lucide-react";
import type { ProductTourStep } from "@/lib/productTourCatalog";
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
type PageTransition = {
  from: string;
  to: string;
  stepId: string;
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

function useTourTarget(
  step: ProductTourStep,
  viewport: Viewport,
  enabled: boolean
) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [matchedSelector, setMatchedSelector] = useState<string | null>(null);
  const [rect, setRect] = useState<TourRect | null>(null);

  useEffect(() => {
    if (!enabled) {
      setTarget(null);
      setMatchedSelector(null);
      setRect(null);
      return;
    }

    let cancelled = false;
    let timer: number | undefined;
    let attempts = 0;

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
        if (!fallback) {
          match.scrollIntoView({
            block: "center",
            inline: "nearest",
            behavior: "auto",
          });
        }
        setTarget(match);
        setMatchedSelector(selector);
        return;
      }

      if (attempts < 24) {
        attempts += 1;
        timer = window.setTimeout(locate, 75);
      } else {
        const fallback =
          document.querySelector<HTMLElement>(
            '[data-tour="page-content"], #main-content, main'
          ) || null;
        setTarget(fallback);
        setMatchedSelector(fallback ? '[data-tour="page-content"]' : null);
      }
    };

    const frame = window.requestAnimationFrame(locate);
    const observer = new MutationObserver(locate);
    const body = document.body;
    if (body) {
      observer.observe(body, { childList: true, subtree: true });
    }
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
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
    const measure = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        if (!target.isConnected || !elementIsVisible(target)) {
          setRect(null);
          return;
        }
        setRect(paddedRect(target.getBoundingClientRect(), viewport));
      });
    };

    measure();
    /**
     * MEASURE AGAIN ONCE THE PAGE HAS SETTLED (Anir, Aug 13: "the rectangle in
     * the second screenshot isn't even aligned properly. It's not centering").
     *
     * Locating a target calls scrollIntoView and then measures on the very
     * next frame. The scroll has not finished by then, and neither have the
     * page's own entrance animations (`rise-in`, `step-in`, the tab panels),
     * so the box was drawn around where the element USED to be and then never
     * corrected — nothing moved afterwards, so no scroll or resize event ever
     * fired to fix it. These follow-up measurements catch the settled position.
     */
    const settle = [60, 180, 400, 700].map((delay) =>
      window.setTimeout(measure, delay)
    );
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(target);
    // The document itself changes height as content lands, which moves the
    // target without resizing it.
    const bodyObserver = new ResizeObserver(measure);
    if (document.body) bodyObserver.observe(document.body);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.cancelAnimationFrame(frame);
      settle.forEach((id) => window.clearTimeout(id));
      resizeObserver.disconnect();
      bodyObserver.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [target, viewport]);

  return {
    rect,
    isFallback: !!matchedSelector && FALLBACK_TARGETS.has(matchedSelector),
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
  const margin = 16;
  const safe = 16;
  const width = Math.min(dialogWidth || 408, viewport.width - safe * 2);
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
  const { rect, isFallback } = useTourTarget(step, viewport, routeReady);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const previousRouteRef = useRef(step.route);
  const [pageTransition, setPageTransition] =
    useState<PageTransition | null>(null);
  const [stepMotion, setStepMotion] = useState<{
    step: number;
    direction: "forward" | "backward";
  }>({ step: currentStep, direction: "forward" });
  const [dialogSize, setDialogSize] = useState({ width: 408, height: 288 });
  const lastStep = currentStep === totalSteps - 1;
  const stepKind = step.kind;
  const isNavigationStep = stepKind === "navigation";
  const isModeStep = stepKind === "mode";
  const pageName = routeLabel(step.route);
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

  useEffect(() => {
    const previousRoute = previousRouteRef.current;
    const previousPage = routeLabel(previousRoute);
    if (previousPage !== pageName) {
      setPageTransition({
        from: previousPage,
        to: pageName,
        stepId: step.id,
      });
    }
    previousRouteRef.current = step.route;
  }, [pageName, step.id, step.route]);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const measure = () =>
      setDialogSize({
        width: dialog.offsetWidth || 408,
        height: dialog.offsetHeight || 288,
      });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(dialog);
    return () => observer.disconnect();
  }, [currentStep, error, mounted, pageTransition]);

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
      if (!routeReady) {
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
        if (!saving) onNext();
        return;
      }
      if (!typing && event.key === "ArrowLeft") {
        event.preventDefault();
        if (!saving && currentStep > 0) onBack();
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
    [currentStep, onBack, onNext, onSkip, routeReady, saving]
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

  if (!routeReady) {
    return createPortal(
      <>
        <div
          aria-hidden="true"
          className="product-tour-backdrop fixed inset-0 z-[105] cursor-default bg-[rgba(8,15,28,0.66)]"
          onMouseDown={(event) => event.preventDefault()}
        />
        <div className="pointer-events-none fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-busy="true"
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
                disabled={saving}
                aria-label="Close and skip tour"
                className="relative flex h-8 w-8 items-center justify-center rounded-full border border-transparent text-white/[0.72] transition-colors hover:border-white/[0.15] hover:bg-white/10 hover:text-white disabled:opacity-50"
              >
                <X size={17} />
              </button>
            </div>
            <div className="px-5 py-6 text-center">
              <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-blue-primary/[0.15] bg-blue-light text-blue-primary">
                <LoaderCircle
                  size={21}
                  strokeWidth={2.2}
                  className={cn(!reducedMotion && "animate-spin")}
                />
              </span>
              <h2
                id="product-tour-transition-title"
                className="mt-4 text-[19px] font-semibold tracking-[-0.02em] text-text-primary"
              >
                Opening {pageName}…
              </h2>
              <p
                id="product-tour-transition-description"
                className="mt-1.5 text-[13px] leading-relaxed text-text-secondary"
              >
                Taking you to the next part of the walkthrough.
              </p>
              <div
                aria-hidden="true"
                className="mx-auto mt-5 h-1.5 w-28 overflow-hidden rounded-full bg-blue-light"
              >
                <div
                  className={cn(
                    "h-full w-1/2 rounded-full bg-blue-primary",
                    !reducedMotion && "animate-pulse"
                  )}
                />
              </div>
            </div>
            <div className="flex justify-center border-t border-border-light bg-surface/60 px-5 py-3">
              <button
                type="button"
                onClick={onSkip}
                disabled={saving}
                className="text-[12px] font-semibold text-text-secondary transition-colors hover:text-text-primary disabled:opacity-50"
              >
                Skip tour
              </button>
            </div>
          </div>
        </div>
        <span className="sr-only" role="status" aria-live="polite">
          Opening {pageName}. Please wait.
        </span>
      </>,
      document.body
    );
  }

  const spotlight =
    rect && rect.width > 0 && rect.height > 0 ? (
      <>
        <div
          aria-hidden="true"
          data-testid="product-tour-spotlight"
          className={cn(
            "product-tour-spotlight pointer-events-none fixed z-[106] rounded-xl border-2 border-blue-primary",
            !reducedMotion &&
              "transition-[top,left,width,height] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
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
            !reducedMotion &&
              "product-tour-focus-label transition-[top,left] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
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
          compact && "rounded-xl",
          !reducedMotion &&
            "transition-[top,left,bottom,width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
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
            disabled={saving}
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
            {/* No "Page changed" banner (Anir, Aug 13: "You don't have to say
                'page changed'. Remove that, right? You don't need that"). The
                reader watched the page change — narrating it back cost a third
                of the card and said nothing they had not just seen. */}

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
                  disabled={saving}
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
            disabled={saving}
            className="text-[12.5px] font-semibold text-text-secondary hover:text-text-primary disabled:opacity-50"
          >
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onBack}
              data-testid="product-tour-back"
              disabled={saving || currentStep === 0}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-white px-3.5 text-[13px] font-semibold text-text-primary transition-[background-color,border-color,transform] hover:-translate-x-0.5 hover:border-text-tertiary hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-x-0"
            >
              <ArrowLeft size={14} /> Back
            </button>
            <button
              type="button"
              onClick={onNext}
              data-testid="product-tour-next"
              disabled={saving}
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
