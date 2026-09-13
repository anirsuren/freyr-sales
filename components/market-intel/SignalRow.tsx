"use client";

import { useEffect, useRef, useState } from "react";
import { Radar } from "lucide-react";
import { SIGNAL_META, signalsFor, type SignalGroup, type SignalId } from "@/lib/marketIntelSignals";
import { cn } from "@/lib/utils";
import { tint } from "@/lib/tint";

/**
 * THE MAIN BAR: SIGNALS (Saras, Sep 11: "the main bar at the top of these
 * modules will be 'Signals' - with a list of all signals. Then another
 * secondary one on 'Sources'"). Her titles in her order, for the tab the
 * company sits in: ten on a customer, nine on a competitor. Every signal is
 * always on the bar with its count; one with nothing in view is muted rather
 * than missing. "All signals" lets go of a pick; clicking the picked signal
 * again does too.
 *
 * ONE LINE THAT SCROLLS (Anir, Sep 11: "one scrollable horizontal line").
 * The chips never wrap. A mouse wheel over the bar moves it sideways until it
 * reaches an end, then the page scrolls as usual; a soft fade on either side
 * says there is more that way.
 */
export function SignalRow({
  group,
  counts,
  total,
  active,
  onPick,
  className,
}: {
  group: SignalGroup;
  counts: Partial<Record<SignalId, number>>;
  /** Items in view, for "All signals". */
  total: number;
  active: SignalId | null;
  onPick: (id: SignalId | null) => void;
  className?: string;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const measure = () => {
    const row = rowRef.current;
    if (!row) return;
    const max = row.scrollWidth - row.clientWidth;
    const left = row.scrollLeft > 1;
    const right = row.scrollLeft < max - 1;
    setEdges((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
  };

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      const max = row.scrollWidth - row.clientWidth;
      if (max <= 0) return;
      const next = Math.min(max, Math.max(0, row.scrollLeft + event.deltaY));
      if (next === row.scrollLeft) return;
      event.preventDefault();
      row.scrollLeft = next;
    };
    const onScroll = () => measure();
    row.addEventListener("wheel", onWheel, { passive: false });
    row.addEventListener("scroll", onScroll, { passive: true });
    const observer = new ResizeObserver(onScroll);
    observer.observe(row);
    return () => {
      row.removeEventListener("wheel", onWheel);
      row.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, []);

  /* The counts change the chips' width, so the fades are measured again. */
  useEffect(measure, [counts, total, active, group]);

  const fade = 36;
  const mask =
    edges.left && edges.right
      ? `linear-gradient(to right, transparent 0, #000 ${fade}px, #000 calc(100% - ${fade}px), transparent 100%)`
      : edges.left
        ? `linear-gradient(to right, transparent 0, #000 ${fade}px)`
        : edges.right
          ? `linear-gradient(to right, #000 calc(100% - ${fade}px), transparent 100%)`
          : undefined;

  const chip =
    "flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors";
  const all = active === null;
  return (
    <div
      role="group"
      aria-label="Signals"
      className={cn("rounded-xl border border-border-light bg-white px-3.5 py-3", className)}
    >
      <p className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.06em] text-text-tertiary">Signals</p>
      <div
        ref={rowRef}
        className="flex items-center gap-1.5 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
      >
        <button
          type="button"
          aria-pressed={all}
          onClick={() => onPick(null)}
          className={cn(
            chip,
            all
              ? "border-transparent bg-[color:var(--ink-bright-blue)] text-white"
              : "border-border-light bg-white text-text-secondary hover:border-blue-subtle hover:text-text-primary"
          )}
        >
          <Radar size={13} strokeWidth={2.2} />
          All signals
          <span className={cn("tnum", all ? "opacity-85" : "text-text-tertiary")}>{total}</span>
        </button>
        {signalsFor(group).map((id) => {
          const meta = SIGNAL_META[id];
          const Icon = meta.icon;
          const count = counts[id] ?? 0;
          const on = active === id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={on}
              onClick={() => onPick(on ? null : id)}
              className={cn(
                chip,
                on
                  ? "border-transparent text-white"
                  : "border-border-light bg-white text-text-secondary hover:border-blue-subtle hover:text-text-primary"
              )}
              style={on ? { background: meta.color } : { color: meta.color, background: tint(meta.color, 6) }}
            >
              <Icon size={13} strokeWidth={2.2} />
              {meta.label}
              <span className={cn("tnum", on ? "opacity-85" : "text-text-tertiary")}>{count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
