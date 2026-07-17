"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import {
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
    // Honor the requested side, but flip when there's clearly no room.
    const below = vh - r.bottom;
    const above = r.top;
    const wantBottom = side === "bottom" ? below >= 260 || below >= above : below > above && above < 260;
    if (wantBottom) setPos({ left, top: r.bottom, placement: "bottom" });
    else setPos({ left, bottom: vh - r.top, placement: "top" });
  }

  function show() {
    const current =
      delayOverride != null
        ? { enabled: true, delayMs: delayOverride }
        : readHoverPreference();
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
                hoverable element — the cursor never crosses a dead margin. */}
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
