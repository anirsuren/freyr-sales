"use client";

import { useEffect, useRef, useState } from "react";

/**
 * MAKE A GRID REACH THE BOTTOM OF THE SCREEN.
 *
 * A matrix is the whole point of the page it sits on, so it should end where
 * the window ends, not wherever its rows happen to run out (Anir, Aug 13: "the
 * y dimension has to go all the way to the bottom").
 *
 * A fixed `calc(100vh - 190px)` cannot do this: the element's distance from the
 * top of the window changes with the filters, the stat tiles above it and the
 * width of the browser. So measure where the element actually starts and give
 * it everything below that, less a small gap so the last row is not welded to
 * the edge.
 *
 * Returns a ref to attach and a style with an exact pixel height. Height is
 * null until the first measurement, so nothing renders at a guessed size.
 */
export function useFillHeight(gap = 24, min = 320) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => {
      const top = node.getBoundingClientRect().top;
      setHeight(Math.max(min, window.innerHeight - top - gap));
    };
    measure();
    window.addEventListener("resize", measure);
    // The element's top moves whenever anything above it grows or collapses (a
    // filter wrapping to a second line, a banner appearing), and neither of
    // those fires a resize event.
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    if (node.parentElement) ro.observe(node.parentElement);
    return () => {
      window.removeEventListener("resize", measure);
      ro.disconnect();
    };
  }, [gap, min]);

  return { ref, height };
}
