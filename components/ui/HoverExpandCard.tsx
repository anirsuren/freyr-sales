"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { HOVER_DELAY_MS } from "@/lib/hoverPreferences";

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
  stretchSummary = false,
  accent,
}: {
  summary: ReactNode;
  extra: ReactNode;
  href?: string;
  className?: string;
  /** Let the resting summary FILL the card's height so a `mt-auto` row inside
   *  it (a phone line, a footer) sits on the card's bottom edge — the divider
   *  and that row then land on the same baseline across a whole row of cards,
   *  whatever length each description runs (Suren, Jul 27: "why is the Nina
   *  agent like that… it's only one line instead of two. JUST ADD A LINE").
   *  Opt-in, so every other card in the app keeps its exact current layout. */
  stretchSummary?: boolean;
  /** Paint the card's edge in a caller-chosen colour — the offerings tile uses
   *  its category's colour so a row of cards is sorted by eye before it is read
   *  (Saras, Aug 24: "the borders of the box and this line can be the same
   *  colour as the font"). Inline, so it wins over the hover border class and
   *  the card keeps its identity while it is expanded. */
  accent?: string | null;
}) {
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
  const hoverDelayStyle = {
    "--hover-expand-delay": `${HOVER_DELAY_MS}ms`,
  } as CSSProperties;
  const cardCls = cn(
    // min-h-full: when the wrapper is stretched by a grid row, the resting
    // card face fills the cell so neighbouring cards stay equal-height
    // (Suren's symmetry rule). Growth on hover is unaffected — it's a minimum.
    "hover-expand-face absolute inset-x-0 top-0 min-h-full bg-white border border-border-light rounded-xl p-5 shadow-card origin-top transition-[transform,box-shadow,border-color] duration-200 ease-out delay-0 group-hover:[transition-delay:var(--hover-expand-delay)]",
    stretchSummary ? "flex flex-col" : "block",
    // Press-down on click: navigation from these cards had no feedback at
    // all — snapping back to 1.0 reads as nothing (Anir, Jul 25: "there's no
    // animation when I click"). 0.97 matches the app-wide button press.
    "group-hover:scale-[1.03] group-hover:z-30 group-hover:border-blue-subtle group-hover:shadow-[0_28px_64px_-16px_rgba(0,0,0,0.30)] group-active:scale-[0.97] group-active:duration-75"
  );

  const accentStyle = accent ? ({ borderColor: accent } as CSSProperties) : undefined;

  const body = (
    <>
      <div ref={summaryRef} className={cn(stretchSummary && "flex flex-1 flex-col")}>
        {summary}
      </div>
      {/* grid-rows 0fr → 1fr animates the reveal without a fixed max-height */}
      {(
        <div
          className="hover-expand-reveal grid grid-rows-[0fr] group-hover:grid-rows-[1fr] transition-[grid-template-rows] duration-200 ease-out delay-0 group-hover:[transition-delay:var(--hover-expand-delay)]"
        >
          <div className="overflow-hidden min-h-0">
            <div
              className="hover-expand-extra pt-4 mt-4 border-t border-border-light opacity-0 group-hover:opacity-100 transition-opacity duration-200 delay-0 group-hover:[transition-delay:var(--hover-expand-delay)]"
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
      className={cn("hover-expand group relative hover:z-30", className)}
      style={hoverDelayStyle}
    >
      {/* The real, visible card comes FIRST in DOM so any `.first()` selector
          (and screen-reader focus) lands on it, not the hidden clone below. */}
      {href ? (
        <Link href={href} className={cardCls} style={accentStyle}>
          {body}
        </Link>
      ) : (
        <div className={cardCls} style={accentStyle}>
          {body}
        </div>
      )}
      {/* Reserve only measured space, not an invisible copy of the content.
          The old clone made every label appear twice to search, tests and
          assistive tooling even though only one copy was painted. */}
      <div aria-hidden style={{ height: summaryHeight + 40 }} />
    </div>
  );
}
