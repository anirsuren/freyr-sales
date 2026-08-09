"use client";

import { LayoutGrid, Table2 } from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip";

/**
 * THE ONE WAY TO SWITCH BETWEEN TILES AND ROWS.
 *
 * This control had drifted into three shapes: a segmented icon pair on the
 * team roster and a component's customers, a single button that swapped its own
 * glyph on Offerings and the component lists, and a labelled pair on Contacts.
 * Same decision, three affordances (Anir, Aug 9: "can we please have it
 * consistent? You always mess around with this thing").
 *
 * It is now the segmented pair at the compact size of the single button, which
 * is the combination he picked: both destinations are visible at once so you
 * never decode a glyph to work out which way it will flip, and the active half
 * is filled so the current view reads without a tooltip. Every list in the app
 * renders this exact component.
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
  className?: string;
}) {
  const half =
    "flex h-9 w-9 cursor-pointer items-center justify-center transition-colors";
  const on = "bg-blue-light text-blue-primary";
  const off = "text-text-secondary hover:bg-surface hover:text-text-primary";

  return (
    <div
      role="group"
      aria-label="How to show this list"
      className={`inline-flex shrink-0 overflow-hidden rounded-lg border border-border-light bg-white ${
        className ?? ""
      }`}
    >
      <Tooltip label={tileLabel}>
        <button
          type="button"
          onClick={() => onChange(tileValue)}
          aria-label={tileLabel}
          aria-pressed={value === tileValue}
          className={`${half} ${value === tileValue ? on : off}`}
        >
          <LayoutGrid size={15} strokeWidth={1.9} />
        </button>
      </Tooltip>
      <Tooltip label={tableLabel}>
        <button
          type="button"
          onClick={() => onChange(tableValue)}
          aria-label={tableLabel}
          aria-pressed={value === tableValue}
          className={`${half} border-l border-border-light ${
            value === tableValue ? on : off
          }`}
        >
          <Table2 size={15} strokeWidth={1.9} />
        </button>
      </Tooltip>
    </div>
  );
}
