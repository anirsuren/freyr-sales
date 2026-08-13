"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, LayoutGrid, Table2, type LucideIcon } from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn, POPOVER_SURFACE } from "@/lib/utils";

/**
 * THE ONE WAY TO SWITCH BETWEEN TILES AND ROWS.
 *
 * This control had drifted into three shapes: a segmented icon pair on the
 * team roster and a component's customers, a single button that swapped its own
 * glyph on Offerings and the component lists, and a labelled pair on Contacts.
 * Same decision, three affordances (Anir, Aug 9: "can we please have it
 * consistent? You always mess around with this thing").
 *
 * It is now ONE button that shows the view you are in, opening a small menu
 * with both destinations named (Anir, Aug 13: "make the selector for row view
 * or tiles view a single dropdown, still the same icons, but just dropdown
 * instead of side by side, so the pin can fit properly and not touch
 * anything"). Half the width of the old pair, so the pin beside it has room,
 * and the destinations are still spelled out rather than left as glyphs to
 * decode: they moved from the toolbar into the menu.
 *
 * Callers keep their own vocabulary — "tile"/"grid", "cards"/"table",
 * "grid"/"list" — and map it through the two value props, because renaming the
 * stored preferences would silently reset everyone's saved choice.
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
   *  list-versus-timeline pair, say. The control keeps its exact shape and
   *  size, so it still reads as the one view switch the app uses everywhere;
   *  only what it depicts changes. */
  tileIcon?: LucideIcon;
  tableIcon?: LucideIcon;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(
    null
  );

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
    // The menu is PORTALLED to the body (see below), so it must follow the
    // button if the page scrolls or the window resizes while it is open.
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

      {/* PORTALLED TO THE BODY: the entrance animations on `.tab-panel` and
          `.rise-in` fill forwards, so those blocks keep an identity transform
          and stay stacking contexts for life — content below the toolbar was
          painting OVER this menu no matter its z-index (Anir, Aug 13: "your
          grid view is gone, man. It's coming behind"). Outside the tree, no
          ancestor can trap it. */}
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
