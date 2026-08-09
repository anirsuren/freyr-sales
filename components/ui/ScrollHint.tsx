"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * "THERE IS MORE BELOW THIS." A scrollable list inside a dialog looks like a
 * finished list — the last visible row sits flush against the buttons and
 * nothing says to keep going (Anir, Aug 8: "I can't really tell that there are
 * more customers. I wouldn't know to scroll here… show that there's more
 * after").
 *
 * Three signals, all of which disappear the moment you reach the end:
 *   - the content fades out at the boundary instead of being cut off,
 *   - a pill counts what is still below ("6 more"),
 *   - the same pill is a button, so it can be clicked instead of scrolled.
 *
 * `count` is the total number of items; the pill needs it to say how many are
 * out of view, and rows are assumed to be evenly sized (they are — this wraps
 * pick lists, not prose).
 */
export function ScrollHint({
  children,
  count,
  className,
  label = "more",
}: {
  children: React.ReactNode;
  count?: number;
  className?: string;
  /** Noun for the pill: "6 more customers". */
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [remaining, setRemaining] = useState(0);
  const [atTop, setAtTop] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const hidden = el.scrollHeight - el.clientHeight - el.scrollTop;
      setAtTop(el.scrollTop < 4);
      if (hidden < 4) {
        setRemaining(0);
        return;
      }
      // How many whole rows are still below the fold.
      const rows = el.children.length || 1;
      const rowHeight = el.scrollHeight / rows;
      setRemaining(
        count && rowHeight > 0 ? Math.max(1, Math.round(hidden / rowHeight)) : 1
      );
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [count, children]);

  return (
    <div className="relative">
      <div ref={ref} className={cn("overflow-y-auto", className)}>
        {children}
      </div>

      {/* Top edge: only once you have scrolled, so it never sits there on a
          list that starts at the beginning. */}
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-8 rounded-t-lg bg-gradient-to-b from-white to-transparent transition-opacity",
          atTop ? "opacity-0" : "opacity-100"
        )}
      />

      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 h-12 rounded-b-lg bg-gradient-to-t from-white via-white/85 to-transparent transition-opacity",
          remaining > 0 ? "opacity-100" : "opacity-0"
        )}
      />

      <button
        type="button"
        tabIndex={remaining > 0 ? 0 : -1}
        aria-hidden={remaining === 0}
        onClick={() =>
          ref.current?.scrollBy({
            top: ref.current.clientHeight * 0.8,
            behavior: "smooth",
          })
        }
        className={cn(
          "absolute bottom-1.5 left-1/2 inline-flex -translate-x-1/2 cursor-pointer items-center gap-1 rounded-full border border-border-light bg-white px-2.5 py-1 text-[11.5px] font-semibold text-text-secondary shadow-[0_2px_8px_rgba(16,24,40,0.10)] transition-all hover:border-blue-subtle hover:text-blue-primary",
          remaining > 0
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none translate-y-1 opacity-0"
        )}
      >
        {remaining} {label}
        <ChevronDown size={12} strokeWidth={2.4} className="animate-bounce-hint" />
      </button>
    </div>
  );
}
