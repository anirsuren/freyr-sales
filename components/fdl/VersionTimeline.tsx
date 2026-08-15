"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Maximize2 } from "lucide-react";
import { CustomerDots } from "@/components/fdl/CustomerDots";
import { HoverCard } from "@/components/ui/HoverCard";
import { Tooltip } from "@/components/ui/Tooltip";
import { withV } from "@/lib/version";
import type { FdlRelease } from "@/lib/offerings";

/**
 * THE VERSIONS AS A TIMELINE (Anir, Aug 10: "I'm envisioning it's horizontal.
 * I can see all the versions... I can scroll left and right to see the past,
 * the future. Very, very premium.").
 *
 * The list answers "what versions exist". This answers "when" — how long a
 * version held, how far out the next one sits, whether the gap between
 * releases is closing.
 *
 * GESTURES, after his second pass ("I can't scroll left and right easily with
 * my trackpad. It's kind of annoying, and we don't need these buttons"):
 *
 *   swipe sideways / drag  → pan through time
 *   pinch (Ctrl+scroll)    → zoom around the cursor
 *   plain vertical scroll  → falls through to the page
 *
 * The first cut treated every wheel event as zoom, which broke both trackpad
 * panning AND page scrolling — the stage swallowed vertical scrolls, so the
 * page stuck whenever the cursor crossed it. Now only horizontal intent and
 * pinch are claimed; vertical scroll is deliberately left alone. One button
 * survives: Fit, per "maybe a fit every version button, but that's it."
 *
 * HONESTY RULES the drawing follows:
 * - The dot is the fact (a release has a date). The bar is the inference (it
 *   reigned until the next one shipped) — drawn softer than the dot.
 * - A version superseded only by an EXPECTED version has not ended. Its solid
 *   bar runs to today; the stretch to the planned date is hatched, so a future
 *   never reads as something that already happened.
 * - Versions with no date are named under the stage rather than dropped, so
 *   the timeline cannot quietly claim fewer versions exist.
 */

const DAY = 86_400_000;
/** Zoom floor and ceiling in pixels per day: ~6 years across, down to ~3 days. */
const MIN_PX_PER_DAY = 0.35;
const MAX_PX_PER_DAY = 40;

/* Vertical geometry, one place. The dot centre and the track centre are the
 * same number by construction — the first cut stacked a flex column and hoped
 * its heights added up to the rail, and they were 2px off. */
const STAGE_H = 212;
const TRACK_TOP = 123; // 10px tall → centre 128
const DOT_TOP = 121; // 14px dot → centre 128
const PILL_LANE_TOPS = [84, 52] as const;
const PILL_H = 22;
const DATE_TOP = 143;
const FACES_TOP = 160;

type TickUnit = "week" | "month" | "quarter" | "year";

function unitForScale(pxPerDay: number): TickUnit {
  if (pxPerDay >= 5) return "week";
  if (pxPerDay >= 1.1) return "month";
  if (pxPerDay >= 0.42) return "quarter";
  return "year";
}

/** Every tick boundary of `unit` that falls inside the visible window. */
function ticksFor(unit: TickUnit, fromMs: number, toMs: number): number[] {
  const out: number[] = [];
  const start = new Date(fromMs);
  const cursor = new Date(
    start.getFullYear(),
    unit === "year" ? 0 : start.getMonth(),
    1
  );
  if (unit === "quarter") cursor.setMonth(Math.floor(cursor.getMonth() / 3) * 3);
  if (unit === "week") {
    cursor.setTime(fromMs);
    cursor.setHours(0, 0, 0, 0);
    cursor.setDate(cursor.getDate() - cursor.getDay());
  }
  // A hard cap rather than a while(true): a bad scale should render a sparse
  // axis, never lock the tab up.
  for (let guard = 0; guard < 400 && cursor.getTime() <= toMs; guard += 1) {
    if (cursor.getTime() >= fromMs) out.push(cursor.getTime());
    if (unit === "week") cursor.setDate(cursor.getDate() + 7);
    else if (unit === "month") cursor.setMonth(cursor.getMonth() + 1);
    else if (unit === "quarter") cursor.setMonth(cursor.getMonth() + 3);
    else cursor.setFullYear(cursor.getFullYear() + 1);
  }
  return out;
}

function tickLabel(unit: TickUnit, ms: number): string {
  const d = new Date(ms);
  if (unit === "year") return String(d.getFullYear());
  if (unit === "quarter")
    return `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`;
  if (unit === "month")
    return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export type TimelineRelease = FdlRelease & {
  /** Faces to sit under the marker — the accounts running this version. */
  customers?: { id: string; name: string }[];
  featureCount?: number;
};

/** Semantic version colours: released green, current blue, expected purple. */
function toneOf(release: TimelineRelease) {
  if (release.current)
    return { dot: "#0071E3", bar: "rgba(0,113,227,0.22)", label: "Current" };
  if (release.status === "next")
    return { dot: "#6D28D9", bar: "rgba(124,58,237,0.20)", label: "Expected" };
  return { dot: "#1A7A35", bar: "rgba(26,122,53,0.20)", label: "Released" };
}

/** Rough pill width so the lane logic can spot collisions before they paint.
 *  It has to count the status word too, now that each pill carries its own
 *  (Anir, Aug 12: "you don't need the three tags… just say 'expected' or
 *  'current' right on top of the dot"). */
function pillWidth(release: TimelineRelease) {
  return withV(release.version).length * 7.5 + toneOf(release).label.length * 5.4 + 34;
}

export function VersionTimeline({
  releases,
  onOpen,
  selectedIds = [],
}: {
  releases: TimelineRelease[];
  /** Clicking a marker opens the versions popup with this one unfolded. */
  onOpen?: (releaseId: string) => void;
  /** Versions whose panel is open — their pills wear a ring. */
  selectedIds?: string[];
}) {
  const shellRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [pxPerDay, setPxPerDay] = useState(0.9);
  /** Timestamp shown at the left edge of the viewport. */
  const [originMs, setOriginMs] = useState<number>(() => Date.now() - 200 * DAY);
  const [hovered, setHovered] = useState<string | null>(null);
  /** False until the first fit() has framed the data — the stage fades in
   *  framed instead of flashing at a wrong origin for one frame. */
  const [ready, setReady] = useState(false);
  const gesture = useRef<{
    x: number;
    origin: number;
    id: number;
    dragging: boolean;
  } | null>(null);
  /** When we last claimed a horizontal wheel event. A trackpad gesture is a
   *  stream; once it is ours, every event in the stream stays ours. */
  const wheelStreak = useRef(0);

  const dated = useMemo(
    () =>
      releases
        .filter((r) => !!r.date)
        .map((r) => ({ ...r, ms: new Date(`${r.date}T00:00:00`).getTime() }))
        .filter((r) => Number.isFinite(r.ms))
        .sort((a, b) => a.ms - b.ms),
    [releases]
  );
  const undated = releases.filter((r) => !r.date);

  /** Frame the whole history with a margin; also the Fit button. */
  const fit = useCallback(() => {
    const box = shellRef.current?.clientWidth ?? 0;
    if (!box) return;
    /**
     * NO DATES IS STILL A TIMELINE (Anir, Aug 13: "you can still show me the
     * timeline… Who cares if it's just one point? Show me the full fucking
     * timeline"). Frame the months either side of today so the axis, the month
     * ticks and the today marker all draw, and the undated versions sit
     * underneath waiting for a date. Hiding the whole thing taught nobody what
     * the timeline was for.
     */
    if (dated.length === 0) {
      const today = Date.now();
      const half = 150 * DAY;
      setPxPerDay(
        Math.min(MAX_PX_PER_DAY, Math.max(MIN_PX_PER_DAY, box / ((half * 2) / DAY)))
      );
      setOriginMs(today - half);
      return;
    }
    const first = dated[0].ms;
    const last = dated[dated.length - 1].ms;
    const span = Math.max(last - first, 60 * DAY);
    const pad = span * 0.14;
    const next = Math.min(
      MAX_PX_PER_DAY,
      Math.max(MIN_PX_PER_DAY, box / ((span + pad * 2) / DAY))
    );
    setPxPerDay(next);
    setOriginMs(first - pad);
  }, [dated]);

  useEffect(() => {
    const node = shellRef.current;
    if (!node) return;
    const measure = () => setWidth(node.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    window.addEventListener("resize", measure);
    // Belt and braces: an embedded or background window can go through a
    // 0-width doze and wake WITHOUT emitting resize or ResizeObserver events
    // (verified against the in-app browser pane). A slow poll catches that;
    // setWidth with an unchanged value is a no-op, so the quiet case is free.
    const poll = window.setInterval(measure, 500);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      window.clearInterval(poll);
    };
  }, []);

  // Frame the data as soon as we know how wide we are, then reveal. The
  // width floor matters: during hydration the card can measure a transient
  // sliver, and framing against that would lock in a garbage zoom.
  useEffect(() => {
    if (ready || width < 80) return;
    fit();
    setReady(true);
  }, [ready, width, fit]);

  const msPerPx = DAY / pxPerDay;
  const xOf = useCallback(
    (ms: number) => (ms - originMs) / msPerPx,
    [originMs, msPerPx]
  );
  const endMs = originMs + width * msPerPx;

  /* Wheel: claim horizontal swipes (pan) and pinch (zoom), let vertical scroll
   * fall through to the page. Non-passive, because claiming means
   * preventDefault — which is also what stops a leftward swipe from
   * triggering the browser's back-navigation gesture. */
  useEffect(() => {
    const node = shellRef.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        // Pinch on a trackpad arrives as Ctrl+wheel; so does an actual
        // Ctrl+scroll from a mouse. Zoom around the cursor: the date under
        // the pointer stays under the pointer.
        event.preventDefault();
        const rect = node.getBoundingClientRect();
        const cursorX = event.clientX - rect.left;
        const anchorMs = originMs + cursorX * msPerPx;
        const factor = Math.exp(-event.deltaY * 0.01);
        const nextScale = Math.min(
          MAX_PX_PER_DAY,
          Math.max(MIN_PX_PER_DAY, pxPerDay * factor)
        );
        setPxPerDay(nextScale);
        setOriginMs(anchorMs - cursorX * (DAY / nextScale));
      } else {
        /* THE BACK-SWIPE HOLE (Anir, Aug 10: "it's kind of hard to go left
           because it keeps taking me back to the previous page"). Chrome arms
           its history-swipe on the FIRST wheel event of a gesture — if that
           event starts diagonal (deltaX 3, deltaY 4) a strict |dx| > |dy|
           test lets it through, and from then on the whole gesture belongs to
           the browser. So the test is biased: anything meaningfully
           horizontal is ours, and once a gesture is claimed, every event in
           its stream is claimed too, momentum tail included. Only a clearly
           vertical scroll falls through to the page. */
        const dx = Math.abs(event.deltaX);
        const dy = Math.abs(event.deltaY);
        const now = performance.now();
        const inStreak = now - wheelStreak.current < 250;
        const horizontal = dx > 0 && (dx > dy * 0.5 || inStreak);
        if (horizontal) {
          event.preventDefault();
          wheelStreak.current = now;
          setOriginMs((o) => o + event.deltaX * msPerPx);
        }
        // Clearly vertical without pinch: the page's scroll, not ours.
      }
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [originMs, msPerPx, pxPerDay]);

  /* Drag-to-pan with a 4px threshold, so a click on a marker stays a click.
   * Pointer capture starts only once the threshold is passed — capturing on
   * pointerdown was stealing the click from the marker buttons. */
  function onPointerDown(event: React.PointerEvent) {
    if (event.button !== 0) return;
    gesture.current = {
      x: event.clientX,
      origin: originMs,
      id: event.pointerId,
      dragging: false,
    };
  }
  function onPointerMove(event: React.PointerEvent) {
    const g = gesture.current;
    if (!g) return;
    const dx = event.clientX - g.x;
    if (!g.dragging && Math.abs(dx) > 4) {
      g.dragging = true;
      try {
        shellRef.current?.setPointerCapture(g.id);
      } catch {
        /* pointer already gone — the pan still works, uncaptured */
      }
    }
    if (g.dragging) setOriginMs(g.origin - dx * msPerPx);
  }
  function endDrag() {
    const g = gesture.current;
    if (g?.dragging) {
      try {
        shellRef.current?.releasePointerCapture(g.id);
      } catch {
        /* already released */
      }
    }
    gesture.current = null;
  }

  const today = Date.now();
  const unit = unitForScale(pxPerDay);
  const ticks = width > 0 ? ticksFor(unit, originMs, endMs) : [];

  /* Lane assignment: when two pills would overlap, the second steps up a
   * lane, metro-map style, with a stem down to its dot. Recomputed per render
   * — it depends on the zoom — and cheap at these counts. */
  const lanes: number[] = [];
  {
    const laneEnds = [-Infinity, -Infinity];
    for (const release of dated) {
      const x = xOf(release.ms);
      const w = pillWidth(release);
      const lane = x - w / 2 > laneEnds[0] + 8 ? 0 : 1;
      laneEnds[lane] = x + w / 2;
      lanes.push(lane);
    }
  }

  /**
   * A VERSION WITH NO DATE STILL EXISTS (Anir, Aug 13: "if I add a version,
   * the timeline should still show up… I didn't even know that I had. I didn't
   * think it worked").
   *
   * The old empty state was technically true and practically a lie: he added a
   * version, switched to Timeline, and the card said there was nothing to
   * show — so the add looked like it had failed. A missing date is a missing
   * date, not a missing version. Undated versions now appear as real pills,
   * with the one thing they need spelled out.
   */
  const undatedStrip = undated.length > 0 && (
    /* DOCKED TO THE TIMELINE, not floated under it (Anir, Aug 15: "If I have
       a version, just show it to me"). A version with no date has no honest
       position on a date axis — putting a dot at today would say it shipped
       today — so it sits in its own lane attached to the chart, where it is
       visibly part of the timeline and claims nothing about when. */
    <div className="-mt-px rounded-b-xl border border-t-0 border-border-light bg-surface/60 px-4 py-3">
      <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.06em] text-text-tertiary">
        {undated.length === 1 ? "No date yet" : `No date yet (${undated.length})`}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {undated.map((release) => {
          const tone = toneOf(release);
          return (
            <button
              key={release.id}
              type="button"
              onClick={() => onOpen?.(release.id)}
              title={`Open ${withV(release.version)}`}
              className="cursor-pointer whitespace-nowrap rounded-full px-2.5 py-[3px] text-[12px] font-bold tnum text-white transition-transform hover:scale-[1.04] active:scale-95"
              style={{ background: tone.dot, boxShadow: "0 1px 2px rgba(16,24,40,0.10)" }}
            >
              {withV(release.version)}
              <span className="ml-1.5 text-[9.5px] font-bold uppercase tracking-[0.05em] text-white/75">
                {tone.label}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2.5 text-[11.5px] text-text-tertiary">
        Click {undated.length === 1 ? "it" : "them"} to set a date, and{" "}
        {undated.length === 1 ? "it moves" : "they move"} up onto the dates
        above.
      </p>
    </div>
  );

  return (
    <div className="mt-3.5">
      {/* NO LEGEND (Anir, Aug 12: "you don't need the three tags… save some
          space"). Each pill says its own status, so a colour key you had to
          look up and translate is three chips of pure overhead. */}
      <div className="mb-2 flex flex-wrap items-center justify-end gap-3">
        <div className="flex items-center gap-2.5">
          <p className="hidden text-[11.5px] text-text-tertiary sm:block">
            Swipe or drag to pan · pinch to zoom
          </p>
          <Tooltip label="Fit every version">
            <button
              type="button"
              aria-label="Fit every version"
              onClick={fit}
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border border-border-light bg-white text-text-secondary transition-colors hover:border-blue-subtle hover:text-blue-primary"
            >
              <Maximize2 size={13} strokeWidth={2.2} />
            </button>
          </Tooltip>
        </div>
      </div>

      <div
        ref={shellRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="relative cursor-grab select-none overflow-hidden rounded-xl border border-border-light bg-white active:cursor-grabbing"
        // pan-y: a touch that moves vertically scrolls the page; horizontal
        // touches are ours. Mirrors the wheel split exactly.
        style={{
          height: STAGE_H,
          touchAction: "pan-y",
          // Even an unclaimed horizontal remnant must not chain into the
          // browser's navigate-back overscroll.
          overscrollBehaviorX: "none",
        }}
      >
        <div
          className="absolute inset-0 transition-opacity duration-300"
          style={{ opacity: ready ? 1 : 0 }}
        >
          {/* Axis: gridlines behind everything, labels pinned to the bottom. */}
          {ticks.map((ms) => {
            const x = xOf(ms);
            return (
              <div
                key={ms}
                className="pointer-events-none absolute inset-y-0"
                style={{ left: x }}
              >
                <div className="h-full w-px bg-border-light" />
                <span className="absolute bottom-1.5 left-1.5 whitespace-nowrap text-[10px] font-medium text-text-tertiary">
                  {tickLabel(unit, ms)}
                </span>
              </div>
            );
          })}

          {/* THE TRACK. Bars floating in white read as accidents; a track
              makes them read as a measurement. It spans the whole viewport
              because time continues past both edges. */}
          <div
            className="pointer-events-none absolute inset-x-0 h-[10px] rounded-full opacity-60"
            style={{ top: TRACK_TOP, background: "var(--border-light)" }}
          />

          {/* TODAY. The one line on here that is not a guess. */}
          {today >= originMs && today <= endMs && (
            <div
              className="pointer-events-none absolute inset-y-0 z-20"
              style={{ left: xOf(today) }}
            >
              <div
                className="h-full w-px bg-blue-primary/70"
                style={{ boxShadow: "0 0 8px rgba(0,113,227,0.35)" }}
              />
              <span className="absolute top-2 -translate-x-1/2 whitespace-nowrap rounded-full bg-blue-primary px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.04em] text-white">
                Today
              </span>
            </div>
          )}

          {dated.map((release, index) => {
            const tone = toneOf(release);
            const x = xOf(release.ms);
            const next = dated[index + 1];
            /* WHERE THE BAR HONESTLY ENDS. A version that has not shipped has
               no reign. A version superseded by a SHIPPED version ends the day
               that one landed. A live version whose only successor is still
               expected has not ended — solid to today, hatched to the plan. */
            const supersededByShipped = next && next.status !== "next";
            const solidEnd =
              release.status === "next"
                ? release.ms
                : supersededByShipped
                  ? next.ms
                  : Math.max(today, release.ms);
            const ghostEnd = !supersededByShipped && next ? next.ms : null;
            const barWidth = Math.max(0, xOf(solidEnd) - x);
            const ghostWidth =
              ghostEnd === null ? 0 : Math.max(0, xOf(ghostEnd) - xOf(solidEnd));
            const days = Math.round((solidEnd - release.ms) / DAY);
            const heldFor =
              days >= 60
                ? `${Math.round(days / 30)} months`
                : days >= 14
                  ? `${Math.round(days / 7)} weeks`
                  : `${days} days`;
            const lane = lanes[index];
            const pillTop = PILL_LANE_TOPS[lane];
            const stemTop = pillTop + PILL_H;
            /* Below-rail text hides before it collides: the axis still gives
               the temporal context, and the click-through has the rest. */
            const gapL = index > 0 ? x - xOf(dated[index - 1].ms) : Infinity;
            const gapR = next ? xOf(next.ms) - x : Infinity;
            const roomy = Math.min(gapL, gapR) > 84;
            const facesMax = roomy ? 4 : 2;
            const faces = release.customers ?? [];
            const isHot = hovered === release.id;
            const isSelected = selectedIds.includes(release.id);
            return (
              <div key={release.id}>
                {ghostWidth > 1 && (
                  <div
                    className="pointer-events-none absolute z-10 h-[10px] rounded-r-full opacity-70"
                    style={{
                      left: xOf(solidEnd),
                      width: ghostWidth,
                      top: TRACK_TOP,
                      backgroundImage: `repeating-linear-gradient(45deg, ${tone.bar} 0 5px, transparent 5px 10px)`,
                    }}
                  />
                )}
                {barWidth > 1 && (
                  <div
                    className="pointer-events-none absolute z-10 h-[10px] rounded-full transition-[opacity,box-shadow] duration-200"
                    style={{
                      left: x,
                      width: barWidth,
                      top: TRACK_TOP,
                      background: `linear-gradient(90deg, ${tone.dot} 0%, ${tone.bar} 100%)`,
                      opacity: isHot ? 1 : 0.9,
                      boxShadow: isHot ? `0 0 0 3px ${tone.bar}` : "none",
                    }}
                  />
                )}
                {/* How long it held, centred in the reign it describes. */}
                {barWidth > 150 && days > 0 && (
                  <span
                    className="pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap text-[9.5px] font-bold uppercase tracking-[0.05em] text-text-tertiary"
                    style={{ left: x + barWidth / 2, top: DATE_TOP }}
                  >
                    {heldFor}
                  </span>
                )}

                {/* Stem: pill → dot, so a lane-bumped pill still owns its
                    place on the rail. */}
                <div
                  className="pointer-events-none absolute z-10 w-[2px] rounded-full"
                  style={{
                    left: x - 1,
                    top: stemTop,
                    height: DOT_TOP + 3 - stemTop,
                    background: tone.dot,
                    opacity: 0.4,
                  }}
                />
                {/* SOMETHING ON TOP WHEN YOU HOVER (Anir, Aug 10): the pill
                    carries a quarter-second summary card — version, status,
                    date, what's in it, who runs it — and says a click brings
                    the full popup. The positioned div is OUTSIDE the
                    HoverCard because its wrapper is position:relative, and an
                    absolute pill inside it would anchor to the wrong box. */}
                <div
                  className="absolute z-30 -translate-x-1/2"
                  style={{ left: x, top: pillTop }}
                >
                  <HoverCard
                    width={250}
                    anchor="trigger"
                    delayMs={0}
                    content={
                      <div>
                        <p className="flex items-center gap-2 text-[13px] font-bold text-text-primary tnum">
                          {withV(release.version)}
                          <span
                            className="rounded-full px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.04em]"
                            style={{ color: tone.dot, background: tone.bar }}
                          >
                            {tone.label}
                          </span>
                        </p>
                        <p className="mt-1 text-[12px] text-text-secondary">
                          {new Date(release.ms).toLocaleDateString("en-US", {
                            month: "long",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </p>
                        <p className="mt-0.5 text-[12px] text-text-secondary">
                          {release.featureCount ?? 0}{" "}
                          {(release.featureCount ?? 0) === 1
                            ? "feature"
                            : "features"}{" "}
                          · {faces.length}{" "}
                          {faces.length === 1 ? "customer" : "customers"}
                          {days > 0 && release.status !== "next"
                            ? ` · held ${heldFor}`
                            : ""}
                        </p>
                        <p className="mt-1.5 text-[11px] font-medium text-blue-primary">
                          Click for the full breakdown
                        </p>
                      </div>
                    }
                  >
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => onOpen?.(release.id)}
                      onMouseEnter={() => setHovered(release.id)}
                      onMouseLeave={() => setHovered(null)}
                      aria-label={`${withV(release.version)}, ${tone.label}, ${new Date(
                        release.ms
                      ).toLocaleDateString("en-US", {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}`}
                      className="cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-blue-primary focus-visible:ring-offset-2"
                    >
                      <span
                        className="block whitespace-nowrap rounded-full px-2.5 py-[3px] text-[12px] font-bold tnum text-white transition-[transform,box-shadow] duration-200"
                        style={{
                          background: tone.dot,
                          transform: isHot
                            ? "translateY(-2px) scale(1.06)"
                            : "none",
                          boxShadow: isSelected
                            ? `0 0 0 2px var(--white), 0 0 0 4px ${tone.dot}`
                            : isHot
                              ? `0 8px 20px -6px ${tone.dot}`
                              : "0 1px 2px rgba(16,24,40,0.10)",
                        }}
                      >
                        {withV(release.version)}
                        <span className="ml-1.5 text-[9.5px] font-bold uppercase tracking-[0.05em] text-white/75">
                          {tone.label}
                        </span>
                      </span>
                    </button>
                  </HoverCard>
                </div>
                <button
                  type="button"
                  aria-label={`Open ${withV(release.version)}`}
                  title={`Open ${withV(release.version)}`}
                  onClick={() => onOpen?.(release.id)}
                  onMouseEnter={() => setHovered(release.id)}
                  onMouseLeave={() => setHovered(null)}
                  className="absolute z-20 h-3.5 w-3.5 -translate-x-1/2 cursor-pointer rounded-full transition-transform duration-200 hover:scale-[1.35] active:scale-95"
                  style={{
                    left: x,
                    top: DOT_TOP,
                    background: tone.dot,
                    border: "3px solid var(--white)",
                    boxShadow: isHot
                      ? `0 0 0 3px ${tone.dot}, 0 0 0 9px ${tone.bar}`
                      : `0 0 0 2px ${tone.dot}`,
                    transform: isHot
                      ? "translateX(-50%) scale(1.15)"
                      : "translateX(-50%)",
                  }}
                />
                {roomy && (
                  <span
                    className="pointer-events-none absolute z-20 -translate-x-1/2 whitespace-nowrap text-[10.5px] font-semibold text-text-secondary"
                    style={{ left: x, top: DATE_TOP }}
                  >
                    {new Date(release.ms).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                )}
                {/* THE FAN, same mechanic as everywhere else (Anir, Aug 10:
                    "when I hover over the company, it'll do the thing"). It
                    keeps pointer events — dragging still works from on top of
                    it, because pointerdown bubbles to the stage — and its
                    cards portal out, so the stage's overflow-hidden cannot
                    clip them. */}
                {faces.length > 0 && (
                  <span
                    className="absolute z-30 -translate-x-1/2"
                    // +1, not -5: the fan's white logo-rings were painting
                    // over the descender of "Sep" in the date above (Anir,
                    // Aug 10: "the P looks like it's getting covered") —
                    // measured 4px of overlap. The date's font box ends at
                    // FACES_TOP; starting one below clears every tail.
                    style={{ left: x, top: FACES_TOP + 1 }}
                  >
                    <CustomerDots
                      people={faces}
                      max={facesMax}
                      size={22}
                      reserveOpenWidth={false}
                      note={() =>
                        release.status === "next"
                          ? `Waiting on ${withV(release.version)}`
                          : `Runs ${withV(release.version)}`
                      }
                    />
                  </span>
                )}
              </div>
            );
          })}

          {/* Edge fades: time continues past both edges, and a fade says so
              better than a hard crop. var(--white) so dark mode keeps them. */}
          <div
            className="pointer-events-none absolute inset-y-0 left-0 z-20 w-6"
            style={{
              background: "linear-gradient(90deg, var(--white), transparent)",
            }}
          />
          <div
            className="pointer-events-none absolute inset-y-0 right-0 z-20 w-6"
            style={{
              background: "linear-gradient(270deg, var(--white), transparent)",
            }}
          />
        </div>
      </div>

      {/* A version with no date cannot be placed, and silently dropping it
          would make the timeline quietly lie about how many versions exist.
          Same pills as the no-dates-at-all case, so an undated version looks
          like a version wherever you meet it — and stays clickable. */}
      {undatedStrip}
    </div>
  );
}
