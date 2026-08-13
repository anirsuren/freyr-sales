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
 * THE CONTROL IS AN ICON IN THE TOOLBAR, NOT A ROW OF ITS OWN (Anir, same day:
 * "that's a horrible way to do it… it should just be the pin icon. That's all
 * it should be, and it should be somewhere where it doesn't take up another
 * line"). The first version put a labelled button on its own line above every
 * table, which cost a whole row on five pages to say something the icon says
 * by itself. `PinTableButton` now sits beside the tiles/rows switch, wearing
 * that control's exact chrome, because "how this list is shown" is already
 * what that corner of the toolbar means.
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

/** The control: one icon, in the toolbar, beside the view switch. */
export function PinTableButton({
  id,
  className,
  label = "header",
}: {
  id: string;
  className?: string;
  label?: string;
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
            "flex h-9 w-9 cursor-pointer items-center justify-center transition-colors",
            pinned
              ? "bg-blue-light text-blue-primary"
              : "text-text-secondary hover:bg-surface hover:text-text-primary"
          )}
        >
          <Pin
            size={15}
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
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
  wrapperClassName?: string;
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
      setFloating(
        past && stillHere
          ? { top: pageTop, left: scrollerRect.left, width: scrollerRect.width }
          : null
      );
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
    copy.style.width = `${table.offsetWidth}px`;
    copy.setAttribute("aria-hidden", "true");
    copy.appendChild(head.cloneNode(true));
    host.appendChild(copy);
    host.scrollLeft = scroller.scrollLeft;

    const sync = () => {
      host.scrollLeft = scroller.scrollLeft;
    };
    scroller.addEventListener("scroll", sync, { passive: true });
    return () => scroller.removeEventListener("scroll", sync);
  }, [floating]);

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
          <div
            ref={floatRef}
            aria-hidden="true"
            className="pointer-events-none fixed z-30 overflow-hidden border-b border-border-light bg-white shadow-[0_6px_16px_-8px_rgba(15,23,42,0.28)]"
            style={{
              top: floating.top,
              left: floating.left,
              width: floating.width,
            }}
          />,
          document.body
        )}
    </div>
  );
}
