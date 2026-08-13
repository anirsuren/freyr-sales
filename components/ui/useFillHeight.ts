"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * MAKE A GRID REACH THE BOTTOM OF THE SCREEN.
 *
 * A matrix is the whole point of the page it sits on, so it should end where
 * the window ends (Anir, Aug 13: "the y dimension has to go all the way to the
 * bottom… it has to go down to the bottom perfectly").
 *
 * MEASURED FROM THE SCROLLER, NOT FROM THE ELEMENT'S CURRENT POSITION. The
 * first version used the element's own `top`, which is its position while the
 * page sits unscrolled, with stat tiles and filters above it. That produced a
 * grid sized to the leftover strip at the bottom of the first screen, so
 * scrolling down left it ending hundreds of pixels short (Anir: "when I scroll
 * properly so that the top of the heatmap is at the top, that's when it should
 * be there"). The right number is the height of the scrolling viewport itself:
 * once you scroll the grid's top up to the top, it then fills the screen
 * exactly.
 *
 * A CALLBACK REF, not a plain one, because these grids render conditionally
 * (there is an empty state above them). With a plain ref plus a mount effect
 * the node did not exist when the effect ran, the measurement never happened,
 * and the element collapsed to its min-height instead.
 */
export function useFillHeight(gap = 24, min = 320) {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [height, setHeight] = useState<number | null>(null);
  const frame = useRef(0);

  const ref = useCallback((next: HTMLDivElement | null) => setNode(next), []);

  useEffect(() => {
    if (!node) return;

    /** The box that actually scrolls this page, or the window. */
    const scroller = () => {
      let el: HTMLElement | null = node.parentElement;
      while (el && el !== document.body) {
        const style = getComputedStyle(el);
        if (/(auto|scroll|overlay)/.test(style.overflowY)) return el;
        el = el.parentElement;
      }
      return document.getElementById("main-content");
    };

    const measure = () => {
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        const box = scroller();
        // Where the visible area starts. Clamped at 0 for the case where the
        // window scrolls instead and the container's top has gone negative.
        const top = box ? Math.max(box.getBoundingClientRect().top, 0) : 0;
        setHeight(Math.max(min, Math.round(window.innerHeight - top - gap)));
      });
    };

    measure();
    window.addEventListener("resize", measure);
    // The scroller's top moves when a banner appears or the sidebar collapses,
    // and neither fires a window resize.
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    return () => {
      cancelAnimationFrame(frame.current);
      window.removeEventListener("resize", measure);
      ro.disconnect();
    };
  }, [node, gap, min]);

  return { ref, height };
}
