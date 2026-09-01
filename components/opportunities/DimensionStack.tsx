"use client";

import { useEffect, useRef, useState } from "react";
import { GripVertical, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SummaryDimension } from "./OpportunitySummary";

/**
 * THE VIEW STACK — the order the summary is built from, shuffled by hand.
 *
 * Suren, Aug 30: "I can bring the revenue status first, then the customer
 * group here, then the customer here. I can do whatever arrangement of these
 * four." Anir, when it briefly became four dropdowns: "why would it be this,
 * bro? Bring back the shuffle." Correct — a row of selects is a form. Moving
 * things into an order should be moving them.
 *
 * WHY THIS ONE HOLDS TOGETHER WHERE THE EARLIER TRIES DID NOT.
 *
 * The first tries reordered the list DURING the drag, on every crossing. That
 * meant the thing being measured kept moving: rects were read while transforms
 * were applied, React state lagged a frame behind the pointer, and a re-render
 * landing mid-gesture stranded a transform — two chips drawn on top of each
 * other ("this is too buggy").
 *
 * Nothing moves in the DOM here until the drag ENDS. At pointerdown every slot
 * is measured once; for the rest of the gesture those numbers are constants.
 * The held chip is offset by the raw pointer delta, and the chips it has
 * passed slide over by exactly its width — both are pure functions of that
 * delta, so there is no feedback loop to drift, nothing to re-measure, and no
 * ordering to half-apply. The array is rewritten once, on release.
 *
 * Keyboard: each chip is focusable and ←/→ move it, so the order is reachable
 * without a pointer.
 */

type Slot = { left: number; width: number };

type Drag = {
  dim: SummaryDimension;
  from: number;
  startX: number;
  dx: number;
  /** Where it would land if you let go right now. Kept on the drag rather
      than recomputed per render so the hit test can be sticky (see targetOf)
      and so the strip, the numbers and the drop can never disagree. */
  to: number;
  slots: Slot[];
  gap: number;
};

/**
 * How far past a midpoint the chip has to be before the swap commits, and
 * how far back before it lets go again. A hand is never perfectly still; a
 * few pixels of stickiness is the difference between "it moved" and a chip
 * buzzing across the boundary.
 */
const STICK = 5;

export function DimensionStack({
  order,
  onReorder,
  label,
  color,
}: {
  order: SummaryDimension[];
  onReorder: (next: SummaryDimension[]) => void;
  label: Record<SummaryDimension, string>;
  color: Record<SummaryDimension, string>;
}) {
  /* Anything not currently stacked can be put back. Suren, Aug 30: "you can
     remove one of the four groupings, or all groupings — then it will be just
     a list." So the stack is a SELECTION, not a fixed four, and an empty one
     is a legitimate state that means "no grouping at all". */
  const all = Object.keys(label) as SummaryDimension[];
  const spare = all.filter((d) => !order.includes(d));
  const nodes = useRef(new Map<SummaryDimension, HTMLElement>());
  const [drag, setDrag] = useState<Drag | null>(null);
  /** One frame after a drop, with every transition off — see `end`. */
  const [settling, setSettling] = useState(false);

  const centre = (s: Slot) => s.left + s.width / 2;

  /**
   * Where the held chip would land, from the pointer delta alone.
   *
   * NUDGE IT AND IT GOES (Suren, Sep 1: "the shuffle is kinda weird, it should
   * know I'm doing it, I shouldn't have to move my cursor exactly where the
   * gap is for it to move, it's too strict").
   *
   * It was strict because it measured CENTRE against CENTRE: the held chip's
   * middle had to reach the neighbour's middle, which on labels this long is
   * most of two hundred pixels of dragging before anything acknowledged you.
   * All that travel bought no precision either, because the neighbour has
   * already visibly slid aside by then.
   *
   * The forgiving rule, and the one every sortable list uses, is to ask
   * whether the held chip has COVERED the neighbour's midpoint: its leading
   * edge against that neighbour's centre. Half the chip over the halfway mark
   * is unambiguously a swap, and it costs roughly half the travel.
   *
   * Still a pure function of the pointer delta and still measured against the
   * slots taken once at pointerdown, so the contract above holds. The only
   * history it carries is `d.to`, and only to bias each boundary AWAY from
   * wherever the chip already sits: entering a new position asks for STICK px
   * past the midpoint, holding the one you have forgives STICK px back. A
   * hand resting on a boundary stays put instead of buzzing across it.
   *
   * Both walks always start from home, so pulling back the way you came
   * retreats through the same boundaries that let you in. The early return
   * matters: unlike the old test, which asked one point about both
   * directions, these two ask about opposite EDGES, a whole chip width apart.
   * Left of home and right of home are separate questions and only one of
   * them can be yes, so the second walk must not get to answer the first.
   */
  function targetOf(d: Drag): number {
    const left = d.slots[d.from].left + d.dx;
    const right = left + d.slots[d.from].width;
    /* Right of home: how many neighbours has the leading edge covered? */
    let to = d.from;
    while (
      to < d.slots.length - 1 &&
      right > centre(d.slots[to + 1]) + (to + 1 > d.to ? STICK : -STICK)
    )
      to += 1;
    if (to !== d.from) return to;
    /* Left of home: the same question asked of the trailing edge. */
    while (
      to > 0 &&
      left < centre(d.slots[to - 1]) - (to - 1 < d.to ? STICK : -STICK)
    )
      to -= 1;
    return to;
  }

  /** How far chip `j` slides to make room. Exactly the held chip's width. */
  function shiftOf(d: Drag, j: number): number {
    if (j === d.from) return 0;
    const to = d.to;
    const room = d.slots[d.from].width + d.gap;
    if (to > d.from && j > d.from && j <= to) return -room;
    if (to < d.from && j < d.from && j >= to) return room;
    return 0;
  }

  function start(e: React.PointerEvent, dim: SummaryDimension, from: number) {
    if (e.button !== 0) return;
    /* Measure every slot ONCE. These are the constants the whole gesture is
       computed against; nothing re-reads the DOM after this point. */
    const slots: Slot[] = [];
    for (const d of order) {
      const el = nodes.current.get(d);
      if (!el) return;
      const r = el.getBoundingClientRect();
      slots.push({ left: r.left, width: r.width });
    }
    const gap =
      slots.length > 1 ? slots[1].left - (slots[0].left + slots[0].width) : 6;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setDrag({ dim, from, startX: e.clientX, dx: 0, to: from, slots, gap });
  }

  function move(e: React.PointerEvent) {
    setDrag((d) => {
      if (!d) return d;
      /* dx and the target it implies are written together, so no render ever
         sees a delta and a landing place that disagree. Recomputing from the
         PREVIOUS `to` is what makes the boundary sticky; it is still pure, so
         React calling this updater twice lands on the same answer. */
      const moved = { ...d, dx: e.clientX - d.startX };
      return { ...moved, to: targetOf(moved) };
    });
  }

  /**
   * LET GO AND IT IS THERE (Anir, Aug 30: "when I let go, it glitches out —
   * it should just drop where I am").
   *
   * The glitch was two movements at once. Every chip that had slid aside was
   * wearing a transform with a 180ms transition, so at the moment of release
   * they all animated BACK to zero — while the array reordered underneath and
   * put them in those same places for real. The eye saw the strip shuffle
   * twice, once forwards and once back.
   *
   * By the time you release, the chips are ALREADY sitting where the new
   * order puts them. So the commit should be invisible: transitions off for
   * the frame the order changes, transforms drop to zero against a layout
   * that has just moved to match, and nothing appears to happen at all.
   *
   * The held chip is the one exception — it is under the cursor, which is not
   * exactly its slot — so it gets a short glide from wherever it was let go
   * into place. That is a settle, not a jump.
   */
  function end() {
    /* Read, then act, then clear — never inside the state updater. React may
       call an updater more than once, and a reorder fired from in there lands
       twice and leaves the held chip wearing its drag transform after the
       drop (measured on screen, Aug 30). */
    const d = drag;
    if (!d) return;
    const to = d.to;
    setDrag(null);
    if (to === d.from) return;

    /* Where it sits right now, and where the new order will put it. */
    const wasLeft = d.slots[d.from].left + d.dx;
    const willBeLeft =
      to > d.from
        ? d.slots[to].left + d.slots[to].width - d.slots[d.from].width
        : d.slots[to].left;
    const delta = wasLeft - willBeLeft;

    setSettling(true);
    const next = [...order];
    next.splice(d.from, 1);
    next.splice(to, 0, d.dim);
    onReorder(next);

    requestAnimationFrame(() => {
      /* A keyframe, never an inline style: an animation cannot be stranded by
         a re-render landing on top of it. */
      const el = nodes.current.get(d.dim);
      if (el && Math.abs(delta) > 1) {
        el.animate(
          [
            { transform: `translateX(${delta}px) scale(1.05)` },
            { transform: "translateX(0px) scale(1)" },
          ],
          { duration: 170, easing: "cubic-bezier(0.2, 0, 0, 1)" }
        );
      }
      requestAnimationFrame(() => setSettling(false));
    });
  }

  /**
   * THE RELEASE ALWAYS ARRIVES.
   *
   * A pointerup that lands outside the window — let go past the edge of the
   * browser, or the OS steals the pointer — never reaches the chip's own
   * handler, and the strip would stay frozen mid-drag with one chip held. The
   * window hears it wherever it happens.
   */
  useEffect(() => {
    if (!drag) return;
    const done = () => end();
    window.addEventListener("pointerup", done);
    window.addEventListener("pointercancel", done);
    window.addEventListener("blur", done);
    return () => {
      window.removeEventListener("pointerup", done);
      window.removeEventListener("pointercancel", done);
      window.removeEventListener("blur", done);
    };
  });

  function nudge(dim: SummaryDimension, by: -1 | 1) {
    const i = order.indexOf(dim);
    const to = i + by;
    if (to < 0 || to >= order.length) return;
    const next = [...order];
    next.splice(i, 1);
    next.splice(to, 0, dim);
    onReorder(next);
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
        View
      </span>
      {order.map((dim, i) => {
        const held = drag?.dim === dim;
        const shift = drag ? shiftOf(drag, i) : 0;
        /* The number a chip WOULD carry if you let go now, so the strip reads
           as the order it is about to become rather than the one it was. */
        const shown = drag
          ? held
            ? drag.to + 1
            : i + 1 + (shift < 0 ? -1 : shift > 0 ? 1 : 0)
          : i + 1;
        return (
          <span
            key={dim}
            ref={(el) => {
              if (el) nodes.current.set(dim, el);
              else nodes.current.delete(dim);
            }}
            role="button"
            tabIndex={0}
            aria-label={`${label[dim]}, position ${i + 1} of ${order.length}. Drag it, or use the left and right arrow keys, to move it.`}
            onPointerDown={(e) => start(e, dim, i)}
            onPointerMove={(e) => held && move(e)}
            /* Pointer capture keeps the moves coming to this element even
               when the cursor runs past it, which it always does. */
            onPointerUp={end}
            onPointerCancel={end}
            onLostPointerCapture={end}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") {
                e.preventDefault();
                nudge(dim, -1);
              } else if (e.key === "ArrowRight") {
                e.preventDefault();
                nudge(dim, 1);
              }
            }}
            style={{
              borderColor: held ? color[dim] : `${color[dim]}55`,
              backgroundColor: held ? `${color[dim]}22` : `${color[dim]}0F`,
              color: color[dim],
              /* Always set, so React owns it and a transform can never be
                 left behind by a re-render landing mid-gesture. */
              transform: held
                ? `translateX(${drag!.dx}px) scale(1.05)`
                : `translateX(${shift}px)`,
              /* The held chip tracks the finger with no easing; the ones
                 getting out of its way glide. */
              transition:
                held || settling
                  ? "none"
                  : "transform 180ms cubic-bezier(0.2, 0, 0, 1)",
              zIndex: held ? 2 : 1,
              boxShadow: held ? `0 10px 22px ${color[dim]}45` : undefined,
              touchAction: "none",
            }}
            className={cn(
              "relative flex select-none items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold outline-none",
              "focus-visible:ring-2 focus-visible:ring-blue-primary/40",
              held ? "cursor-grabbing" : "cursor-grab"
            )}
          >
            <GripVertical size={12} strokeWidth={2.4} aria-hidden="true" />
            <span className="tnum text-[10px] opacity-60">{shown}</span>
            {label[dim]}
            {/* Take this level out of the breakdown. The pointer handlers on
                the chip would otherwise read the press as the start of a drag,
                so this one stops the event before it gets there. */}
            <button
              type="button"
              aria-label={`Remove ${label[dim]} from the breakdown`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onReorder(order.filter((d) => d !== dim));
              }}
              className="-mr-1 ml-0.5 flex h-4 w-4 cursor-pointer items-center justify-center rounded-full opacity-50 transition-opacity hover:bg-black/5 hover:opacity-100"
            >
              <X size={11} strokeWidth={2.8} aria-hidden="true" />
            </button>
          </span>
        );
      })}
      {spare.map((dim) => (
        <button
          key={dim}
          type="button"
          onClick={() => onReorder([...order, dim])}
          style={{ color: color[dim], borderColor: `${color[dim]}44` }}
          className="flex cursor-pointer items-center gap-1 rounded-full border border-dashed px-2.5 py-1 text-[12px] font-semibold opacity-70 transition-opacity hover:opacity-100"
        >
          <Plus size={11} strokeWidth={2.8} aria-hidden="true" />
          {label[dim]}
        </button>
      ))}
      <span className="ml-2 text-[11px] text-text-tertiary">
        {drag
          ? "let go to place it"
          : order.length === 0
            ? "no grouping — every deal on its own line"
            : "drag to rearrange"}
      </span>
    </div>
  );
}
