"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowDownAZ,
  ArrowUpAZ,
  Check,
  ChevronDown,
  Filter as FilterIcon,
  X,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";

/**
 * SORT AND FILTER FROM THE COLUMN HEADING, THE WAY EXCEL DOES IT.
 *
 * Saras, Aug 21: "in the list view, can we just put the filters and sorting in
 * the title of each column? Like how we do it in Excel, where the header row
 * itself lets you filter or sort within that header. That would be more
 * familiar for any rep who will be using it. Only for the list view — for tile
 * view we can retain it as it is."
 *
 * So this is the LIST view's controls, and the toolbar's Filter button and
 * Sort select stay exactly as they are for the tiles. Both drive the same
 * state, so a filter set in one place is visible in the other and neither can
 * disagree with what is on screen.
 *
 * A column may offer sorting, filtering, or both. A heading with neither stays
 * plain text rather than growing a control that does nothing.
 */
export type HeaderOption = {
  value: string;
  label: string;
  color?: string;
  avatarName?: string;
};

export function ColumnHeaderMenu({
  label,
  sortKey,
  activeSortKey,
  sortDir,
  onSort,
  ascLabel = "A to Z",
  descLabel = "Z to A",
  options,
  values,
  onValues,
}: {
  label: string;
  /** Omit to make this heading sort-less. */
  sortKey?: string;
  activeSortKey?: string;
  sortDir?: "asc" | "desc";
  onSort?: (key: string, dir: "asc" | "desc") => void;
  ascLabel?: string;
  descLabel?: string;
  /** Omit to make this heading filter-less. */
  options?: HeaderOption[];
  values?: string[];
  onValues?: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ top: number; left: number } | null>(null);

  const canSort = Boolean(sortKey && onSort);
  const canFilter = Boolean(options?.length && onValues);
  const sorted = canSort && activeSortKey === sortKey;
  const filtered = (values?.length ?? 0) > 0;

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const node = buttonRef.current;
      if (!node) return;
      const r = node.getBoundingClientRect();
      const width = 232;
      setBox({
        top: r.bottom + 4,
        left: Math.min(Math.max(8, r.left), Math.max(8, window.innerWidth - width - 8)),
      });
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
      if (buttonRef.current?.contains(target)) return;
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

  if (!canSort && !canFilter) {
    return <span>{label}</span>;
  }

  const toggle = (value: string) => {
    if (!onValues) return;
    const has = (values ?? []).includes(value);
    onValues(
      has ? (values ?? []).filter((v) => v !== value) : [...(values ?? []), value]
    );
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-label={`Sort or filter by ${label}`}
        className={cn(
          "-mx-1.5 inline-flex max-w-full cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors hover:bg-blue-light hover:text-blue-primary",
          (sorted || filtered || open) && "text-blue-primary"
        )}
      >
        <span className="min-w-0 truncate">{label}</span>
        {/* The heading says what it is doing without being asked: an arrow
            when it is the sort, a funnel when it is narrowing the list. */}
        {sorted &&
          (sortDir === "desc" ? (
            <ArrowUpAZ size={12} strokeWidth={2.4} className="shrink-0" />
          ) : (
            <ArrowDownAZ size={12} strokeWidth={2.4} className="shrink-0" />
          ))}
        {filtered && <FilterIcon size={11} strokeWidth={2.4} className="shrink-0" />}
        {!sorted && !filtered && (
          <ChevronDown size={12} strokeWidth={2.2} className="shrink-0 opacity-50" />
        )}
      </button>

      {open &&
        box &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label={`${label} column options`}
            style={{ top: box.top, left: box.left, width: 232 }}
            className="menu-in fixed z-[140] overflow-hidden rounded-xl border border-border-light bg-white text-left shadow-[0_18px_48px_-16px_rgba(15,23,42,0.34)]"
          >
            {canSort && (
              <div className="py-1">
                {(
                  [
                    ["asc", ascLabel, ArrowDownAZ],
                    ["desc", descLabel, ArrowUpAZ],
                  ] as const
                ).map(([dir, text, Icon]) => (
                  <button
                    key={dir}
                    type="button"
                    onClick={() => {
                      onSort?.(sortKey as string, dir);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-2 px-2.5 py-1.5 text-[12.5px] font-normal normal-case tracking-normal transition-colors hover:bg-surface",
                      sorted && sortDir === dir
                        ? "text-blue-primary"
                        : "text-text-secondary"
                    )}
                  >
                    <Icon size={13} strokeWidth={2.2} className="shrink-0" />
                    <span className="flex-1 text-left">{text}</span>
                    {sorted && sortDir === dir && (
                      <Check size={12} strokeWidth={2.6} className="shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}

            {canSort && canFilter && <div className="border-t border-border-light" />}

            {canFilter && (
              <>
                <div className="flex items-center gap-1 px-2.5 pb-1 pt-2">
                  <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-text-tertiary">
                    Filter
                  </span>
                  {filtered && (
                    <button
                      type="button"
                      onClick={() => onValues?.([])}
                      className="ml-auto inline-flex cursor-pointer items-center gap-0.5 rounded-md px-1 text-[11px] font-medium normal-case tracking-normal text-text-tertiary transition-colors hover:text-[color:#DC2626]"
                    >
                      <X size={11} strokeWidth={2.4} />
                      Clear
                    </button>
                  )}
                </div>
                <div className="max-h-[260px] overflow-y-auto pb-1">
                  {options?.map((option) => {
                    const on = (values ?? []).includes(option.value);
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => toggle(option.value)}
                        className={cn(
                          "flex w-full cursor-pointer items-center gap-2 px-2.5 py-1.5 text-left text-[12.5px] font-normal normal-case tracking-normal transition-colors hover:bg-surface",
                          on ? "text-text-primary" : "text-text-secondary"
                        )}
                      >
                        {option.avatarName ? (
                          <Avatar
                            name={option.avatarName}
                            className="h-[18px] w-[18px] shrink-0 text-[7px]"
                          />
                        ) : (
                          <span
                            aria-hidden="true"
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{
                              background: option.color || "var(--text-tertiary)",
                            }}
                          />
                        )}
                        <span className="min-w-0 flex-1 break-words">{option.label}</span>
                        {on && (
                          <Check
                            size={13}
                            strokeWidth={2.6}
                            className="shrink-0 text-blue-primary"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
