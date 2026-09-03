"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * THE SEGMENTED VIEW SWITCH, WITH A THUMB THAT ACTUALLY MOVES.
 *
 * Anir, Sep 3: "make sure there's always proper animations when switching
 * between these on any page."
 *
 * Ten copies of this control existed — Opportunities, Customers, Performance,
 * Admin, Solutioning, Meetings, Offerings, the accrual planner — all the same
 * markup pasted around, and every one of them switched by CROSS-FADING two
 * backgrounds: the white pill vanished from one segment and appeared on the
 * next. Nothing travelled, so nothing connected the place you left to the
 * place you landed.
 *
 * One thumb now slides between the segments. It is a single absolutely
 * positioned pill measured against the real buttons, so labels of different
 * widths ("Summary" against "List") still land exactly on their segment, and
 * the text colour crossfades underneath while the pill is in flight.
 *
 * THE FIRST PAINT NEVER ANIMATES. Measuring happens before the browser
 * paints, and the transition is switched on one frame later, or every page
 * would open with the thumb flying in from the left edge — an entrance
 * animation on a control that was already sitting there.
 *
 * WHY A MEASURED THUMB AND NOT A GRID. Equal columns would let the thumb be
 * pure CSS, but these labels are words, not icons: "Summary" beside "List" in
 * equal columns leaves the short one swimming in space, which is the layout
 * bug that gets reported next.
 *
 * NOT AN ENTRANCE ANIMATION. There is no keyframe on the strip itself and
 * none may be added: the Performance segments remount their module on every
 * press, and an entrance class there re-runs on every switch — the pills
 * flicker and Anir has raised it more than once. A transition between two
 * measured positions is a different thing and does not re-run on mount.
 *
 * Reduced motion turns the travel off and leaves the switch instant.
 */
export function ViewSwitch<T extends string | boolean>({
  value,
  onChange,
  options,
  ariaLabel,
  className,
}: {
  value: T;
  onChange: (next: T) => void;
  options: readonly { key: T; label: string; icon?: LucideIcon; mark?: string }[];
  ariaLabel: string;
  /**
   * DISPLAY LIVES HERE, NOT IN THE BASE CLASSES. `cn` in this repo is a plain
   * join with no Tailwind conflict resolution, so a hardcoded `inline-flex`
   * plus a caller's `hidden` would leave both in the attribute and let CSS
   * order decide whether the strip is visible. The caller owns the display
   * utility outright; the default covers everyone who does not care.
   */
  className?: string;
}) {
  const wrap = useRef<HTMLDivElement | null>(null);
  /* Keyed by the STRINGIFIED value: the currency strips switch on a boolean
     (local versus USD) and a Map keyed by `false` reads fine, but the React
     key and the ref callback both want a string, so one form is used for
     both and there is no second source of truth. */
  const btns = useRef(new Map<string, HTMLButtonElement>());
  const [thumb, setThumb] = useState<{ x: number; w: number } | null>(null);
  const [armed, setArmed] = useState(false);

  /* Measured against the wrapper's own box, so the thumb is unaffected by
     where the strip sits on the page or what scrolled underneath it. */
  useLayoutEffect(() => {
    const measure = () => {
      const box = wrap.current?.getBoundingClientRect();
      const active = btns.current.get(String(value))?.getBoundingClientRect();
      if (!box || !active) return;
      setThumb({ x: active.left - box.left, w: active.width });
    };
    measure();
    /* Fonts land after first paint and every label reflows when they do, so a
       thumb measured once sits a few pixels off its segment for good. */
    const ro = new ResizeObserver(measure);
    if (wrap.current) ro.observe(wrap.current);
    btns.current.forEach((el) => ro.observe(el));
    return () => ro.disconnect();
  }, [value, options]);

  /* One frame of "no transition" so the thumb appears where it belongs
     instead of travelling there from nothing. */
  useEffect(() => {
    const id = requestAnimationFrame(() => setArmed(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      ref={wrap}
      role="group"
      aria-label={ariaLabel}
      className={cn(
        "relative shrink-0 items-center gap-0.5 rounded-full bg-surface p-0.5",
        className ?? "inline-flex"
      )}
    >
      {thumb && (
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute top-0.5 bottom-0.5 left-0 rounded-full bg-white shadow-sm",
            armed &&
              "transition-[transform,width] duration-[280ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
          )}
          style={{ transform: `translateX(${thumb.x}px)`, width: thumb.w }}
        />
      )}
      {options.map((o) => {
        const Icon = o.icon;
        const on = value === o.key;
        return (
          <button
            key={String(o.key)}
            type="button"
            ref={(el) => {
              if (el) btns.current.set(String(o.key), el);
              else btns.current.delete(String(o.key));
            }}
            onClick={() => onChange(o.key)}
            aria-pressed={on}
            className={cn(
              /* ABOVE THE THUMB, AND WITHOUT A BACKGROUND OF ITS OWN — the
                 white pill IS the thumb now. A background here would slide
                 out from under its own label. */
              "relative z-10 flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12px] font-semibold transition-colors duration-200",
              on ? "text-text-primary" : "text-text-secondary hover:text-text-primary"
            )}
          >
            {Icon && <Icon size={13} strokeWidth={2.2} aria-hidden="true" />}
            {/* The currency strips carry a symbol rather than a glyph icon
                ($ USD, € EUR), and it stays quieter than the code it labels. */}
            {o.mark && <span className="text-text-tertiary">{o.mark}</span>}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
