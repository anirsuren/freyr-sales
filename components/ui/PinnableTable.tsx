"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Pin } from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";

/**
 * PIN THE HEADER SO IT IS STILL THERE HALFWAY DOWN (Anir, Aug 13: "for all of
 * these pages where there's a huge table, have the option to pin the table. It
 * should be like a button somewhere, and then it'll actually show up when I
 * scroll down and see everything").
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
 * THE CONTROL LIVES ON THE TABLE ITSELF, NOT IN THE TOOLBAR. It moved twice:
 * first a labelled row of its own (cost a line on five pages), then an icon in
 * the toolbar (its appearing and disappearing shoved the neighboring controls
 * around — Anir, Aug 13: "I don't like how you're moving the rest of that
 * row... move that pin icon somewhere else"). Now PinnableTable renders its
 * own small corner control over the header's right edge, and a twin inside
 * the floating strip so pinning can be undone from anywhere. Toolbars never
 * shift again.
 *
 * The button and the table are far apart in the tree, so the choice lives in a
 * tiny store keyed by table id rather than being passed down through pages.
 * It is remembered, so pinning is a decision made once.
 */

const STORE_PREFIX = "freyr.pinnedTable.";

const pinnedById = new Map<string, boolean>();
const listeners = new Map<string, Set<() => void>>();

function readStored(id: string): boolean {
  try {
    return localStorage.getItem(STORE_PREFIX + id) === "1";
  } catch {
    return false;
  }
}

function subscribe(id: string, fn: () => void): () => void {
  const set = listeners.get(id) ?? new Set();
  set.add(fn);
  listeners.set(id, set);
  return () => set.delete(fn);
}

function setPinned(id: string, next: boolean) {
  pinnedById.set(id, next);
  try {
    localStorage.setItem(STORE_PREFIX + id, next ? "1" : "0");
  } catch {
    // A blocked localStorage only costs the memory of the choice.
  }
  listeners.get(id)?.forEach((fn) => fn());
}

/**
 * The server always renders "not pinned" and the client corrects it after
 * mount — localStorage does not exist during the server render, and disagreeing
 * about the first paint is a hydration error.
 */
function usePinned(id: string): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (!pinnedById.has(id)) pinnedById.set(id, readStored(id));
    setHydrated(true);
    listeners.get(id)?.forEach((fn) => fn());
  }, [id]);
  const value = useSyncExternalStore(
    useCallback((fn) => subscribe(id, fn), [id]),
    () => pinnedById.get(id) ?? false,
    () => false
  );
  return hydrated ? value : false;
}

/** The pin, in the table's top-right corner. The absolute position lives on an
 *  OUTER span: Tooltip wraps its child in a positioned span of its own, and an
 *  absolute button inside that anchors to the tooltip's tiny box, not the table.
 *
 *  THE CORNER IS THE FALLBACK NOW, NOT THE ANSWER. It clips the tail of the
 *  longest last-column label ("TREND" reads as "TREN") and padding the last
 *  <th> does not fix it: these tables are `w-full` with the last column already
 *  squeezed to its own text, so a 44px gutter only makes the label overflow its
 *  padding box. Measured, not assumed: the label ended at x=1464 with the pin at
 *  x=1445, before and after.
 *
 *  Two placements I invented were both worse. Below the table it sat 3084px down
 *  the Team page, 2244px from the header it controls. In its own strip above the
 *  table it read as a stray floating button.
 *
 *  Anir's placement is the one that works, because it lands on a line that
 *  already exists instead of inventing one: the "Showing N of N" count line,
 *  right-aligned (Aug 14: "move the pin logo to the right, on the same line as
 *  the 31 offerings... the pin is always going to cover that last column, so
 *  it's never going to be visible"). Pages that have that line render
 *  <PinTableButton compact/> there and pass showCornerPin={false}. Pages that
 *  do not still get the corner, which is why this stays.
 *
 *  The floating header keeps its own pin either way. Once the page has scrolled
 *  far enough for the strip to appear, the count line is long gone, and that pin
 *  is the only way left to unpin. */
function PinCorner({ id, floating }: { id: string; floating?: boolean }) {
  const pinned = usePinned(id);
  return (
    <span
      className={cn(
        "absolute z-20",
        floating ? "right-2 top-1/2 -translate-y-1/2" : "right-1.5 top-1.5"
      )}
    >
      <Tooltip label={pinned ? "Unpin the column headers" : "Keep the column headers visible while you scroll"}>
        <button
          type="button"
          aria-label={pinned ? "Unpin the column headers" : "Pin the column headers"}
          aria-pressed={pinned}
          onClick={() => setPinned(id, !pinned)}
          /**
           * THE PIN SITS ON TOP OF A COLUMN HEADER, SO IT DOES NOT WEAR A
           * BACKGROUND UNTIL YOU REACH FOR IT.
           *
           * It is absolutely positioned in the table's corner, which means it
           * always covers whatever the last column is called — and it was a
           * filled chip: blue once pinned, a white blob before that. Scrolled
           * far enough for the floating strip, it obscured that header
           * outright (Anir, Aug 14, with a screenshot: "that pin icon should
           * be completely transparent... when my mouse hovers over it, then
           * it can turn properly").
           *
           * So the chip is a hover state now. At rest there is only the glyph,
           * dimmed enough to sit over a header without competing with it and
           * solid enough to still be findable. Pinned-ness is carried by the
           * icon itself — filled and blue — not by a plate behind it, so the
           * state stays readable with nothing covered.
           */
          className={cn(
            "flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border border-transparent bg-transparent transition-all",
            "hover:border-border-light hover:bg-white hover:text-blue-primary hover:shadow-sm",
            "focus-visible:border-border-light focus-visible:bg-white focus-visible:text-blue-primary",
            pinned
              ? "text-blue-primary opacity-90"
              : "text-text-tertiary opacity-55 hover:opacity-100"
          )}
        >
          <Pin size={13} strokeWidth={2} className={cn(pinned && "fill-current")} />
        </button>
      </Tooltip>
    </span>
  );
}

export function PinTableButton({
  id,
  className,
  label = "header",
  compact,
}: {
  id: string;
  className?: string;
  label?: string;
  /** Sits on a text line rather than in a toolbar, so it matches the row's
   *  height instead of setting it. Used by the "Showing N of N" lines. */
  compact?: boolean;
}) {
  const pinned = usePinned(id);
  return (
    <div
      className={cn(
        "inline-flex shrink-0 overflow-hidden rounded-lg border border-border-light bg-white",
        className
      )}
    >
      <Tooltip
        label={
          pinned
            ? `Let the ${label} scroll away again`
            : `Keep the ${label} on screen while you scroll`
        }
      >
        <button
          type="button"
          onClick={() => setPinned(id, !pinned)}
          aria-label={
            pinned ? `Unpin the ${label}` : `Pin the ${label} to the top`
          }
          aria-pressed={pinned}
          className={cn(
            "flex cursor-pointer items-center justify-center transition-colors",
            compact ? "h-7 w-7" : "h-9 w-9",
            pinned
              ? "bg-blue-light text-blue-primary"
              : "text-text-secondary hover:bg-surface hover:text-text-primary"
          )}
        >
          <Pin
            size={compact ? 13 : 15}
            strokeWidth={1.9}
            className={pinned ? "rotate-45" : undefined}
          />
        </button>
      </Tooltip>
    </div>
  );
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
  /** Pass false when the page puts a <PinTableButton> on its count line, so
   *  the corner pin stops sitting on top of the last column header. */
  showCornerPin?: boolean;
}) {
  const pinned = usePinned(id);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const floatRef = useRef<HTMLDivElement>(null);
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

  return (
    <div className={cn("relative", className)}>
      {showCornerPin && <PinCorner id={id} />}
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
            <div
              className="fixed z-40"
              style={{
                top: floating.top,
                left: floating.left,
                width: floating.width,
                height: 0,
              }}
            >
              <div className="relative h-10">
                <PinCorner id={id} floating />
              </div>
            </div>
          </>,
          document.body
        )}
    </div>
  );
}
