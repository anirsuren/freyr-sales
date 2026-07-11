"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

// A hover popover that STAYS OPEN while the cursor is over the popover itself
// (Suren: "when I hover onto the pop-up it shouldn't disappear"). Two things make
// that work: the popover is interactive (no pointer-events-none) and it owns the
// gap between it and the trigger as PADDING (not a dead margin), plus a small
// close delay so crossing that gap never dismisses it.
export function HoverCard({
  children,
  content,
  side = "bottom",
  width = 300,
  className,
}: {
  children: React.ReactNode;
  content: React.ReactNode;
  side?: "bottom" | "top";
  width?: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function show() {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (showTimer.current) clearTimeout(showTimer.current);
    showTimer.current = setTimeout(() => setOpen(true), 120);
  }
  function scheduleHide() {
    if (showTimer.current) clearTimeout(showTimer.current);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setOpen(false), 110);
  }

  return (
    <div
      // Elevate the whole wrapper while open so the popover paints above the next
      // card (an un-z-indexed subtree stacks in DOM order).
      className={cn("relative", open ? "z-50" : "z-0", className)}
      onMouseEnter={show}
      onMouseLeave={scheduleHide}
    >
      {children}
      {open && (
        <div
          className={cn(
            // pt/pb (not mt/mb) so the gap to the trigger is inside this
            // hoverable element — the cursor never crosses a dead margin.
            "absolute left-1/2 -translate-x-1/2 z-50",
            side === "bottom" ? "top-full pt-2" : "bottom-full pb-2"
          )}
          style={{ width }}
          onMouseEnter={show}
          onMouseLeave={scheduleHide}
        >
          <div className="hovercard-in rounded-xl border border-border-light bg-white shadow-[0_16px_48px_rgba(0,0,0,0.18)] p-4">
            {content}
          </div>
        </div>
      )}
    </div>
  );
}
