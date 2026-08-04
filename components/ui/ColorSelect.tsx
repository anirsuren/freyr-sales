"use client";

import { useState, useRef, useEffect, type CSSProperties } from "react";
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

function iconForeground(color?: string): string {
  if (!color) return "#FFFFFF";
  const hex = color.replace("#", "");
  if (!/^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(hex)) return "#FFFFFF";
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((character) => character + character)
          .join("")
      : hex;
  const red = Number.parseInt(full.slice(0, 2), 16);
  const green = Number.parseInt(full.slice(2, 4), 16);
  const blue = Number.parseInt(full.slice(4, 6), 16);
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000;
  return luminance > 164 ? "#243142" : "#FFFFFF";
}

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
  compactTrigger = false,
}: {
  value: string;
  options: ColorOption[];
  onChange: (v: string) => void;
  className?: string;
  minWidth?: number;
  ariaLabel?: string;
  /** Opt out of the search-priority compression (default: follow the toolbar). */
  collapsible?: boolean;
  /** Keep detailed descriptions in the menu while using a standard one-line trigger. */
  compactTrigger?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [menuAlign, setMenuAlign] = useState<"left" | "right">("left");
  const [menuVertical, setMenuVertical] = useState<"up" | "down">("down");
  const [menuMaxHeight, setMenuMaxHeight] = useState(300);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value) ?? options[0];
  const detailed = options.some((o) => o.description);
  const showDetailedTrigger = detailed && !compactTrigger;
  // The two-line "detailed" trigger never compacts — it isn't a toolbar shape.
  const searchHasPriority = useSearchPriority();
  const compact = collapsible && searchHasPriority && !showDetailedTrigger;
  // The full label still reaches a screen reader (aria-label) and the mouse
  // (tooltip), so a collapsed control is never a mystery box.
  const fullLabel = ariaLabel || selected?.label || "Filter";

  const toggleMenu = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = ref.current?.getBoundingClientRect();
    if (rect) {
      const desiredWidth = detailed ? 304 : Math.max(rect.width, 240);
      const availableRight = window.innerWidth - rect.left - 12;
      setMenuAlign(availableRight >= desiredWidth ? "left" : "right");

      const roomBelow = window.innerHeight - rect.bottom - 12;
      const roomAbove = rect.top - 12;
      const opensUp = roomBelow < 190 && roomAbove > roomBelow;
      setMenuVertical(opensUp ? "up" : "down");
      setMenuMaxHeight(
        Math.max(150, Math.min(300, Math.floor(opensUp ? roomAbove : roomBelow)))
      );
    }
    setOpen(true);
  };

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
            background: o.color || "#0071E3",
            color: iconForeground(o.color || "#0071E3"),
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
          style={{
            background: o.color || "#8E98A8",
            color: iconForeground(o.color || "#8E98A8"),
          }}
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
          onClick={toggleMenu}
          aria-haspopup="listbox"
          aria-expanded={open}
          // Compressed, the words are gone from view but never from the
          // accessibility tree — the trigger still announces what it filters.
          aria-label={compact ? fullLabel : ariaLabel}
          className={cn(
            "w-full flex items-center justify-center bg-white border border-border-light rounded-lg text-text-primary hover:border-blue-subtle focus:outline-none focus:border-blue-primary focus:shadow-input-focus transition-[border-color,box-shadow,background-color,padding]",
            SP_MOTION,
            showDetailedTrigger
              ? "h-12 gap-2.5 px-2.5"
              : cn("h-10 text-[13px] overflow-hidden", compact ? "px-0" : "px-3")
          )}
        >
          {selected && <Dot o={selected} prominent={showDetailedTrigger} solo={compact} />}
          <PriorityLabel
            collapsed={compact}
            // `detailed` keeps the button's own flex gap; the compact shape
            // trades that gap for a collapsing margin so the glyph centres.
            gap={showDetailedTrigger ? false : "ml-2"}
            className="min-w-0 text-left"
            // Same as `flex-1`, with the grow factor animated rather than
            // switched, so the slack drains smoothly instead of vanishing.
            style={{ flexGrow: compact ? 0 : 1, flexShrink: 1, flexBasis: "0%" }}
          >
            <span className={cn("block truncate", showDetailedTrigger && "text-[12.5px] font-semibold leading-tight")}>
              {selected?.label}
            </span>
            {showDetailedTrigger && selected?.description && (
              <span className="mt-0.5 block truncate text-[9.5px] leading-tight text-text-tertiary">
                {selected.description}
              </span>
            )}
          </PriorityLabel>
          {selected?.badge && (
            <PriorityLabel collapsed={compact} gap={detailed ? false : "ml-2"} className="shrink-0">
              <span
                className="semantic-color-pill block rounded-md px-2 py-0.5 text-[10px] font-semibold"
                style={
                  {
                    "--semantic-color":
                      selected.badgeColor || selected.color || "#59616E",
                    "--semantic-bg":
                      `${selected.badgeColor || selected.color || "#8E98A8"}14`,
                  } as CSSProperties
                }
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
            "absolute z-40 min-w-full w-max overflow-y-auto overflow-x-hidden rounded-lg border border-border-light bg-white shadow-[0_18px_48px_-16px_rgba(15,23,42,0.34)] hovercard-in",
            menuAlign === "left" ? "left-0" : "right-0",
            menuVertical === "up" ? "bottom-full mb-1.5" : "top-full mt-1.5",
            detailed ? "w-[304px] p-2" : "p-1.5"
          )}
          style={{
            maxWidth: "min(360px, calc(100vw - 24px))",
            maxHeight: menuMaxHeight,
          }}
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
                  <span
                    className={cn(
                      "block",
                      !detailed && "truncate",
                      on && "font-semibold",
                      detailed && "whitespace-normal text-[13px] leading-tight"
                    )}
                  >
                    {o.label}
                  </span>
                  {detailed && o.description && (
                    <span className="mt-1 block whitespace-normal text-[10.5px] font-normal leading-snug text-text-tertiary">
                      {o.description}
                    </span>
                  )}
                </span>
                {o.badge && (
                  <span
                    className="semantic-color-pill shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold"
                    style={
                      {
                        "--semantic-color":
                          o.badgeColor || o.color || "#59616E",
                        "--semantic-bg":
                          `${o.badgeColor || o.color || "#8E98A8"}14`,
                      } as CSSProperties
                    }
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
  const [menuAlign, setMenuAlign] = useState<"left" | "right">("left");
  const [menuVertical, setMenuVertical] = useState<"up" | "down">("down");
  const [menuMaxHeight, setMenuMaxHeight] = useState(300);
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
      : picked.length === 1
        ? picked[0].label
        : `${picked.length} selected`;
  const selectionLabel =
    picked.length === 0
      ? allLabel
      : `${allLabel}: ${picked.map((option) => option.label).join(", ")}`;
  // `minWidth` is the caller's floor, not permission to ellipsize the normal
  // unrestricted label. Keep the track stable through every selection state,
  // but make it wide enough for "All customer types" / "All categories" at
  // rest. Multi-selection summaries stay deliberately short instead of
  // growing this track.
  const triggerWidth = Math.max(
    minWidth,
    Math.ceil(allLabel.length * 7.2 + 70)
  );
  // Reserve the menu's final width before it opens. A selected row becomes
  // semibold; when `w-max` measured that live content, selecting the longest
  // label widened the menu by a few pixels and shifted every checkbox left.
  // This estimate includes checkbox + icon + gaps + row padding and is capped
  // for narrow screens. The option labels already truncate gracefully.
  const longestMenuLabel = Math.max(
    allLabel.length,
    ...options.map((option) => option.label.length)
  );
  const menuWidth = Math.min(
    360,
    Math.max(triggerWidth, Math.ceil(longestMenuLabel * 7.5 + 76))
  );

  const toggle = (v: string) =>
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);

  const toggleMenu = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const trigger = ref.current?.getBoundingClientRect();
    if (trigger) {
      const viewportWidth = window.innerWidth;
      const renderedMenuWidth = Math.min(menuWidth, viewportWidth - 24);
      // Prefer matching the menu's left edge to the trigger. Near the right
      // viewport edge, pin its right edge instead so the entire list remains
      // visible. The alignment is chosen before mount, so it never jumps.
      setMenuAlign(
        trigger.left + renderedMenuWidth <= viewportWidth - 12
          ? "left"
          : "right"
      );
      const roomBelow = window.innerHeight - trigger.bottom - 12;
      const roomAbove = trigger.top - 12;
      const openUp = roomBelow < 180 && roomAbove > roomBelow;
      setMenuVertical(openUp ? "up" : "down");
      setMenuMaxHeight(
        Math.max(48, Math.min(300, (openUp ? roomAbove : roomBelow) - 6))
      );
    }
    setOpen(true);
  };

  return (
    <div
      ref={ref}
      className={cn("relative transition-[width,min-width]", SP_MOTION, className)}
      // This must be a fixed track, not only a minimum. With `min-width`, a
      // two-item summary made the flex child grow, and the right-anchored menu
      // (including every checkbox) jumped sideways after the second click.
      // The summary already truncates and carries a count, so growing the
      // control adds no information and only moves the interaction targets.
      style={{
        width: compact ? SP_COMPACT_SIZE : triggerWidth,
        minWidth: compact ? SP_COMPACT_SIZE : triggerWidth,
      }}
    >
      <PriorityTooltip label={selectionLabel} className="w-full">
        <button
          type="button"
          onClick={toggleMenu}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={ariaLabel ? `${ariaLabel}. ${selectionLabel}` : selectionLabel}
          className={cn(
            "w-full h-10 flex items-center justify-center overflow-hidden text-[13px] bg-white border border-border-light rounded-lg text-text-primary hover:border-blue-subtle focus:outline-none focus:border-blue-primary focus:shadow-input-focus transition-[border-color,box-shadow,padding]",
            SP_MOTION,
            compact ? "px-0" : "px-3"
          )}
        >
          {/* This leading slot is always 20px wide. Swapping an unrestricted
              icon for one/two/three selection dots cannot move the label. */}
          <span className="flex h-5 w-5 shrink-0 items-center justify-center">
            {picked.length > 0 ? (
              <span className="flex items-center justify-center">
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
                className="flex h-5 w-5 items-center justify-center rounded-md"
                style={{
                  background: allColor,
                  color: iconForeground(allColor),
                }}
              >
                <AllIcon size={12} strokeWidth={2.1} />
              </span>
            ) : (
              <span className="h-2.5 w-2.5 rounded-full bg-border" />
            )}
          </span>
          <PriorityLabel
            collapsed={compact}
            className="min-w-0 text-left"
            style={{ flexGrow: compact ? 0 : 1, flexShrink: 1, flexBasis: "0%" }}
          >
            <span className="block truncate">{summary}</span>
          </PriorityLabel>
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
          className={cn(
            "absolute z-40 overflow-y-auto overflow-x-hidden rounded-lg border border-border-light bg-white p-1.5 shadow-[0_18px_48px_-16px_rgba(15,23,42,0.34)] hovercard-in",
            menuVertical === "down" && "mt-1.5"
          )}
          style={{
            width: `min(${menuWidth}px, calc(100vw - 24px))`,
            maxWidth: "calc(100vw - 24px)",
            maxHeight: menuMaxHeight,
            left: menuAlign === "left" ? 0 : "auto",
            right: menuAlign === "right" ? 0 : "auto",
            bottom: menuVertical === "up" ? "calc(100% + 6px)" : "auto",
          }}
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
                style={{
                  background: allColor,
                  color: iconForeground(allColor),
                }}
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
                    style={{
                      background: accent,
                      color: iconForeground(accent),
                    }}
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
