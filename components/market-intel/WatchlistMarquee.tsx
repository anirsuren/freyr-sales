"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Search } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { CompanyLogo } from "@/components/ui/CompanyLogo";

/**
 * THE WATCHLIST AS A TICKER (Anir, Aug 11: "a search bar and then a rotating
 * horizontal thing that goes continuously. If I search it, I can do that, but
 * I can also scroll left and right"). The strip drifts on its own, pauses the
 * moment the cursor lands on it, and answers the trackpad directly; typing in
 * the search swaps the ticker for matches across everything tracked and
 * watched. Rendering the chip list twice makes the loop seamless: when the
 * first copy has fully scrolled past, the offset wraps by exactly one copy's
 * width and nobody can tell.
 */

const DRIFT_PX_PER_SEC = 26;
const RESUME_AFTER_MS = 1400;

export function WatchlistMarquee({
  watchlist,
  tracked,
}: {
  watchlist: string[];
  /** Everything with a briefing page, for search and for upgraded chips. */
  tracked: { id: string; name: string }[];
}) {
  const [query, setQuery] = useState("");
  const outerRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const offsetRef = useRef(0);
  const halfRef = useRef(0);
  const pausedRef = useRef(false);
  const holdUntilRef = useRef(0);
  const dragRef = useRef<{ x: number; active: boolean } | null>(null);
  const searching = query.trim().length > 0;
  const searchingRef = useRef(searching);
  searchingRef.current = searching;

  const trackedByName = new Map(
    tracked.map((t) => [t.name.toLowerCase(), t.id])
  );

  // One drift loop for the component's lifetime; everything that should stop
  // it (hover, drag, wheel, search, hidden tab, reduced motion) sets a ref so
  // the loop itself never re-arms.
  useEffect(() => {
    const reduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    )?.matches;
    let raf = 0;
    let last = performance.now();
    const measure = () => {
      halfRef.current = (innerRef.current?.scrollWidth ?? 0) / 2;
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (innerRef.current) observer.observe(innerRef.current);

    const tick = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      const half = halfRef.current;
      const idle =
        !pausedRef.current &&
        !searchingRef.current &&
        !document.hidden &&
        now >= holdUntilRef.current &&
        !reduced &&
        half > 0;
      if (idle) {
        offsetRef.current = (offsetRef.current + (DRIFT_PX_PER_SEC * dt) / 1000 + half) % half;
        if (innerRef.current) {
          innerRef.current.style.transform = `translateX(${-offsetRef.current}px)`;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  // Horizontal wheel/trackpad moves the strip instead of the page going back.
  useEffect(() => {
    const outer = outerRef.current;
    if (!outer) return;
    const onWheel = (event: WheelEvent) => {
      if (searchingRef.current) return;
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
      event.preventDefault();
      const half = halfRef.current;
      if (half <= 0) return;
      offsetRef.current = (offsetRef.current + event.deltaX + half) % half;
      if (innerRef.current) {
        innerRef.current.style.transform = `translateX(${-offsetRef.current}px)`;
      }
      holdUntilRef.current = performance.now() + RESUME_AFTER_MS;
    };
    outer.addEventListener("wheel", onWheel, { passive: false });
    return () => outer.removeEventListener("wheel", onWheel);
  }, []);

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (searching) return;
    dragRef.current = { x: event.clientX, active: false };
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.x;
    if (!drag.active) {
      if (Math.abs(dx) < 4) return;
      drag.active = true;
      outerRef.current?.setPointerCapture(event.pointerId);
    }
    drag.x = event.clientX;
    const half = halfRef.current;
    if (half <= 0) return;
    offsetRef.current = (offsetRef.current - dx + half) % half;
    if (innerRef.current) {
      innerRef.current.style.transform = `translateX(${-offsetRef.current}px)`;
    }
    holdUntilRef.current = performance.now() + RESUME_AFTER_MS;
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.active) {
      outerRef.current?.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
  }

  const chip = (name: string, key: string) => {
    const trackedId = trackedByName.get(name.toLowerCase());
    const body = (
      <>
        <CompanyLogo name={name} className="h-[18px] w-[18px] shrink-0" />
        {name}
        {trackedId && (
          <ArrowUpRight
            size={12}
            strokeWidth={2.4}
            className="text-blue-primary"
          />
        )}
      </>
    );
    if (trackedId) {
      return (
        <Link
          key={key}
          href={`/market-intel/${trackedId}`}
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-blue-subtle bg-white py-1 pl-1.5 pr-2.5 text-[12px] font-semibold text-blue-primary transition-colors hover:bg-blue-light"
          draggable={false}
        >
          {body}
        </Link>
      );
    }
    return (
      <span
        key={key}
        className="flex shrink-0 items-center gap-1.5 rounded-full border border-border-light bg-white py-1 pl-1.5 pr-2.5 text-[12px] font-medium text-text-secondary"
      >
        {body}
      </span>
    );
  };

  const q = query.trim().toLowerCase();
  const trackedMatches = tracked.filter((t) =>
    t.name.toLowerCase().includes(q)
  );
  const watchlistMatches = watchlist.filter(
    (name) =>
      name.toLowerCase().includes(q) && !trackedByName.get(name.toLowerCase())
  );

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[14px] font-semibold text-text-primary">
            Also tracking{" "}
            <span className="tnum font-normal text-text-tertiary">
              ({watchlist.length})
            </span>
          </h2>
          <p className="mt-0.5 text-[12px] text-text-secondary">
            Watched for signals. Scroll the strip, or search everything you
            follow.
          </p>
        </div>
        <div className="relative">
          <Search
            size={14}
            strokeWidth={2.2}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search companies"
            className="h-9 w-56 rounded-full border border-border-light bg-white pl-9 pr-3 text-[13px] text-text-primary outline-none transition-all focus:w-64 focus:border-blue-primary"
            aria-label="Search tracked and watched companies"
          />
        </div>
      </div>

      {searching ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {trackedMatches.map((t) => chip(t.name, `t-${t.id}`))}
          {watchlistMatches.map((name) => chip(name, `w-${name}`))}
          {trackedMatches.length === 0 && watchlistMatches.length === 0 && (
            <p className="text-[12.5px] text-text-secondary">
              Nothing tracked or watched by that name yet. Add it with Track a
              company, top right.
            </p>
          )}
        </div>
      ) : (
        <div
          ref={outerRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onMouseEnter={() => {
            pausedRef.current = true;
          }}
          onMouseLeave={() => {
            pausedRef.current = false;
          }}
          className="mt-3 cursor-grab overflow-hidden active:cursor-grabbing"
          style={{
            overscrollBehaviorX: "none",
            touchAction: "pan-y",
            maskImage:
              "linear-gradient(to right, transparent, black 32px, black calc(100% - 32px), transparent)",
            WebkitMaskImage:
              "linear-gradient(to right, transparent, black 32px, black calc(100% - 32px), transparent)",
          }}
        >
          <div ref={innerRef} className="flex w-max gap-2 will-change-transform">
            {watchlist.map((name) => chip(name, `a-${name}`))}
            {watchlist.map((name) => chip(name, `b-${name}`))}
          </div>
        </div>
      )}
    </Card>
  );
}
