"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Maximize2, X } from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";

/**
 * A GRID, THE WHOLE SCREEN, NOTHING ELSE.
 *
 * Anir, Aug 13: "I want there to be a way that I can just literally click a
 * button, and it's gonna literally take up my entire screen, like a full
 * pop-up… It's literally only the entire table."
 *
 * The matrix pages already fill the window below the header, but the header,
 * the page title, the stat tiles and the sidebar still cost real rows. This
 * hands the whole viewport to the table for as long as you want it, then gives
 * it back. Escape closes, the way every other overlay in the app does.
 *
 * The children render in BOTH places, so the caller writes its table once. The
 * open copy is portalled to the body: these grids live inside `.tab-panel` and
 * other transform-animating ancestors, and a transformed ancestor becomes the
 * containing block for `position: fixed`, which would strand the overlay
 * hundreds of pixels from where it belongs.
 */
export function FullScreenButton({
  onOpen,
  label = "table",
  className,
}: {
  onOpen: () => void;
  label?: string;
  className?: string;
}) {
  return (
    <Tooltip label={`Show the ${label} full screen`}>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Show the ${label} full screen`}
        className={cn(
          "flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border-light bg-white text-text-secondary transition-colors hover:bg-surface hover:text-text-primary",
          className
        )}
      >
        <Maximize2 size={15} strokeWidth={1.9} />
      </button>
    </Tooltip>
  );
}

export function FullScreenPanel({
  open,
  onClose,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // Nothing behind this should scroll while it is up.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex flex-col bg-white">
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border-light px-5 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-semibold text-text-primary">
            {title}
          </h2>
          {subtitle && (
            <p className="truncate text-[12px] text-text-tertiary">{subtitle}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close full screen"
          className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface hover:text-text-primary"
        >
          <X size={18} strokeWidth={2} />
        </button>
      </div>
      {/* The table gets every remaining pixel. */}
      <div className="min-h-0 flex-1 overflow-auto p-4">{children}</div>
    </div>,
    document.body
  );
}
