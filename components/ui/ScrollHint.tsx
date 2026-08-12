"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * "THERE IS MORE BELOW THIS." A scrollable list inside a dialog looks like a
 * finished list — the last visible row sits flush against the buttons and
 * nothing says to keep going (Anir, Aug 8: "I can't really tell that there are
 * more customers. I wouldn't know to scroll here").
 *
 * Two signals, both of which disappear the moment you reach the end: the
 * content fades out at the boundary instead of being cut off, and a chevron
 * offers to page down for you.
 *
 * No count. Guessing how many rows are out of view from the scroll height was
 * wrong as often as it was right — it said "1 more" over ten hidden rows — and
 * the number was never the point (Anir, Aug 9: "you don't even need to say
 * that, it's obvious there's a scroll").
 */
export function ScrollHint({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  const [atTop, setAtTop] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      setAtTop(el.scrollTop < 4);
      setMore(el.scrollHeight - el.clientHeight - el.scrollTop > 4);
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [children]);

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
          "pointer-events-none absolute inset-x-0 bottom-0 h-8 rounded-b-lg bg-gradient-to-t from-white/95 via-white/55 to-transparent transition-opacity",
          more ? "opacity-100" : "opacity-0"
        )}
      />

      <button
        type="button"
        aria-label="Scroll down for more"
        tabIndex={more ? 0 : -1}
        aria-hidden={!more}
        onClick={() =>
          ref.current?.scrollBy({
            top: ref.current.clientHeight * 0.8,
            behavior: "smooth",
          })
        }
        className={cn(
          // Bottom-RIGHT, on the same line the dialog's own action sits on
          // (Anir: "that arrow should be where the save button is"), so the
          // list can run all the way down without the chevron covering rows.
          "absolute -bottom-3 right-0 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-border-light bg-white text-text-secondary shadow-[0_2px_8px_rgba(16,24,40,0.10)] transition-all hover:border-blue-subtle hover:text-blue-primary",
          more
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none translate-y-1 opacity-0"
        )}
      >
        <ChevronDown size={14} strokeWidth={2.4} className="animate-bounce-hint" />
      </button>
    </div>
  );
}
