"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, LayoutGrid, Table2, type LucideIcon } from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn, POPOVER_SURFACE } from "@/lib/utils";

/**
 * THE ONE WAY TO SWITCH BETWEEN TILES AND ROWS — SIZED TO ITS TOOLBAR.
 *
 * Anir, Aug 13, after the dropdown rewrite reached every page: "if theres
 * space u can have both the side by side, if theres no space just the
 * dropdown." So the control now decides per toolbar, per window size:
 *
 * - Room on the row: the classic segmented ICON PAIR, both destinations one
 *   click away.
 * - The row would wrap (a pinned-header button, filters and a search bar all
 *   competing): it collapses to the single dropdown that made the pin fit in
 *   the first place.
 *
 * The measurement watches the PARENT flex row. Collapsing frees width, which
 * would immediately make the row look roomy again, so expanding demands the
 * freed width back plus slack — that hysteresis is what stops it flapping
 * between the two shapes on a boundary width.
 *
 * The dropdown menu is PORTALLED to the body: `.tab-panel` and `.rise-in`
 * entrance animations fill forwards, keeping an identity transform, so those
 * blocks are stacking contexts for life and content painted OVER an in-tree
 * menu no matter its z-index ("your grid view is gone, man. It's coming
 * behind").
 *
 * Callers keep their own vocabulary — "tile"/"grid", "cards"/"table" — mapped
 * through the two value props, because renaming stored preferences would
 * silently reset everyone's saved choice.
 */
export function ViewSelect<T extends string>({
  value,
  onChange,
  tileValue,
  tableValue,
  tileLabel = "Tiles",
  tableLabel = "Rows",
  tileIcon: TileIcon = LayoutGrid,
  tableIcon: TableIcon = Table2,
  className,
}: {
  value: T;
  onChange: (next: T) => void;
  /** Whatever this caller calls its card/tile view. */
  tileValue: T;
  /** Whatever this caller calls its table/row view. */
  tableValue: T;
  tileLabel?: string;
  tableLabel?: string;
  /** Swap the glyphs when the two destinations are not tiles and rows — a
   *  list-versus-timeline pair, say. */
  tileIcon?: LucideIcon;
  tableIcon?: LucideIcon;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"pair" | "menu">("pair");
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const boxRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  /** How wide the pair was before it collapsed — what expanding must re-earn. */
  const pairWidthRef = useRef(0);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(
    null
  );

  // ---- fit-to-toolbar: pair when it fits, menu when the row would wrap.
  useEffect(() => {
    const box = boxRef.current;
    if (!box || !box.parentElement) return;
    // The control usually sits inside a small `ml-auto` cluster that never
    // wraps; the row that actually wraps under pressure is the flex-wrap
    // toolbar above it. Measure THAT row.
    let parent: HTMLElement = box.parentElement;
    for (let el: HTMLElement | null = parent, depth = 0; el && depth < 6; el = el.parentElement, depth++) {
      if (getComputedStyle(el).flexWrap === "wrap") {
        parent = el;
        break;
      }
    }

    const rowWrapped = () => {
      const kids = [...parent.children] as HTMLElement[];
      if (kids.length < 2) return false;
      const tops = kids.map((k) => k.offsetTop);
      // Center-aligned controls of different heights sit a few px apart on
      // ONE line; a real second line is a full control height lower.
      return Math.max(...tops) - Math.min(...tops) > 16;
    };
    const slack = () => {
      const kids = [...parent.children] as HTMLElement[];
      const right = Math.max(...kids.map((k) => k.offsetLeft + k.offsetWidth));
      return parent.clientWidth - right;
    };

    let frame = 0;
    const evaluate = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (modeRef.current === "pair") {
          pairWidthRef.current = box.offsetWidth;
          if (rowWrapped()) setMode("menu");
        } else {
          const delta = Math.max(pairWidthRef.current - box.offsetWidth, 24);
          if (!rowWrapped() && slack() > delta + 24) setMode("pair");
        }
      });
    };

    evaluate();
    const observer = new ResizeObserver(evaluate);
    observer.observe(parent);
    window.addEventListener("resize", evaluate);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", evaluate);
    };
  }, [mode]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!boxRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    // The portalled menu must follow the button through scrolls and resizes.
    const place = () => {
      const rect = boxRef.current?.getBoundingClientRect();
      if (!rect) return;
      setMenuPos({
        top: rect.bottom + 6,
        right: Math.max(window.innerWidth - rect.right, 8),
      });
    };
    place();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  const options = [
    { value: tileValue, label: tileLabel, Icon: TileIcon },
    { value: tableValue, label: tableLabel, Icon: TableIcon },
  ];
  const current = options.find((o) => o.value === value) ?? options[0];
  const CurrentIcon = current.Icon;

  if (mode === "pair") {
    return (
      <div
        ref={boxRef}
        role="group"
        aria-label="How to show this list"
        className={cn(
          "inline-flex shrink-0 overflow-hidden rounded-lg border border-border-light bg-white",
          className
        )}
      >
        {options.map(({ value: optionValue, label, Icon }) => {
          const active = optionValue === value;
          return (
            <Tooltip key={optionValue} label={active ? `Showing ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}>
              <button
                type="button"
                onClick={() => onChange(optionValue)}
                aria-label={`Show ${label.toLowerCase()}`}
                aria-pressed={active}
                className={cn(
                  "flex h-9 w-9 cursor-pointer items-center justify-center transition-colors",
                  active
                    ? "bg-blue-light text-blue-primary"
                    : "text-text-secondary hover:bg-surface hover:text-text-primary"
                )}
              >
                <Icon size={15} strokeWidth={1.9} />
              </button>
            </Tooltip>
          );
        })}
      </div>
    );
  }

  return (
    <div ref={boxRef} className={cn("relative inline-flex shrink-0", className)}>
      <Tooltip label={`Showing ${current.label.toLowerCase()}`}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="How to show this list"
          aria-haspopup="menu"
          aria-expanded={open}
          className={cn(
            "flex h-9 cursor-pointer items-center gap-1 rounded-lg border border-border-light bg-white pl-2 pr-1.5 transition-colors",
            open
              ? "border-blue-subtle bg-blue-light text-blue-primary"
              : "text-text-secondary hover:bg-surface hover:text-text-primary"
          )}
        >
          <CurrentIcon size={15} strokeWidth={1.9} />
          <ChevronDown
            size={13}
            strokeWidth={2.2}
            className={cn("transition-transform duration-200", open && "rotate-180")}
          />
        </button>
      </Tooltip>

      {open &&
        menuPos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ top: menuPos.top, right: menuPos.right }}
            className={cn(
              "popover-in fixed z-[210] w-[132px] overflow-hidden rounded-xl bg-white py-1",
              POPOVER_SURFACE
            )}
          >
            {options.map(({ value: optionValue, label, Icon }) => {
              const active = optionValue === value;
              return (
                <button
                  key={optionValue}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={() => {
                    onChange(optionValue);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-2 px-2.5 py-1.5 text-left text-[12.5px] font-medium transition-colors",
                    active
                      ? "text-blue-primary"
                      : "text-text-secondary hover:bg-surface hover:text-text-primary"
                  )}
                >
                  <Icon size={14} strokeWidth={1.9} className="shrink-0" />
                  <span className="flex-1">{label}</span>
                  {active && <Check size={13} strokeWidth={2.4} className="shrink-0" />}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
}
