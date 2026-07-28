"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check, type LucideIcon } from "lucide-react";
import {
  PriorityLabel,
  PriorityTooltip,
  SP_COMPACT_SIZE,
  useSearchPriority,
} from "@/components/ui/SearchPriority";
import { cn } from "@/lib/utils";

export type ColorOption = {
  value: string;
  label: string;
  color?: string; // dot / accent colour; omit for the "all" option
  icon?: LucideIcon;
  description?: string;
  badge?: string;
  badgeColor?: string;
  /** What the trigger shows when the toolbar compresses and the words go —
   *  e.g. "12" for "12 / page", so the collapsed square still tells you the
   *  value instead of repeating one generic glyph for every option. */
  short?: string;
};

/** Shared motion for the compress/expand — see components/ui/SearchPriority. */
const SP_MOTION =
  "duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none";

// A custom, color-coded dropdown to replace cheap gray <select>s (Suren: "color
// code all the dropdowns"). Each option carries a colour dot (and optional icon);
// the trigger mirrors the selected one. Click-away + Escape close it.
export function ColorSelect({
  value,
  options,
  onChange,
  className,
  minWidth = 170,
  ariaLabel,
  collapsible = true,
}: {
  value: string;
  options: ColorOption[];
  onChange: (v: string) => void;
  className?: string;
  minWidth?: number;
  ariaLabel?: string;
  /** Opt out of the search-priority compression (default: follow the toolbar). */
  collapsible?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value) ?? options[0];
  const detailed = options.some((o) => o.description);
  // The two-line "detailed" trigger never compacts — it isn't a toolbar shape.
  const searchHasPriority = useSearchPriority();
  const compact = collapsible && searchHasPriority && !detailed;
  // The full label still reaches a screen reader (aria-label) and the mouse
  // (tooltip), so a collapsed control is never a mystery box.
  const fullLabel = ariaLabel || selected?.label || "Filter";

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const Dot = ({
    o,
    prominent = false,
    // On the collapsed trigger the glyph IS the control, so it earns a little
    // more presence than it has sitting next to a word.
    solo = false,
  }: {
    o: ColorOption;
    prominent?: boolean;
    solo?: boolean;
  }) => {
    const Icon = o.icon;
    // A value that reads better as itself than as a glyph ("12 / page" → "12").
    if (solo && o.short)
      return (
        <span
          className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 text-[11px] font-bold tnum"
          style={{
            background: `${o.color || "#0071E3"}1F`,
            color: o.color || "#0071E3",
          }}
        >
          {o.short}
        </span>
      );
    if (Icon)
      return (
        <span
          className={cn(
            "rounded-md flex items-center justify-center shrink-0",
            prominent ? "w-8 h-8" : "w-5 h-5"
          )}
          style={{ background: o.color ? `${o.color}1F` : "transparent", color: o.color || "#8E98A8" }}
        >
          <Icon size={prominent ? 16 : 12} strokeWidth={2.1} />
        </span>
      );
    return (
      <span
        className={cn(
          "rounded-full shrink-0 transition-[width,height]",
          SP_MOTION,
          solo ? "w-3 h-3" : "w-2.5 h-2.5"
        )}
        style={{ background: o.color || "#C7CDD6" }}
      />
    );
  };

  return (
    <div
      ref={ref}
      className={cn("relative transition-[min-width]", SP_MOTION, className)}
      style={{ minWidth: compact ? SP_COMPACT_SIZE : minWidth }}
    >
      <PriorityTooltip label={fullLabel} className="w-full">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          // Compressed, the words are gone from view but never from the
          // accessibility tree — the trigger still announces what it filters.
          aria-label={compact ? fullLabel : ariaLabel}
          className={cn(
            "w-full flex items-center justify-center bg-white border border-border-light rounded-lg text-text-primary hover:border-blue-subtle focus:outline-none focus:border-blue-primary focus:shadow-input-focus transition-[border-color,box-shadow,background-color,padding]",
            SP_MOTION,
            detailed
              ? "h-12 gap-2.5 px-2.5"
              : cn("h-10 text-[13px] overflow-hidden", compact ? "px-0" : "px-3")
          )}
        >
          {selected && <Dot o={selected} prominent={detailed} solo={compact} />}
          <PriorityLabel
            collapsed={compact}
            // `detailed` keeps the button's own flex gap; the compact shape
            // trades that gap for a collapsing margin so the glyph centres.
            gap={detailed ? false : "ml-2"}
            className="min-w-0 text-left"
            // Same as `flex-1`, with the grow factor animated rather than
            // switched, so the slack drains smoothly instead of vanishing.
            style={{ flexGrow: compact ? 0 : 1, flexShrink: 1, flexBasis: "0%" }}
          >
            <span className={cn("block truncate", detailed && "text-[12.5px] font-semibold leading-tight")}>
              {selected?.label}
            </span>
            {detailed && selected?.description && (
              <span className="mt-0.5 block truncate text-[9.5px] leading-tight text-text-tertiary">
                {selected.description}
              </span>
            )}
          </PriorityLabel>
          {selected?.badge && (
            <PriorityLabel collapsed={compact} gap={detailed ? false : "ml-2"} className="shrink-0">
              <span
                className="block rounded-md px-2 py-0.5 text-[10px] font-semibold"
                style={{
                  color: selected.badgeColor || selected.color || "#59616E",
                  background: `${selected.badgeColor || selected.color || "#8E98A8"}14`,
                }}
              >
                {selected.badge}
              </span>
            </PriorityLabel>
          )}
          <PriorityLabel collapsed={compact} gap={detailed ? false : "ml-2"} className="shrink-0">
            <span className={cn("flex items-center justify-center", detailed && "w-7 h-7 rounded-md bg-surface")}>
              <ChevronDown
                size={15}
                strokeWidth={2}
                className={cn("text-text-tertiary transition-transform duration-150", open && "rotate-180")}
              />
            </span>
          </PriorityLabel>
        </button>
      </PriorityTooltip>

      {open && (
        <div
          role="listbox"
          aria-label={ariaLabel}
          className={cn(
            "absolute right-0 z-40 mt-1.5 min-w-full w-max max-h-[300px] overflow-y-auto overflow-x-hidden rounded-lg border border-border-light bg-white shadow-[0_18px_48px_-16px_rgba(15,23,42,0.34)] hovercard-in",
            detailed ? "w-[304px] p-2" : "p-1.5"
          )}
          style={{ maxWidth: "min(360px, calc(100vw - 24px))" }}
        >
          {options.map((o) => {
            const on = o.value === value;
            // Selected look = a whisper of the option's own color (Suren: the old
            // solid-blue fill + left notch looked bad). No bar, no heavy fill.
            const accent = o.color || "#0071E3";
            return (
              <button
                key={o.value || "__all"}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={cn(
                  "relative w-full flex items-center rounded-lg text-left transition-[background-color,box-shadow,transform]",
                  detailed ? "min-h-[54px] gap-3 px-2.5 py-2" : "gap-2.5 px-2.5 py-2 text-[13px]",
                  !on && "hover:bg-surface active:scale-[0.99]"
                )}
                style={on ? { background: `${accent}0D` } : undefined}
              >
                <Dot o={o} prominent={detailed} />
                <span className="flex-1 min-w-0">
                  <span className={cn("block truncate", on && "font-semibold", detailed && "text-[13px] leading-tight")}>
                    {o.label}
                  </span>
                  {detailed && o.description && (
                    <span className="mt-1 block truncate text-[10.5px] font-normal leading-tight text-text-tertiary">
                      {o.description}
                    </span>
                  )}
                </span>
                {o.badge && (
                  <span
                    className="shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold"
                    style={{
                      color: o.badgeColor || o.color || "#59616E",
                      background: `${o.badgeColor || o.color || "#8E98A8"}14`,
                    }}
                  >
                    {o.badge}
                  </span>
                )}
                {on && (
                  <Check size={15} strokeWidth={2.6} className="shrink-0" style={{ color: accent }} />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Multi-select sibling of ColorSelect — checkboxes, stays open while picking,
// OR within the filter (change-log rows 3 + 5, Saras: "multi-select with
// checkboxes… so any user can choose any combination"). `values` empty = no
// restriction ("All"). Same colour-dot/icon language as the single select.
export function MultiColorSelect({
  values,
  options,
  onChange,
  allLabel,
  className,
  minWidth = 170,
  ariaLabel,
  allIcon: AllIcon,
  allColor = "#0071E3",
  collapsible = true,
}: {
  values: string[];
  options: ColorOption[];
  onChange: (next: string[]) => void;
  /** Trigger + clear-row label when nothing is restricted, e.g. "All formats". */
  allLabel: string;
  className?: string;
  minWidth?: number;
  ariaLabel?: string;
  /** The unrestricted state's glyph. Without one it collapses to a bare gray
   *  dot, which is both ambiguous and against the colour+icon rule. */
  allIcon?: LucideIcon;
  allColor?: string;
  /** Opt out of the search-priority compression (default: follow the toolbar). */
  collapsible?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const searchHasPriority = useSearchPriority();
  const compact = collapsible && searchHasPriority;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const picked = options.filter((o) => values.includes(o.value));
  const summary =
    picked.length === 0
      ? allLabel
      : picked.length <= 2
        ? picked.map((o) => o.label).join(", ")
        : `${picked.length} selected`;

  const toggle = (v: string) =>
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);

  return (
    <div
      ref={ref}
      className={cn("relative transition-[min-width]", SP_MOTION, className)}
      style={{ minWidth: compact ? SP_COMPACT_SIZE : minWidth }}
    >
      <PriorityTooltip label={ariaLabel || allLabel} className="w-full">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={ariaLabel || allLabel}
          className={cn(
            "w-full h-10 flex items-center justify-center overflow-hidden text-[13px] bg-white border border-border-light rounded-lg text-text-primary hover:border-blue-subtle focus:outline-none focus:border-blue-primary focus:shadow-input-focus transition-[border-color,box-shadow,padding]",
            SP_MOTION,
            compact ? "px-0" : "px-3"
          )}
        >
          {/* Stacked colour dots preview which families are active. */}
          {picked.length > 0 ? (
            <span className="flex shrink-0 items-center">
              {picked.slice(0, 3).map((o, i) => (
                <span
                  key={o.value}
                  className={cn("h-2.5 w-2.5 rounded-full ring-2 ring-[color:var(--white)]", i > 0 && "-ml-1")}
                  style={{ background: o.color || "#C7CDD6" }}
                />
              ))}
            </span>
          ) : AllIcon ? (
            // Unrestricted, but never a gray blank: the filter keeps its own
            // colour + icon, so collapsed it still says what it filters.
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md"
              style={{ background: `${allColor}1F`, color: allColor }}
            >
              <AllIcon size={12} strokeWidth={2.1} />
            </span>
          ) : (
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-border" />
          )}
          <PriorityLabel
            collapsed={compact}
            className="min-w-0 text-left"
            style={{ flexGrow: compact ? 0 : 1, flexShrink: 1, flexBasis: "0%" }}
          >
            <span className="block truncate">{summary}</span>
          </PriorityLabel>
          {picked.length > 0 && (
            <PriorityLabel collapsed={compact} className="shrink-0">
              <span className="block rounded-full bg-blue-light px-1.5 py-0.5 text-[10px] font-bold text-blue-primary tnum">
                {picked.length}
              </span>
            </PriorityLabel>
          )}
          <PriorityLabel collapsed={compact} className="shrink-0">
            <ChevronDown
              size={15}
              strokeWidth={2}
              className={cn("text-text-tertiary transition-transform duration-150", open && "rotate-180")}
            />
          </PriorityLabel>
        </button>
      </PriorityTooltip>

      {open && (
        <div
          role="listbox"
          aria-multiselectable="true"
          aria-label={ariaLabel}
          className="absolute right-0 z-40 mt-1.5 min-w-full w-max max-h-[300px] overflow-y-auto overflow-x-hidden rounded-lg border border-border-light bg-white p-1.5 shadow-[0_18px_48px_-16px_rgba(15,23,42,0.34)] hovercard-in"
          style={{ maxWidth: "min(360px, calc(100vw - 24px))" }}
        >
          {/* "All" clears every pick — reads as the unrestricted state. */}
          <button
            type="button"
            role="option"
            aria-selected={values.length === 0}
            onClick={() => {
              onChange([]);
              setOpen(false);
            }}
            className={cn(
              "w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px]",
              values.length === 0 ? "bg-surface font-semibold" : "hover:bg-surface"
            )}
          >
            {AllIcon ? (
              <span
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md"
                style={{ background: `${allColor}1F`, color: allColor }}
              >
                <AllIcon size={12} strokeWidth={2.1} />
              </span>
            ) : (
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-border" />
            )}
            {allLabel}
          </button>
          {options.map((o) => {
            const on = values.includes(o.value);
            const accent = o.color || "#0071E3";
            const Icon = o.icon;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => toggle(o.value)}
                className={cn(
                  "w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors",
                  !on && "hover:bg-surface"
                )}
                style={on ? { background: `${accent}0D` } : undefined}
              >
                {/* The checkbox — the literal ask ("checkboxes before them"). */}
                <span
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                    on ? "text-white" : "border-border bg-white"
                  )}
                  style={on ? { background: accent, borderColor: accent } : undefined}
                >
                  {on && <Check size={11} strokeWidth={3} />}
                </span>
                {Icon ? (
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md"
                    style={{ background: `${accent}1F`, color: accent }}
                  >
                    <Icon size={12} strokeWidth={2.1} />
                  </span>
                ) : (
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: accent }} />
                )}
                <span className={cn("min-w-0 flex-1 truncate", on && "font-semibold")}>{o.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
