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

const FALLBACK_TARGETS = new Set([
  '[data-tour="page-content"]',
  "#main-content",
  "main",
]);

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

function useTourTarget(step: ProductTourStep, viewport: Viewport) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [matchedSelector, setMatchedSelector] = useState<string | null>(null);
  const [rect, setRect] = useState<TourRect | null>(null);

  useEffect(() => {
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
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      if (timer) window.clearTimeout(timer);
      observer.disconnect();
      setTarget(null);
      setRect(null);
    };
  }, [step.id, step.targets]);

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
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(target);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
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
  const width = Math.min(dialogWidth || 384, viewport.width - safe * 2);
  const height = dialogHeight || 270;

  if (!rect || fallback) {
    return {
      left: Math.max(safe, viewport.width - width - 24),
      top: clamp(76, safe, Math.max(safe, viewport.height - height - safe)),
      width,
    };
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
    return {
      top: rect.bottom + margin,
      left: clamp(
        rect.left + rect.width / 2 - width / 2,
        safe,
        viewport.width - width - safe
      ),
      width,
    };
  }
  if (preferred === "top") {
    return {
      top: Math.max(safe, rect.top - height - margin),
      left: clamp(
        rect.left + rect.width / 2 - width / 2,
        safe,
        viewport.width - width - safe
      ),
      width,
    };
  }
  if (preferred === "right") {
    return {
      left: rect.right + margin,
      top: clamp(
        rect.top + rect.height / 2 - height / 2,
        safe,
        viewport.height - height - safe
      ),
      width,
    };
  }
  if (preferred === "left") {
    return {
      left: Math.max(safe, rect.left - width - margin),
      top: clamp(
        rect.top + rect.height / 2 - height / 2,
        safe,
        viewport.height - height - safe
      ),
      width,
    };
  }

  return {
    left: Math.max(safe, viewport.width - width - 24),
    top: safe,
    width,
  };
}

export function ProductTourOverlay({
  step,
  currentStep,
  totalSteps,
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
  const { rect, isFallback } = useTourTarget(step, viewport);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [dialogSize, setDialogSize] = useState({ width: 384, height: 270 });
  const lastStep = currentStep === totalSteps - 1;

  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const measure = () =>
      setDialogSize({
        width: dialog.offsetWidth || 384,
        height: dialog.offsetHeight || 270,
      });
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
  }, [currentStep, mounted]);

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
    [currentStep, onBack, onNext, onSkip, saving]
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

  const spotlight =
    rect && rect.width > 0 && rect.height > 0 ? (
      <div
        aria-hidden="true"
        data-testid="product-tour-spotlight"
        className={cn(
          "pointer-events-none fixed z-[106] rounded-xl border-2 border-white/95",
          !reducedMotion && "transition-all duration-200 ease-out"
        )}
        style={{
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          boxShadow:
            "0 0 0 9999px rgba(9, 14, 24, 0.62), 0 10px 32px rgba(0, 0, 0, 0.22)",
        }}
      />
    ) : null;

  return createPortal(
    <>
      <div
        aria-hidden="true"
        className={cn(
          "fixed inset-0 z-[105] cursor-default",
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
        className={cn(
          "fixed z-[110] flex max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-2xl border border-border-light bg-white text-text-primary shadow-[0_26px_80px_-18px_rgba(0,0,0,0.48)] outline-none",
          compact && "rounded-xl",
          !reducedMotion && "transition-[top,left,bottom] duration-200 ease-out"
        )}
        style={position}
      >
        <div className="flex items-center justify-between gap-4 border-b border-border-light px-5 py-3.5">
          <div
            data-testid="product-tour-progress"
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={totalSteps}
            aria-valuenow={currentStep + 1}
            className="flex min-w-0 flex-1 items-center gap-3"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-light text-blue-primary">
              <Compass size={15} strokeWidth={2} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                  Product tour
                </span>
                <span className="shrink-0 text-[11px] font-semibold text-text-secondary tnum">
                  Step {currentStep + 1} of {totalSteps}
                </span>
              </div>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface">
                <div
                  className={cn(
                    "h-full rounded-full bg-blue-primary",
                    !reducedMotion && "transition-[width] duration-200"
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
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-tertiary transition-colors hover:bg-surface hover:text-text-primary disabled:opacity-50"
          >
            <X size={17} />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-5">
          <h2
            id="product-tour-title"
            className="text-[19px] font-semibold tracking-[-0.02em] text-text-primary"
          >
            {step.title}
          </h2>
          <p
            id="product-tour-description"
            className="mt-2 text-[13.5px] leading-relaxed text-text-secondary"
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
            <p className="mt-4 text-[10.5px] text-text-tertiary">
              Use ← and → to move · Esc to skip
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border-light bg-surface/60 px-5 py-3.5">
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
              disabled={saving || currentStep === 0}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-white px-3.5 text-[13px] font-semibold text-text-primary transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ArrowLeft size={14} /> Back
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={saving}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-blue-primary px-4 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-blue-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {lastStep ? (
                <>
                  <Check size={14} /> Finish tour
                </>
              ) : (
                <>
                  Next <ArrowRight size={14} />
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
