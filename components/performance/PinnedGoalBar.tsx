"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowUp, ChevronRight, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/Avatar";

/** The pinned copy is shorter than the row it stands for, so the drill-down
 *  keeps as much of the screen as possible. */
const BAR_HEIGHT = 56;
/** The slim line under it that names the sub-goal or person you are inside. */
const STRIP_HEIGHT = 30;

type Section = { kind: string; label: string };

/**
 * THE OPEN GOAL STAYS ON SCREEN WHILE YOU READ ITS DETAIL (Anir, Oct 1:
 * "wherever this is like a super long thing where its part of the category on
 * top like a goal i need the goal to stay kinda like a table thats sticky the
 * goal has to be sticky becasue i will forget what goal it is").
 *
 * An open goal's drill-down runs to several screens: the period, group and
 * people boxes, everyone assigned, the sub-goals. Once the goal's own row
 * scrolls off the top, a copy of that row pins to the top of the page with
 * every cell under its own column, the way a frozen table row would. The end
 * of the drill-down pushes it back up and away, so it never sits over the
 * next goal. Clicking it returns to the goal's row; the chevron closes it.
 *
 * The same holds one level down. Any block inside the drill-down marked with
 * `data-pin-kind` and `data-pin-label` (a sub-goal card, an opened person)
 * whose own header has scrolled away while its contents are still on screen
 * is named on a slim line under the bar, so a long sub-goal never leaves you
 * guessing which one you are in either.
 *
 * Fixed rather than CSS sticky because the drill-down sits inside a folding
 * container that clips overflow, and a sticky element cannot escape that.
 */
export function PinnedGoalBar({
  goalId,
  accent,
  name,
  cells,
  onClose,
}: {
  goalId: string;
  /** The goal type's colour: the same rail the open row wears. */
  accent: string;
  name: string;
  /** One node per column of the goal row, in order, minus the last (actions)
   *  column, which this bar fills with its own two controls. */
  cells: ReactNode[];
  onClose: () => void;
}) {
  const [frame, setFrame] = useState<{
    top: number;
    left: number;
    width: number;
    shift: number;
    widths: number[];
    sections: Section[];
  } | null>(null);
  const rowRef = useRef<HTMLTableRowElement | null>(null);
  const scrollerRef = useRef<HTMLElement | null>(null);
  const sectionEls = useRef<HTMLElement[]>([]);

  useEffect(() => {
    const row = document.querySelector<HTMLTableRowElement>(
      `tr[data-goal-row="${CSS.escape(goalId)}"]`
    );
    const drawer = document.querySelector<HTMLElement>(
      `[data-goal-drawer="${CSS.escape(goalId)}"]`
    );
    if (!row || !drawer) return;
    rowRef.current = row;
    const scroller = row.closest<HTMLElement>("#main-content");
    scrollerRef.current = scroller;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const edge = scroller ? scroller.getBoundingClientRect().top : 0;
      const r = row.getBoundingClientRect();
      const d = drawer.getBoundingClientRect();
      // Pin once less of the row is left on screen than the bar covers, and
      // only while the drill-down under it still has something to show.
      if (r.height === 0 || r.bottom > edge + BAR_HEIGHT || d.bottom < edge + 12) {
        sectionEls.current = [];
        setFrame((current) => (current ? null : current));
        return;
      }
      // The drill-down's end pushes the bar up and out, like a frozen
      // header reaching the end of its section.
      const shift = Math.min(0, Math.round(d.bottom - edge - BAR_HEIGHT));
      const barBottom = edge + BAR_HEIGHT + shift;
      // Every marked block you are inside: its header is gone under the bar
      // and enough of its body is still below to be worth naming. Nested
      // blocks come later in document order, so the list reads outside-in.
      const inside = Array.from(
        drawer.querySelectorAll<HTMLElement>("[data-pin-kind][data-pin-label]")
      ).filter((el) => {
        const head = (el.firstElementChild as HTMLElement | null) ?? el;
        const box = el.getBoundingClientRect();
        return (
          box.height > 0 &&
          head.getBoundingClientRect().bottom < barBottom &&
          box.bottom > barBottom + STRIP_HEIGHT + 16
        );
      });
      sectionEls.current = inside;
      const next = {
        top: Math.round(edge),
        left: Math.round(r.left),
        width: Math.round(r.width),
        shift,
        widths: Array.from(row.cells).map((td) => td.getBoundingClientRect().width),
        sections: inside.map((el) => ({
          kind: el.dataset.pinKind ?? "",
          label: el.dataset.pinLabel ?? "",
        })),
      };
      setFrame((current) =>
        current &&
        current.top === next.top &&
        current.left === next.left &&
        current.width === next.width &&
        current.shift === next.shift &&
        current.widths.length === next.widths.length &&
        current.widths.every((w, i) => Math.abs(w - next.widths[i]) < 0.5) &&
        current.sections.map((s) => `${s.kind}:${s.label}`).join("|") ===
          next.sections.map((s) => `${s.kind}:${s.label}`).join("|")
          ? current
          : next
      );
    };
    const schedule = () => {
      if (!raf) raf = window.requestAnimationFrame(measure);
    };
    measure();
    // Capture catches the page scroller and any inner one alike.
    window.addEventListener("scroll", schedule, { capture: true, passive: true });
    window.addEventListener("resize", schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(drawer);
    observer.observe(row);
    return () => {
      window.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
      observer.disconnect();
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [goalId]);

  if (!frame || typeof document === "undefined") return null;

  const backToRow = () =>
    rowRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  /** Bring a block's own header back into view, just under the bar. */
  const backToSection = (i: number) => {
    const el = sectionEls.current[i];
    const scroller = scrollerRef.current;
    if (!el || !scroller) return;
    const edge = scroller.getBoundingClientRect().top;
    scroller.scrollBy({
      top: el.getBoundingClientRect().top - edge - BAR_HEIGHT - 8,
      behavior: "smooth",
    });
  };
  const actionsWidth = frame.widths[cells.length];
  const hasStrip = frame.sections.length > 0;

  return createPortal(
    <div
      className="pointer-events-none fixed z-40 overflow-hidden"
      style={{
        top: frame.top,
        left: frame.left,
        width: frame.width,
        height: BAR_HEIGHT + (hasStrip ? STRIP_HEIGHT : 0) + 14,
      }}
    >
      <div
        className="pointer-events-auto shadow-[0_8px_18px_-12px_rgba(8,15,28,0.45)]"
        style={{ transform: `translateY(${frame.shift}px)` }}
      >
        <div
          data-testid="pinned-goal-bar"
          onClick={backToRow}
          title="Back to this goal"
          className="flex cursor-pointer items-center border-b border-border-light bg-surface [box-shadow:inset_3px_0_0_0_var(--goal-accent)]"
          style={{ height: BAR_HEIGHT, ["--goal-accent" as string]: accent }}
        >
          {cells.map((cell, i) => (
            <div
              key={i}
              className={cn("min-w-0 shrink-0 px-4", i === 0 && "overflow-hidden")}
              style={{ width: frame.widths[i] }}
            >
              {cell}
            </div>
          ))}
          <div
            className="flex shrink-0 items-center gap-0.5 px-2"
            style={actionsWidth ? { width: actionsWidth } : undefined}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                backToRow();
              }}
              aria-label={`Back to ${name}`}
              title="Back to this goal"
              className="cursor-pointer rounded-md p-1 text-text-tertiary transition-colors hover:bg-blue-light hover:text-blue-primary"
            >
              <ArrowUp size={13.5} strokeWidth={2.2} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                // Back to the row first: closing from deep inside the drill-down
                // would otherwise collapse the page out from under the reader.
                rowRef.current?.scrollIntoView({ block: "start" });
                onClose();
              }}
              aria-label={`Hide the breakdown for ${name}`}
              title="Close this goal"
              className="cursor-pointer rounded-md p-1 text-blue-primary transition-colors hover:bg-white"
            >
              <ChevronUp size={13.5} strokeWidth={2.2} />
            </button>
          </div>
        </div>
        {hasStrip && (
          <div
            data-testid="pinned-goal-section"
            className="flex items-center gap-2 overflow-hidden border-b border-border-light bg-white pl-[30px] pr-4 [box-shadow:inset_3px_0_0_0_var(--goal-accent)]"
            style={{ height: STRIP_HEIGHT, ["--goal-accent" as string]: accent }}
          >
            {frame.sections.map((s, i) => (
              <Fragment key={`${s.kind}:${s.label}`}>
                {i > 0 && (
                  <ChevronRight
                    size={12}
                    strokeWidth={2.4}
                    aria-hidden="true"
                    className="shrink-0 text-text-tertiary"
                  />
                )}
                <button
                  type="button"
                  onClick={() => backToSection(i)}
                  title={`Back to the top of ${s.label}`}
                  className="flex min-w-0 cursor-pointer items-baseline gap-1.5 rounded-md px-1 text-left transition-colors hover:text-blue-primary"
                >
                  <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
                    {s.kind}
                  </span>
                  {s.kind === "Person" && (
                    <Avatar name={s.label} className="h-5 w-5 shrink-0 self-center text-[8px]" />
                  )}
                  {/* Drawn from the attribute, not as text: see PinnedGoalName. */}
                  <span
                    data-label={s.label}
                    className="truncate text-[12.5px] font-semibold before:content-[attr(data-label)]"
                  />
                </button>
              </Fragment>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

/** The goal's name as the pinned bar shows it. Drawn by CSS from an
 *  attribute, so the page still holds exactly one text node with the name and
 *  "find the goal by its name" keeps finding one goal. */
export function PinnedGoalName({ name, year }: { name: string; year?: string | number | null }) {
  return (
    <span className="min-w-0">
      <span
        data-label={name}
        className="block truncate text-[13.5px] font-semibold text-text-primary before:content-[attr(data-label)]"
      />
      {year ? (
        <span
          data-label={String(year)}
          className="block text-[10.5px] text-text-tertiary tnum before:content-[attr(data-label)]"
        />
      ) : null}
    </span>
  );
}
