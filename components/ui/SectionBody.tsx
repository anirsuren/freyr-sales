"use client";

import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Matches the dropdown motion — same expo-out curve, same family of feel. */
const OPEN_MS = 260;

/**
 * THE SECTION ACTUALLY OPENS INSTEAD OF APPEARING.
 *
 * A collapsible card used to swap its body in and out with no transition at
 * all, so a page of six sections snapped between two layouts on every click
 * (Anir, Aug 8, on the Edit offering page: "there is still no animation on any
 * of these drop-downs"). The body now expands on a grid-rows 0fr → 1fr
 * transition, which animates real height without anyone measuring it, and
 * fades in as it goes.
 *
 * It still UNMOUNTS when closed, just one beat later — Sales materials holds
 * twenty-five rows, and keeping every closed section mounted to get a smoother
 * close would cost more than the close is worth.
 *
 * Cards that never collapse (`expanded` undefined) render exactly as before.
 */
export function SectionBody({
  expanded,
  bodyClassName,
  children,
}: {
  expanded?: boolean;
  bodyClassName?: string;
  children: ReactNode;
}) {
  const collapsed = expanded === false;
  const [mounted, setMounted] = useState(!collapsed);
  // Separate from `mounted`: the body has to be in the DOM at 0fr for one
  // frame before it grows, or there is nothing for the browser to animate
  // from and it snaps open exactly like it used to.
  const [grown, setGrown] = useState(!collapsed);

  useEffect(() => {
    if (!collapsed) {
      setMounted(true);
      const frame = requestAnimationFrame(() => setGrown(true));
      return () => cancelAnimationFrame(frame);
    }
    setGrown(false);
    const timer = window.setTimeout(() => setMounted(false), OPEN_MS);
    return () => window.clearTimeout(timer);
  }, [collapsed]);

  if (expanded === undefined) {
    return <div className={cn("p-5", bodyClassName)}>{children}</div>;
  }
  if (!mounted) return null;

  return (
    <div
      aria-hidden={collapsed}
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-[260ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
        grown ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
      )}
    >
      <div className="overflow-hidden">
        <div className={cn("p-5", bodyClassName)}>{children}</div>
      </div>
    </div>
  );
}
