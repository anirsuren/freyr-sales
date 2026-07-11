"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

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
  const cardCls =
    "absolute inset-x-0 top-0 block bg-white border border-border-light rounded-xl p-5 shadow-card origin-top " +
    "transition-[transform,box-shadow,border-color] duration-200 ease-out " +
    "group-hover:scale-[1.03] group-hover:z-30 group-hover:border-blue-subtle " +
    "group-hover:shadow-[0_28px_64px_-16px_rgba(0,0,0,0.30)] " +
    "group-active:scale-[1.0]";

  const body = (
    <>
      {summary}
      {/* grid-rows 0fr → 1fr animates the reveal without a fixed max-height */}
      <div className="grid grid-rows-[0fr] group-hover:grid-rows-[1fr] transition-[grid-template-rows] duration-200 ease-out">
        <div className="overflow-hidden min-h-0">
          <div className="pt-4 mt-4 border-t border-border-light opacity-0 group-hover:opacity-100 transition-opacity duration-200 delay-75">
            {extra}
          </div>
        </div>
      </div>
    </>
  );

  return (
    // `hover:z-30` lifts the WHOLE cell above its siblings — without it the
    // expanded card overflows into the next grid cell, whose own card paints on
    // top (z-index only competes within a cell, and each card sits in its own
    // `relative` wrapper). This keeps the pop-out on top of every neighbour.
    <div className={cn("group relative hover:z-30", className)}>
      {/* The real, visible card comes FIRST in DOM so any `.first()` selector
          (and screen-reader focus) lands on it, not the hidden clone below. */}
      {href ? (
        <Link href={href} className={cardCls}>
          {body}
        </Link>
      ) : (
        <div className={cardCls}>{body}</div>
      )}
      {/* Reserves the resting footprint so the grid row keeps its height. The
          real card is absolutely positioned over it. */}
      <div className="p-5 invisible" aria-hidden>
        {summary}
      </div>
    </div>
  );
}
