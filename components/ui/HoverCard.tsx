"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

// A lightweight hover popover — shows a blurb after a short hover and hides the
// moment the cursor leaves (Suren: "a little blurb that pops up… when I move
// off it, it should disappear"). Pointer-events-none so it never eats clicks.
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
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function show() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), 130);
  }
  function hide() {
    if (timer.current) clearTimeout(timer.current);
    setOpen(false);
  }

  return (
    <div
      className={cn("relative", className)}
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      {children}
      {open && (
        <div
          className={cn(
            "pointer-events-none absolute left-1/2 -translate-x-1/2 z-50",
            side === "bottom" ? "top-full mt-2" : "bottom-full mb-2"
          )}
          style={{ width }}
        >
          <div className="hovercard-in rounded-xl border border-border-light bg-white shadow-[0_16px_48px_rgba(0,0,0,0.18)] p-4">
            {content}
          </div>
        </div>
      )}
    </div>
  );
}
