"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/**
 * THE COLUMN HEADERS ARE ALWAYS THERE HALFWAY DOWN — NO BUTTON, NO CHOICE.
 *
 * This began as a pin you had to find and press (Anir, Aug 13: "for all of
 * these pages where there's a huge table, have the option to pin the table").
 * Aug 24 he watched himself use it and cut the control: "if I click on this,
 * the header row is always visible — I think we can do that by default... there
 * is no need for the pin, you can remove that." Nobody scrolls a 120-row table
 * hoping the headers go away, so the setting only ever had one useful value.
 *
 * Why this is not four lines of CSS: every wide table in this app lives inside
 * `overflow-x-auto` so it can scroll sideways on a narrow window. In CSS, a
 * non-visible overflow on one axis forces the other axis to `auto` too, which
 * makes that wrapper its own scroll container — and a `position: sticky` header
 * inside it sticks to a box that never scrolls vertically, so it does nothing
 * at all. Removing the horizontal scroll to fix that would break the wide
 * tables on a laptop, which is worse.
 *
 * So the header is cloned instead. While the real one is scrolled out of sight
 * the clone is drawn in a fixed strip at the top of the page, exactly as wide
 * as the table and scrolled to the same horizontal position — it is a copy of
 * the real markup, so it cannot drift from the columns beneath it, and it
 * disappears the moment the table itself does.
 *
 * THE SIDEWAYS SCROLLBAR GETS THE SAME TREATMENT. A wide table's horizontal
 * bar lives at the BOTTOM of the table, so on a 120-row table you had to scroll
 * to the end of the page before you could scroll sideways (Anir, Aug 24: "if I
 * have to scroll left to right, I first have to scroll all the way down"). The
 * same clone trick answers it: a thin proxy bar fixed to the bottom of the
 * window, its scrollLeft wired to the real scroller in both directions, shown
 * only while the table both overflows sideways and runs off the bottom.
 */

/**
 * The floating strip is measured from live DOM rects, so it can only be built
 * on the client. The server renders the plain table and the effects take over
 * after mount — the same reason this was hydration-safe when it was a stored
 * preference.
 */
function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

/**
 * KEPT AS A NO-OP ON PURPOSE. Two pages render this on their "Showing N of N"
 * line; the headers now stay put with no control at all (Anir, Aug 24: "there
 * is no need for the pin, you can remove that"), so the button renders nothing
 * rather than the callers each growing a conditional.
 */
export function PinTableButton(_props: {
  id: string;
  className?: string;
  label?: string;
  compact?: boolean;
}) {
  return null;
}

export function PinnableTable({
  id,
  children,
  className,
  wrapperClassName,
  showCornerPin = true,
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
  wrapperClassName?: string;
  /** Vestigial: the corner pin is gone. Callers still pass it. */
  showCornerPin?: boolean;
}) {
  const pinned = useMounted();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const floatRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const [rail, setRail] = useState<{
    left: number;
    width: number;
    inner: number;
  } | null>(null);
  const [floating, setFloating] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  useEffect(() => {
    if (!pinned) {
      setFloating(null);
      return;
    }
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const page =
      (document.getElementById("main-content") as HTMLElement | null) || null;

    const measure = () => {
      const table = scroller.querySelector("table");
      const head = table?.querySelector("thead");
      if (!table || !head) {
        setFloating(null);
        return;
      }
      // The top of the VISIBLE part of the scroller. Clamping at 0 matters: on
      // some pages the window scrolls rather than the inner container, which
      // drags the container's own top far above the viewport and would have
      // parked the strip off-screen.
      const pageTop = Math.max(page ? page.getBoundingClientRect().top : 0, 0);
      const headRect = head.getBoundingClientRect();
      const tableRect = table.getBoundingClientRect();
      const scrollerRect = scroller.getBoundingClientRect();
      // Only while the real header is above the fold AND some of the table is
      // still on screen — a header floating over the next section would be
      // worse than no header at all.
      const past = headRect.top < pageTop;
      const stillHere = tableRect.bottom > pageTop + headRect.height;
      // Only produce a NEW object when a value moved: plain vertical scrolling
      // keeps top/left/width identical, and returning the previous object stops
      // the clone effect below from tearing the strip down and rebuilding it
      // on every scroll frame.
      setFloating((prev) => {
        if (!(past && stillHere)) return prev === null ? prev : null;
        const next = {
          top: pageTop,
          left: scrollerRect.left,
          width: scrollerRect.width,
        };
        return prev &&
          prev.top === next.top &&
          prev.left === next.left &&
          prev.width === next.width
          ? prev
          : next;
      });
    };

    measure();
    const onScroll = () => measure();
    page?.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", measure);
    scroller.addEventListener("scroll", onScroll, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    return () => {
      page?.removeEventListener("scroll", onScroll);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", measure);
      scroller.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, [pinned]);

  // Cloning the real <thead> keeps every class, icon and alignment the design
  // already got right, instead of a second copy that can drift from it.
  useEffect(() => {
    const host = floatRef.current;
    const scroller = scrollerRef.current;
    if (!host || !scroller || !floating) return;
    const table = scroller.querySelector("table");
    const head = table?.querySelector("thead");
    if (!table || !head) return;

    host.textContent = "";
    const copy = document.createElement("table");
    copy.className = table.className;
    copy.setAttribute("aria-hidden", "true");
    copy.appendChild(head.cloneNode(true));
    host.appendChild(copy);

    // A thead cloned into a table WITHOUT its body lays out its own columns
    // from header text alone — the real table's columns are stretched by the
    // body cells beneath them, so the strip's columns sat over the wrong data
    // (Anir, Aug 13: "your pinning thing doesn't even match the actual columns
    // you retarget"). Freeze the clone to the real header's measured widths:
    // `table-layout: fixed` makes the first row's explicit widths law.
    const applyWidths = () => {
      copy.style.tableLayout = "fixed";
      copy.style.width = `${table.getBoundingClientRect().width}px`;
      const real = head.querySelectorAll("th, td");
      const cloned = copy.querySelectorAll("th, td");
      real.forEach((cell, index) => {
        const target = cloned[index] as HTMLElement | undefined;
        if (!target) return;
        target.style.width = `${cell.getBoundingClientRect().width}px`;
      });
    };
    applyWidths();
    host.scrollLeft = scroller.scrollLeft;

    const sync = () => {
      host.scrollLeft = scroller.scrollLeft;
    };
    scroller.addEventListener("scroll", sync, { passive: true });
    // Column widths move when data pages in or the window resizes; remeasure
    // from the real table whenever it changes shape.
    const observer = new ResizeObserver(applyWidths);
    observer.observe(table);
    return () => {
      scroller.removeEventListener("scroll", sync);
      observer.disconnect();
    };
  }, [floating]);

  // ---- the sideways scrollbar, brought up to the bottom of the window.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const measure = () => {
      const rect = scroller.getBoundingClientRect();
      const overflows = scroller.scrollWidth - scroller.clientWidth > 4;
      // Only worth showing while the table runs PAST the bottom of the window:
      // if its own bar is already on screen, a second one is noise.
      const runsOffTheBottom = rect.bottom > window.innerHeight - 4;
      const onScreen = rect.top < window.innerHeight && rect.bottom > 0;
      setRail((prev) => {
        if (!(overflows && runsOffTheBottom && onScreen)) {
          return prev === null ? prev : null;
        }
        const next = {
          left: rect.left,
          width: rect.width,
          inner: scroller.scrollWidth,
        };
        return prev &&
          prev.left === next.left &&
          prev.width === next.width &&
          prev.inner === next.inner
          ? prev
          : next;
      });
    };

    measure();
    const page = document.getElementById("main-content");
    page?.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    return () => {
      page?.removeEventListener("scroll", measure);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
      observer.disconnect();
    };
  }, []);

  // Two-way sync: dragging the proxy scrolls the table, and scrolling the table
  // (or the floating header strip) moves the proxy back.
  useEffect(() => {
    const scroller = scrollerRef.current;
    const proxy = railRef.current;
    if (!scroller || !proxy || !rail) return;
    let lock = false;
    const fromProxy = () => {
      if (lock) return;
      lock = true;
      scroller.scrollLeft = proxy.scrollLeft;
      lock = false;
    };
    const fromTable = () => {
      if (lock) return;
      lock = true;
      proxy.scrollLeft = scroller.scrollLeft;
      lock = false;
    };
    proxy.scrollLeft = scroller.scrollLeft;
    proxy.addEventListener("scroll", fromProxy, { passive: true });
    scroller.addEventListener("scroll", fromTable, { passive: true });
    return () => {
      proxy.removeEventListener("scroll", fromProxy);
      scroller.removeEventListener("scroll", fromTable);
    };
  }, [rail]);

  return (
    <div className={cn("relative", className)}>
      <div ref={scrollerRef} className={cn("overflow-x-auto", wrapperClassName)}>
        {children}
      </div>

      {/* PORTALLED TO THE BODY ON PURPOSE. `.tab-panel`, which wraps the
          Offerings and FDL tables, animates a `transform` — and a transformed
          ancestor becomes the containing block for `position: fixed`, so the
          strip was being positioned against that panel instead of the window
          and landed hundreds of pixels above the top of the screen. globals.css
          warns about exactly this next to `.page-in`. Rendering outside the
          tree sidesteps it for every caller, present and future. */}
      {floating &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            <div
              ref={floatRef}
              aria-hidden="true"
              className="popover-in pointer-events-none fixed z-30 overflow-hidden border-b-2 border-blue-primary/30 bg-white shadow-[0_10px_24px_-8px_rgba(15,23,42,0.34)]"
              style={{
                top: floating.top,
                left: floating.left,
                width: floating.width,
              }}
            />
          </>,
          document.body
        )}

      {/* THE SIDEWAYS BAR, AT THE BOTTOM OF THE WINDOW INSTEAD OF THE BOTTOM
          OF THE TABLE. Portalled for the same reason as the header strip: the
          animated `.tab-panel` ancestor would otherwise become the containing
          block for `position: fixed`. */}
      {rail &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={railRef}
            aria-hidden="true"
            className="freyr-rail fixed bottom-0 z-30 overflow-x-auto overflow-y-hidden border-t border-border-light bg-white/95 backdrop-blur-sm"
            style={{ left: rail.left, width: rail.width, height: 14 }}
          >
            <div style={{ width: rail.inner, height: 1 }} />
          </div>,
          document.body
        )}
    </div>
  );
}
