"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A DATE FIELD WHOSE CALENDAR OPENS WHERE WE WANT IT.
 *
 * `<input type="date">` hands the calendar to the browser, which always drops
 * it directly underneath — inside a dialog that means it hangs off the bottom
 * of the screen (Anir, Aug 9: "it would look better if the date selector was to
 * the right instead of on the bottom, cuz it's too low"). Chrome's popup cannot
 * be moved with CSS, so the field owns its own calendar: it opens to the RIGHT
 * of the trigger, flipping left or up only when there is genuinely no room.
 *
 * Portalled to the body like every other popover in the app, so a dialog's
 * overflow cannot clip it.
 */

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = [
 "January", "February", "March", "April", "May", "June",
 "July", "August", "September", "October", "November", "December",
];

/** yyyy-mm-dd → a LOCAL date, never UTC (which shifts the day west of GMT). */
function parse(value: string): Date | null {
 const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
 if (!m) return null;
 const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
 return Number.isNaN(d.getTime())? null: d;
}

function iso(d: Date): string {
 return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
 d.getDate()
 ).padStart(2, "0")}`;
}

function pretty(d: Date): string {
 return d.toLocaleDateString(undefined, {
 day: "numeric",
 month: "short",
 year: "numeric",
 });
}

export function DateField({
 value,
 onChange,
 min,
 placeholder = "Pick a date",
 ariaLabel,
 className,
}: {
 /** yyyy-mm-dd, or "" for empty. */
 value: string;
 onChange: (value: string) => void;
 /** yyyy-mm-dd; earlier days are shown but cannot be chosen. */
 min?: string;
 placeholder?: string;
 ariaLabel?: string;
 className?: string;
}) {
 const [open, setOpen] = useState(false);
 const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
 const triggerRef = useRef<HTMLButtonElement>(null);
 const panelRef = useRef<HTMLDivElement>(null);
 const selected = parse(value);
 const minDate = min? parse(min): null;
 const [month, setMonth] = useState(() => selected?? new Date());

 useEffect(() => {
 if (open) setMonth(selected?? new Date());
    // Only when the panel opens; re-syncing on every keystroke would fight the
    // arrows the moment someone pages to another month.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // TO THE RIGHT FIRST. Flip to the left when the viewport runs out, and clamp
  // vertically so the calendar is never half off the bottom.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const width = 268;
      const height = 320;
      const gap = 8;
      const room = window.innerWidth - rect.right - gap;
      // Right of the field when it fits, otherwise left of it — and clamped
      // either way so the panel can never hang off the viewport edge.
      const preferred =
        room >= width ? rect.right + gap : rect.left - width - gap;
      const left = Math.min(
        Math.max(8, preferred),
        Math.max(8, window.innerWidth - width - 8)
      );
      const top = Math.min(
        Math.max(8, rect.top),
        Math.max(8, window.innerHeight - height - 8)
      );
      setPos({ left, top });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const startOffset = first.getDay();
  const cells: Date[] = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(first);
    d.setDate(1 - startOffset + i);
    return d;
  });
  const today = iso(new Date());

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "flex w-full cursor-pointer items-center gap-2 rounded-lg border bg-white px-3 py-2 text-left text-[13.5px] transition-colors",
          open ? "border-blue-primary" : "border-border hover:border-blue-subtle",
          className
        )}
      >
        <CalendarDays
          size={14}
          strokeWidth={2}
          aria-hidden="true"
          className="shrink-0 text-text-tertiary"
        />
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            selected ? "text-text-primary" : "text-text-tertiary"
          )}
        >
          {selected ? pretty(selected) : placeholder}
        </span>
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label={ariaLabel || "Choose a date"}
            style={{ left: pos.left, top: pos.top, width: 268 }}
            className="menu-in fixed z-[130] rounded-xl border border-border-light bg-white p-3 shadow-[0_18px_48px_-16px_rgba(15,23,42,0.34)]"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[13px] font-semibold text-text-primary">
                {MONTHS[month.getMonth()]} {month.getFullYear()}
              </span>
              <span className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Previous month"
                  onClick={() =>
                    setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
                  }
                  className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-blue-light hover:text-blue-primary"
                >
                  <ChevronLeft size={14} strokeWidth={2.2} />
                </button>
                <button
                  type="button"
                  aria-label="Next month"
                  onClick={() =>
                    setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
                  }
                  className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-blue-light hover:text-blue-primary"
                >
                  <ChevronRight size={14} strokeWidth={2.2} />
                </button>
              </span>
            </div>

            <div className="grid grid-cols-7 gap-0.5">
              {WEEKDAYS.map((day, i) => (
                <span
                  key={`${day}-${i}`}
                  className="py-1 text-center text-[10px] font-bold uppercase text-text-tertiary"
                >
                  {day}
                </span>
              ))}
              {cells.map((date) => {
                const key = iso(date);
                const outside = date.getMonth() !== month.getMonth();
                const disabled = !!minDate && date < minDate;
                const isSelected = !!selected && key === iso(selected);
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      onChange(key);
                      setOpen(false);
                    }}
                    className={cn(
                      "h-8 rounded-md text-[12.5px] tnum transition-colors",
                      disabled
                        ? "cursor-not-allowed text-text-tertiary/40"
                        : "cursor-pointer hover:bg-blue-light",
                      isSelected
                        ? "bg-blue-primary font-semibold text-white hover:bg-blue-primary"
                        : outside
                          ? "text-text-tertiary"
                          : "text-text-primary",
                      !isSelected && key === today && "font-bold text-blue-primary"
                    )}
                  >
                    {date.getDate()}
                  </button>
                );
              })}
            </div>

            <div className="mt-2 flex items-center justify-between border-t border-border-light pt-2">
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
                className="cursor-pointer text-[12px] font-medium text-text-secondary hover:text-blue-primary"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => {
                  onChange(today);
                  setOpen(false);
                }}
                className="cursor-pointer text-[12px] font-semibold text-blue-primary hover:underline"
              >
                Today
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
