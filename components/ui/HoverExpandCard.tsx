"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useHoverPreference } from "@/lib/hoverPreferences";

// A card that, on hover, POPS OUT in place — it scales up over its neighbours
// and reveals extra detail that's hidden at rest — instead of dropping a
// separate popover below it (Suren: "show the popup on top of the card I'm
// hovering, scale it up so it pops out of the screen").
//
// How it stays put: an invisible clone of `summary` reserves the resting
// height, and the real, styled card is absolutely positioned on top of it. On
// hover the absolute card scales, elevates (z-index + shadow), and grows
// downward to reveal `extra` — none of which disturbs the surrounding grid.
export function HoverExpandCard({
  summary,
  extra,
  href,
  className,
}: {
  summary: ReactNode;
  extra: ReactNode;
  href?: string;
  className?: string;
}) {
  const { enabled, delayMs } = useHoverPreference();
  const summaryRef = useRef<HTMLDivElement>(null);
  const [summaryHeight, setSummaryHeight] = useState(56);

  useLayoutEffect(() => {
    const node = summaryRef.current;
    if (!node) return;
    const measure = () => setSummaryHeight(node.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const hoverDelayStyle = enabled
    ? ({ "--hover-expand-delay": `${delayMs}ms` } as CSSProperties)
    : undefined;
  const cardCls = cn(
    "absolute inset-x-0 top-0 block bg-white border border-border-light rounded-xl p-5 shadow-card origin-top transition-[transform,box-shadow,border-color] duration-200 ease-out delay-0 group-hover:[transition-delay:var(--hover-expand-delay)]",
    enabled &&
      "group-hover:scale-[1.03] group-hover:z-30 group-hover:border-blue-subtle group-hover:shadow-[0_28px_64px_-16px_rgba(0,0,0,0.30)] group-active:scale-[1.0]"
  );

  const body = (
    <>
      <div ref={summaryRef}>{summary}</div>
      {/* grid-rows 0fr → 1fr animates the reveal without a fixed max-height */}
      {enabled && (
        <div
          className="grid grid-rows-[0fr] group-hover:grid-rows-[1fr] transition-[grid-template-rows] duration-200 ease-out delay-0 group-hover:[transition-delay:var(--hover-expand-delay)]"
        >
          <div className="overflow-hidden min-h-0">
            <div
              className="pt-4 mt-4 border-t border-border-light opacity-0 group-hover:opacity-100 transition-opacity duration-200 delay-0 group-hover:[transition-delay:var(--hover-expand-delay)]"
            >
              {extra}
            </div>
          </div>
        </div>
      )}
    </>
  );

  return (
    // `hover:z-30` lifts the WHOLE cell above its siblings — without it the
    // expanded card overflows into the next grid cell, whose own card paints on
    // top (z-index only competes within a cell, and each card sits in its own
    // `relative` wrapper). This keeps the pop-out on top of every neighbour.
    <div
      className={cn("group relative", enabled && "hover:z-30", className)}
      style={hoverDelayStyle}
    >
      {/* The real, visible card comes FIRST in DOM so any `.first()` selector
          (and screen-reader focus) lands on it, not the hidden clone below. */}
      {href ? (
        <Link href={href} className={cardCls}>
          {body}
        </Link>
      ) : (
        <div className={cardCls}>{body}</div>
      )}
      {/* Reserve only measured space, not an invisible copy of the content.
          The old clone made every label appear twice to search, tests and
          assistive tooling even though only one copy was painted. */}
      <div aria-hidden style={{ height: summaryHeight + 40 }} />
    </div>
  );
}
