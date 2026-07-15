"use client";

import {
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { GLOSSARY } from "@/lib/glossary";
import { readHoverPreference } from "@/lib/hoverPreferences";

type Anchor = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

type Position = {
  left: number;
  top: number;
};

const EDGE_GAP = 8;
const TRIGGER_GAP = 7;

// A shared portal tooltip. Rendering into <body> keeps every hint above card,
// table, and scroll-container boundaries; measuring before reveal lets it flip
// and clamp against both viewport edges instead of getting sliced off.
export function Tooltip({
  label,
  children,
  side = "top",
  align = "center",
  className,
  delayMs,
}: {
  label: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom";
  align?: "center" | "left" | "right";
  className?: string;
  // Data visualizations set this to 0. Contextual previews continue to use the
  // workspace hover preference because brushing a chart is intentional.
  delayMs?: number;
}) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const popupRef = useRef<HTMLSpanElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipId = useId();

  const clearTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  const captureAnchor = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    setPosition(null);
    setAnchor({
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
    });
  };

  const show = (immediate = false) => {
    clearTimer();
    const preference = readHoverPreference();
    if (!preference.enabled) return;
    const delay = immediate ? 0 : delayMs ?? preference.delayMs;
    timerRef.current = setTimeout(captureAnchor, delay);
  };

  const hide = () => {
    clearTimer();
    setAnchor(null);
    setPosition(null);
  };

  useLayoutEffect(() => {
    if (!anchor || !popupRef.current) return;
    const popup = popupRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const spaceAbove = anchor.top - TRIGGER_GAP - EDGE_GAP;
    const spaceBelow = viewportHeight - anchor.bottom - TRIGGER_GAP - EDGE_GAP;

    let resolvedSide = side;
    if (side === "top" && popup.height > spaceAbove && spaceBelow > spaceAbove) {
      resolvedSide = "bottom";
    } else if (side === "bottom" && popup.height > spaceBelow && spaceAbove > spaceBelow) {
      resolvedSide = "top";
    }

    let desiredLeft = anchor.left;
    if (align === "center") desiredLeft = (anchor.left + anchor.right - popup.width) / 2;
    if (align === "right") desiredLeft = anchor.right - popup.width;

    const maxLeft = Math.max(EDGE_GAP, viewportWidth - popup.width - EDGE_GAP);
    const left = Math.max(EDGE_GAP, Math.min(maxLeft, desiredLeft));
    const desiredTop =
      resolvedSide === "top"
        ? anchor.top - popup.height - TRIGGER_GAP
        : anchor.bottom + TRIGGER_GAP;
    const maxTop = Math.max(EDGE_GAP, viewportHeight - popup.height - EDGE_GAP);
    const top = Math.max(EDGE_GAP, Math.min(maxTop, desiredTop));

    setPosition({ left, top });
  }, [align, anchor, label, side]);

  useEffect(() => {
    if (!anchor) return;
    const reposition = () => captureAnchor();
    const close = () => hide();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", closeOnEscape);
    };
    // captureAnchor and hide deliberately read the latest refs/state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor]);

  useEffect(() => () => clearTimer(), []);

  if (!label) return <>{children}</>;
  return (
    <span
      ref={triggerRef}
      aria-describedby={anchor ? tooltipId : undefined}
      className={cn("freyr-hover-trigger relative inline-flex items-center", className)}
      onMouseEnter={() => show(false)}
      onMouseLeave={hide}
      onFocusCapture={() => show(true)}
      onBlurCapture={hide}
    >
      {children}
      {anchor &&
        typeof document !== "undefined" &&
        createPortal(
          <span
            ref={popupRef}
            id={tooltipId}
            role="tooltip"
            className="pointer-events-none fixed z-[9999] w-max max-w-[260px] rounded-lg bg-text-primary px-2.5 py-1.5 text-left text-[12px] font-normal normal-case leading-snug tracking-normal text-white shadow-lg"
            style={{
              left: position?.left ?? 0,
              top: position?.top ?? 0,
              maxWidth: "calc(100vw - 16px)",
              visibility: position ? "visible" : "hidden",
              opacity: position ? 1 : 0,
              transition: "opacity 130ms ease-out",
            }}
          >
            {label}
          </span>,
          document.body
        )}
    </span>
  );
}

// Wrap a jargon term with a dotted underline + its glossary explanation on hover.
export function Term({
  k,
  children,
  side = "top",
  align = "center",
  className,
  underline = true,
}: {
  k: string;
  children?: ReactNode;
  side?: "top" | "bottom";
  align?: "center" | "left" | "right";
  className?: string;
  underline?: boolean;
}) {
  const entry = GLOSSARY[k];
  if (!entry) return <>{children}</>;
  return (
    <Tooltip label={entry.def} side={side} align={align}>
      <span
        tabIndex={0}
        className={cn(
          "outline-none cursor-help",
          underline &&
            "underline decoration-dotted decoration-text-tertiary/60 underline-offset-[3px] hover:decoration-blue-primary focus:decoration-blue-primary",
          className
        )}
      >
        {children ?? entry.term}
      </span>
    </Tooltip>
  );
}
