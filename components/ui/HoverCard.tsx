"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import {
  CHART_HOVER_CLOSE_GRACE_MS,
  HOVER_CLOSE_GRACE_MS,
  HOVER_DELAY_MS,
  HOVER_HINT_DELAY_MS,
} from "@/lib/hoverPreferences";
import {
  claimGraphHover,
  pointerIsOverGraphTooltip,
  releaseGraphHover,
} from "@/lib/chartHoverCoordinator";

// A hover popover that stays open while the cursor is over the popover itself
// and closes after the shared pointer-transfer window when the cursor leaves
// its active hover surface. It can
// NEVER be clipped: the popover renders in a body portal at a fixed position,
// so `overflow-hidden` ancestors (table cards, grids) can't cut it off — the
// exact bug the team-roster popup hit ("Engaged" clipped to "d"). Same cure as
// the chart tooltips (#146).
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
  suspended = false,
  triggerSelector,
}: {
  children: React.ReactNode;
  content: React.ReactNode;
  side?: "bottom" | "top" | "left" | "right";
  width?: number;
  className?: string;
  // Charts pass 0: inspecting a data point is deliberate, so graph surfaces
  // open instantly (Anir, Aug 8: "If it's a graph, it's immediate"). Any other
  // value is ignored — every non-graph popup waits the app-wide second.
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
  /** Keep the trigger mounted while a click opens a real dialog, but dismiss
   *  this lightweight preview so it cannot sit above that dialog's portal. */
  suspended?: boolean;
  /** Restrict opening to a descendant that matches this selector. Chart rows
   *  use this so labels and empty plot space never behave like data marks. */
  triggerSelector?: string;
}) {
  const hoverOwnerId = useId();
  const isGraphHover = delayOverride === 0 || !!triggerSelector;
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
  const overTrigger = useRef(false);
  function matchesTrigger(target: EventTarget | null) {
    if (!triggerSelector) return true;
    return target instanceof Element && !!target.closest(triggerSelector);
  }
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
    if (suspended) return;
    // A graph mark owns the app's one graph-preview slot as soon as the pointer
    // reaches it. This closes a previous bar/point card before the new card's
    // dwell finishes, so adjacent marks can never leave two previews open.
    if (isGraphHover) claimGraphHover(hoverOwnerId, hideImmediately);
    // Two tiers only (Anir, Aug 8: "everything is either 1 second or 0.25
    // seconds"): graph surfaces (delayMs 0) get the fast quarter-second, every
    // other popup waits the full second. No user toggle exists any more.
    const delay = delayOverride === 0 ? HOVER_HINT_DELAY_MS : HOVER_DELAY_MS;
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (showTimer.current) clearTimeout(showTimer.current);
    showTimer.current = setTimeout(place, delay);
  }

  // The popup is position:fixed (portal), so page scroll would leave it
  // stranded mid-viewport while its row moves away (Suren: "when I scroll, it
  // should scroll with it"). While open, re-anchor to the trigger on every
  // scroll/resize — capture phase catches nested scroll containers too.
  const open = pos != null;
  useEffect(() => {
    if (!suspended) return;
    if (showTimer.current) clearTimeout(showTimer.current);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setPos(null);
    releaseGraphHover(hoverOwnerId);
  }, [hoverOwnerId, suspended]);
  useEffect(
    () => () => {
      if (showTimer.current) clearTimeout(showTimer.current);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      releaseGraphHover(hoverOwnerId);
    },
    [hoverOwnerId]
  );
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
    // Graphs get one short handoff window so the pointer can cross from the
    // mark into the portaled, scrollable card. Entering the card cancels it.
    const closeGrace =
      isGraphHover
        ? CHART_HOVER_CLOSE_GRACE_MS
        : HOVER_CLOSE_GRACE_MS;
    if (closeGrace <= 0) {
      hideImmediately();
      return;
    }
    hideTimer.current = setTimeout(() => {
      hideTimer.current = null;
      if (isGraphHover && pointerIsOverGraphTooltip()) return;
      hideImmediately();
    }, closeGrace);
  }

  function hideImmediately() {
    if (showTimer.current) clearTimeout(showTimer.current);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    showTimer.current = null;
    hideTimer.current = null;
    setPos(null);
    releaseGraphHover(hoverOwnerId);
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
        if (!matchesTrigger(event.target)) return;
        overTrigger.current = true;
        cursorRef.current = { x: event.clientX, y: event.clientY };
        show();
      }}
      onMouseMove={(event) => {
        const allowed = matchesTrigger(event.target);
        if (!allowed) {
          if (overTrigger.current) {
            overTrigger.current = false;
            scheduleHide();
          }
          return;
        }
        cursorRef.current = { x: event.clientX, y: event.clientY };
        if (!overTrigger.current) {
          overTrigger.current = true;
          show();
        }
      }}
      onMouseLeave={() => {
        overTrigger.current = false;
        scheduleHide();
      }}
      onFocusCapture={(event) => {
        if (matchesTrigger(event.target)) show();
      }}
      onBlurCapture={onBlur}
    >
      {children}
      {pos != null && !suspended &&
        createPortal(
          <div
            role="tooltip"
            data-graph-tooltip={isGraphHover ? "true" : undefined}
            className="fixed z-[9999] pointer-events-auto"
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
            onMouseEnter={() => {
              if (hideTimer.current) clearTimeout(hideTimer.current);
              hideTimer.current = null;
            }}
            onMouseLeave={hideImmediately}
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
