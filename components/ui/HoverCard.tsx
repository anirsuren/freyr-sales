"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import {
  DEFAULT_HOVER_DELAY_MS,
  readHoverPreference,
  useHoverPreference,
} from "@/lib/hoverPreferences";

// A hover popover that STAYS OPEN while the cursor is over the popover itself
// (Suren: "when I hover onto the pop-up it shouldn't disappear"), and that can
// NEVER be clipped: the popover renders in a body portal at a fixed position,
// so `overflow-hidden` ancestors (table cards, grids) can't cut it off — the
// exact bug the team-roster popup hit ("Engaged" clipped to "d"). Same cure as
// the chart tooltips (#146). A small close delay + the popover's own hover
// handlers keep it open while the cursor crosses the gap.
export function HoverCard({
  children,
  content,
  side = "bottom",
  width = 300,
  className,
  delayMs: delayOverride,
  anchor = "trigger",
  clearAncestor,
  tightAbove,
}: {
  children: React.ReactNode;
  content: React.ReactNode;
  side?: "bottom" | "top" | "left" | "right";
  width?: number;
  className?: string;
  // Charts pass 0 because inspecting data is always intentional. Contextual
  // previews omit this and continue to respect the user's hover preference.
  delayMs?: number;
  // Wide rows should open beside the pointer. Centering on a full-width row
  // can put the card hundreds of pixels away from what the user hovered.
  anchor?: "trigger" | "cursor";
  /** CSS selector for an ancestor the popover must fully clear on top/bottom
   *  placement. Charts pass their plot container so the card never lands on
   *  the numbers (Anir: "it shouldn't cover the number ever"). */
  clearAncestor?: string;
  /** Opt-in (bar charts): on TOP placement, hug the trigger's own top edge and
   *  lift the card this many extra pixels, instead of clearing the whole
   *  `clearAncestor` box. A per-bar trigger then gets a per-bar height — a tall
   *  bar's card sits high, a short bar's card drops down to meet it (Suren:
   *  "it should be right above the number, not above a set amount"). The
   *  lift is sized to clear that bar's own value label. `clearAncestor` still
   *  governs the flip-below case, so the card never lands on the axis labels.
   *  Omit it and placement is unchanged for every other caller. */
  tightAbove?: number;
}) {
  const [pos, setPos] = useState<{
    left: number;
    top?: number;
    bottom?: number;
    placement: "bottom" | "top" | "left" | "right";
  } | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<{ x: number; y: number } | null>(null);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { enabled } = useHoverPreference();
  const hoverEnabled = delayOverride != null || enabled;

  function place() {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (anchor === "cursor" && cursorRef.current) {
      const { x, y } = cursorRef.current;
      const roomRight = vw - x;
      const roomLeft = x;
      const openRight = roomRight >= width + 18 || roomRight >= roomLeft;
      const left = Math.max(
        8,
        Math.min(vw - width - 8, openRight ? x + 10 : x - width - 10)
      );
      const top = Math.max(8, Math.min(vh - 420, y - 28));
      setPos({ left, top, placement: openRight ? "right" : "left" });
      return;
    }

    if (side === "left" || side === "right") {
      const roomRight = vw - r.right;
      const roomLeft = r.left;
      const openRight =
        side === "right" ? roomRight >= width || roomRight >= roomLeft : roomRight > roomLeft && roomLeft < width;
      const placement = openRight ? "right" : "left";
      const left = Math.max(
        8,
        Math.min(vw - width - 8, openRight ? r.right : r.left - width)
      );
      // Keep a row preview beside the row instead of centering it over the
      // table. The portal still clamps it inside the viewport.
      const top = Math.max(8, Math.min(vh - 360, r.top + r.height / 2 - 170));
      setPos({ left, top, placement });
      return;
    }

    // Center on the trigger, clamped inside the viewport.
    const left = Math.max(8, Math.min(vw - width - 8, r.left + r.width / 2 - width / 2));
    // When a clear ancestor is named, the popover must sit fully above or
    // below THAT box (the whole chart incl. its value labels), not just the
    // hovered bar — so it can never cover the chart's numbers.
    const clearRect = clearAncestor
      ? el.closest(clearAncestor)?.getBoundingClientRect() ?? r
      : r;
    // …unless the caller opted into hugging the trigger above (bar charts).
    // Every column shares one clear ancestor, so clearing it parks every card
    // at the same height no matter which bar you point at. Anchoring to the
    // trigger — one bar — makes the card ride that bar's own top edge, lifted
    // just enough to clear its value label.
    const topAnchor = tightAbove != null ? r.top - tightAbove : clearRect.top;
    // Honor the requested side, but flip when there's clearly no room.
    const below = vh - clearRect.bottom;
    const above = topAnchor;
    const wantBottom = side === "bottom" ? below >= 260 || below >= above : below > above && above < 260;
    if (wantBottom) setPos({ left, top: clearRect.bottom + 6, placement: "bottom" });
    else setPos({ left, bottom: vh - topAnchor + 6, placement: "top" });
  }

  function show() {
    // `delayMs` no longer sets the delay: it only marks a surface that opens
    // regardless of the user's show-popups toggle (charts). The DELAY itself is
    // always DEFAULT_HOVER_DELAY_MS, everywhere. Callers passing 0 used to make
    // popups fire the instant the cursor touched them.
    const current =
      delayOverride != null
        ? { enabled: true, delayMs: DEFAULT_HOVER_DELAY_MS }
        : { ...readHoverPreference(), delayMs: DEFAULT_HOVER_DELAY_MS };
    if (!current.enabled) return;
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (showTimer.current) clearTimeout(showTimer.current);
    showTimer.current = setTimeout(place, current.delayMs);
  }

  // The popup is position:fixed (portal), so page scroll would leave it
  // stranded mid-viewport while its row moves away (Suren: "when I scroll, it
  // should scroll with it"). While open, re-anchor to the trigger on every
  // scroll/resize — capture phase catches nested scroll containers too.
  const open = pos != null;
  useEffect(() => {
    if (hoverEnabled) return;
    if (showTimer.current) clearTimeout(showTimer.current);
    setPos(null);
  }, [hoverEnabled]);
  useEffect(() => {
    if (!open) return;
    const sync = () => place();
    window.addEventListener("scroll", sync, { capture: true, passive: true });
    window.addEventListener("resize", sync);
    return () => {
      window.removeEventListener("scroll", sync, { capture: true });
      window.removeEventListener("resize", sync);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  function scheduleHide() {
    if (showTimer.current) clearTimeout(showTimer.current);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setPos(null), 110);
  }

  function onBlur(event: React.FocusEvent<HTMLDivElement>) {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    scheduleHide();
  }

  return (
    <div
      ref={triggerRef}
      className={cn("relative", className)}
      onMouseEnter={(event) => {
        cursorRef.current = { x: event.clientX, y: event.clientY };
        show();
      }}
      onMouseMove={(event) => {
        cursorRef.current = { x: event.clientX, y: event.clientY };
      }}
      onMouseLeave={scheduleHide}
      onFocusCapture={show}
      onBlurCapture={onBlur}
    >
      {children}
      {pos != null &&
        createPortal(
          <div
            role="tooltip"
            className="fixed z-[9999]"
            style={{
              left: pos.left,
              top: pos.top,
              bottom: pos.bottom,
              width,
              // Callers pick the width (300-360). On a window narrower than
              // that, `left` bottoms out at the 8px gutter and the card would
              // run off the right edge, so cap it at the viewport as well.
              maxWidth: "calc(100vw - 16px)",
              // Never taller than the space it opened into — scroll inside.
              maxHeight:
                pos.top != null
                  ? `calc(100vh - ${pos.top + 12}px)`
                  : `calc(100vh - ${pos.bottom! + 12}px)`,
            }}
            onMouseEnter={show}
            onMouseLeave={scheduleHide}
          >
            {/* pt/pb (not mt/mb) so the gap to the trigger is inside this
                hoverable element, the cursor never crosses a dead margin. */}
            <div
              className={cn(
                "h-full",
                pos.placement === "bottom" && "pt-2",
                pos.placement === "top" && "pb-2",
                pos.placement === "right" && "pl-2",
                pos.placement === "left" && "pr-2"
              )}
            >
              <div className="hovercard-in max-h-full overflow-y-auto rounded-xl border border-border-light bg-white shadow-[0_16px_48px_rgba(0,0,0,0.18)] p-4">
                {content}
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
