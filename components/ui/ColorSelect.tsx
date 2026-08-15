"use client";

import { useState, useRef, useEffect, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check, Search, type LucideIcon } from "lucide-react";
import {
  PriorityLabel,
  PriorityTooltip,
  SP_COMPACT_SIZE,
  useSearchPriority,
} from "@/components/ui/SearchPriority";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";

export type ColorOption = {
  value: string;
  label: string;
  color?: string; // dot / accent colour; omit for the "all" option
  icon?: LucideIcon;
  /** Render a real person avatar instead of a generic icon or colour dot. */
  avatarName?: string;
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

type FloatingMenuStyle = CSSProperties & {
  left: number;
  width: number;
  maxHeight: number;
};

/**
 * Where the panel should grow FROM. A dropdown that flipped above its trigger
 * has to expand upward out of that trigger, or the motion reads as the menu
 * sliding through the control it belongs to.
 */
function menuMotionVars(style: FloatingMenuStyle | null): CSSProperties {
  const opensUp = style ? style.bottom !== undefined : false;
  return {
    ["--menu-origin" as string]: opensUp ? "bottom left" : "top left",
    ["--menu-dir" as string]: opensUp ? -1 : 1,
  };
}

function floatingMenuStyle(
  trigger: DOMRect,
  desiredWidth: number,
  minimumRoom: number
): FloatingMenuStyle {
  const edge = 12;
  const gap = 6;
  const width = Math.max(
    1,
    Math.min(desiredWidth, window.innerWidth - edge * 2)
  );
  const left =
    trigger.left + width <= window.innerWidth - edge
      ? Math.max(edge, trigger.left)
      : Math.max(edge, trigger.right - width);
  const roomBelow = window.innerHeight - trigger.bottom - edge;
  const roomAbove = trigger.top - edge;
  const opensUp = roomBelow < minimumRoom && roomAbove > roomBelow;
  const maxHeight = Math.max(
    72,
    Math.min(300, Math.floor((opensUp ? roomAbove : roomBelow) - gap))
  );

  return opensUp
    ? {
        position: "fixed",
        left,
        bottom: window.innerHeight - trigger.top + gap,
        width,
        maxHeight,
      }
    : {
        position: "fixed",
        left,
        top: trigger.bottom + gap,
        width,
        maxHeight,
      };
}

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
  triggerLabel,
  dense = false,
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
  /** A shorter stable label for dense toolbars, while the menu keeps full option labels. */
  triggerLabel?: string;
  /** Reduce internal padding/gaps without hiding the visible label. */
  dense?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<FloatingMenuStyle | null>(null);
  // Long lists get a search box (Anir: "all big dropdowns like this with
  // over 10 things definitely need a search bar").
  const [menuQuery, setMenuQuery] = useState("");
  const searchable = options.length > 10;
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
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
      setMenuStyle(floatingMenuStyle(rect, desiredWidth, 190));
    }
    setMenuQuery("");
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        ref.current &&
        !ref.current.contains(target) &&
        !menuRef.current?.contains(target)
      )
        setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onResize = () => setOpen(false);
    // The menu is position:fixed, measured once at open. Page scroll used to
    // leave it stranded mid-viewport while its trigger moved away (Anir,
    // Aug 8: "when I click the dropdown and I scroll... the dropdown floats").
    // Re-anchor on every scroll — capture catches nested containers too.
    const onScroll = () => {
      const rect = ref.current?.getBoundingClientRect();
      if (!rect) return;
      // Keep the width the menu opened with; only the anchor moves.
      setMenuStyle((prev) => {
        const width = typeof prev?.width === "number" ? prev.width : Math.max(rect.width, 240);
        return floatingMenuStyle(rect, width, 190);
      });
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, { capture: true } as EventListenerOptions);
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
    if (o.avatarName)
      return (
        <Avatar
          name={o.avatarName}
          className={cn(
            "shrink-0",
            prominent ? "h-8 w-8 text-[10px]" : "h-5 w-5 text-[7px]"
          )}
        />
      );
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

  /**
   * DO NOT SIZE THIS FROM THE LONGEST OPTION. I tried it on Aug 14 to stop the
   * log modal's goal picker truncating, and it broke two layouts in a row:
   * the New offering modal's OFFERING TYPE select ran under the OFFERING NAME
   * label beside it, and then the Offerings toolbar pushed its view toggle
   * clean out of the filter bar ("you're bleeding here too").
   *
   * The reason is `min-width`: it is a floor that flex cannot shrink past, so
   * the moment several selects share a row, the row stops compressing and the
   * overflow lands on whatever sits at the end of it. Capping each select at
   * 100% does not save it either, because that resolves per item and not
   * across the row.
   *
   * A caller that genuinely needs a wider trigger passes a bigger `minWidth`
   * and owns the consequence in its own layout. That is one deliberate call
   * site instead of every select in the app.
   */
  return (
    <div
      ref={ref}
      className={cn("relative transition-[min-width]", SP_MOTION, className)}
      style={{
        width: compact ? SP_COMPACT_SIZE : undefined,
        minWidth: compact ? SP_COMPACT_SIZE : minWidth,
      }}
    >
      <PriorityTooltip label={fullLabel} className="w-full" suppressed={open}>
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
              : cn(
                  "h-10 overflow-hidden",
                  dense ? "text-[12px]" : "text-[13px]",
                  compact ? "px-0" : dense ? "px-2" : "px-3"
                )
          )}
        >
          {selected && <Dot o={selected} prominent={showDetailedTrigger} solo={compact} />}
          <PriorityLabel
            collapsed={compact}
            // `detailed` keeps the button's own flex gap; the compact shape
            // trades that gap for a collapsing margin so the glyph centres.
            gap={showDetailedTrigger ? false : dense ? "ml-1.5" : "ml-2"}
            className="min-w-0 text-left"
            // Same as `flex-1`, with the grow factor animated rather than
            // switched, so the slack drains smoothly instead of vanishing.
            style={{ flexGrow: compact ? 0 : 1, flexShrink: 1, flexBasis: "0%" }}
          >
            <span className={cn("block truncate", showDetailedTrigger && "text-[12.5px] font-semibold leading-tight")}>
              {triggerLabel || selected?.label}
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
          <PriorityLabel collapsed={compact} gap={detailed ? false : dense ? "ml-1.5" : "ml-2"} className="shrink-0">
            <span className={cn("flex items-center justify-center", detailed && "w-7 h-7 rounded-md bg-surface")}>
              <ChevronDown
                size={dense ? 13 : 15}
                strokeWidth={2}
                // Same expo-out curve the panel uses, so the chevron and the menu
                // read as one gesture rather than two things that happened.
                className={cn(
                  "transition-[transform,color] duration-[240ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
                  open ? "rotate-180 text-blue-primary" : "text-text-tertiary"
                )}
              />
            </span>
          </PriorityLabel>
        </button>
      </PriorityTooltip>

      {open && menuStyle && typeof document !== "undefined" && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          aria-label={ariaLabel}
          className={cn(
            "menu-in z-[110] overflow-y-auto overflow-x-hidden rounded-lg border border-border-light bg-white shadow-[0_18px_48px_-16px_rgba(15,23,42,0.34)]",
            detailed ? "p-2" : "p-1.5"
          )}
          style={{ ...menuStyle, ...menuMotionVars(menuStyle) }}
        >
          {searchable && (
            /* The search bar has to cover the panel's own top padding, or
               rows scroll through the strip above it and you can read an
               option straight through the search box (Anir, Aug 15: "I can
               see the thing right behind the search bar"). `top-0` sticks to
               the scrollport, which is INSIDE that padding, so the offset and
               the margins have to match the panel's padding exactly. */
            <div
              className={cn(
                "sticky z-10 mb-1 border-b border-border-light bg-white",
                detailed
                  ? "-top-2 -mx-2 -mt-2 p-2"
                  : "-top-1.5 -mx-1.5 -mt-1.5 p-1.5"
              )}
            >
              <div className="flex items-center gap-1.5 rounded-md bg-surface px-2 py-1.5">
                <Search size={13} strokeWidth={2.2} className="shrink-0 text-text-tertiary" />
                <input
                  autoFocus
                  value={menuQuery}
                  onChange={(e) => setMenuQuery(e.target.value)}
                  placeholder="Search…"
                  aria-label={`Search ${ariaLabel || "options"}`}
                  className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-text-tertiary"
                />
              </div>
            </div>
          )}
          {(searchable && menuQuery.trim()
            ? options.filter((o) => {
                const q = menuQuery.trim().toLowerCase();
                return (
                  o.label.toLowerCase().includes(q) ||
                  (o.description ?? "").toLowerCase().includes(q)
                );
              })
            : options
          ).map((o, rowIndex) => {
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
                  "menu-row-in relative w-full flex items-center rounded-lg text-left transition-[background-color,box-shadow,transform]",
                  detailed ? "min-h-[54px] gap-3 px-2.5 py-2" : "gap-2.5 px-2.5 py-2 text-[13px]",
                  !on && "hover:bg-surface active:scale-[0.99]"
                )}
                style={{
                  ...(on ? { background: `${accent}0D` } : null),
                  ["--row" as string]: rowIndex,
                }}
              >
                <Dot o={o} prominent={detailed} />
                <span className="flex-1 min-w-0">
                  <span
                    className={cn(
                      "block whitespace-normal leading-snug",
                      on && "font-semibold",
                      detailed && "text-[13px] leading-tight"
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
          {searchable &&
            menuQuery.trim() &&
            options.every(
              (o) =>
                !o.label.toLowerCase().includes(menuQuery.trim().toLowerCase()) &&
                !(o.description ?? "")
                  .toLowerCase()
                  .includes(menuQuery.trim().toLowerCase())
            ) && (
              <p className="px-2.5 py-2 text-[12.5px] text-text-tertiary">
                Nothing matches that.
              </p>
            )}
        </div>,
        document.body
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
  triggerLabel,
  width,
  maxWidth,
  dense = false,
  fluid = false,
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
  /** Short stable field name used in dense toolbars, e.g. "Customer". */
  triggerLabel?: string;
  /** Fixed trigger width for a dense toolbar. */
  width?: number;
  /** Let a selected value widen the trigger up to this limit. */
  maxWidth?: number;
  /** Reduce internal padding/gaps without hiding the visible label. */
  dense?: boolean;
  /** Fill the caller's grid column instead of sizing from the label. */
  fluid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<FloatingMenuStyle | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchHasPriority = useSearchPriority();
  const compact = collapsible && searchHasPriority;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        ref.current &&
        !ref.current.contains(target) &&
        !menuRef.current?.contains(target)
      )
        setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onResize = () => setOpen(false);
    // The menu is position:fixed, measured once at open. Page scroll used to
    // leave it stranded mid-viewport while its trigger moved away (Anir,
    // Aug 8: "when I click the dropdown and I scroll... the dropdown floats").
    // Re-anchor on every scroll — capture catches nested containers too.
    const onScroll = () => {
      const rect = ref.current?.getBoundingClientRect();
      if (!rect) return;
      // Keep the width the menu opened with; only the anchor moves.
      setMenuStyle((prev) => {
        const width = typeof prev?.width === "number" ? prev.width : Math.max(rect.width, 240);
        return floatingMenuStyle(rect, width, 180);
      });
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, { capture: true } as EventListenerOptions);
    };
  }, [open]);

  const picked = options.filter((o) => values.includes(o.value));
  // NAME THE PICKS when they fit. "2 selected" makes the reader open the menu
  // to learn what they already chose (Anir, Aug 8: "say the stage instead of
  // 2 selected — you'll have the space"). Only a pick list too long for the
  // trigger falls back to the count.
  const joined = picked.map((option) => option.label).join(", ");
  const summary =
    picked.length === 0
      ? triggerLabel || allLabel
      : picked.length === 1
        ? picked[0].label
        : joined.length <= 34
          ? joined
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
  const baseTriggerWidth =
    width ?? Math.max(minWidth, Math.ceil(allLabel.length * 7.2 + 70));
  const triggerWidth =
    width !== undefined && maxWidth !== undefined
      ? Math.min(
          maxWidth,
          Math.max(baseTriggerWidth, Math.ceil(summary.length * 6.2 + 61))
        )
      : baseTriggerWidth;
  // Reserve the menu's final width before it opens. A selected row becomes
  // semibold; when `w-max` measured that live content, selecting the longest
  // label widened the menu by a few pixels and shifted every checkbox left.
  // This estimate includes checkbox + icon + gaps + row padding.
  //
  // THE ESTIMATE HAS TO BE GENEROUS, because nothing downstream rescues it:
  // option labels no longer truncate (standing rule — never cut a word with
  // "…"), so an under-measured menu wraps a label onto two lines instead. At
  // 7.5px/char "Presentation" came out 12px short and rendered "Presentati…"
  // (Anir, Aug 7: "the presentations word is getting cut off"). 8.6 clears the
  // widest glyphs in the 13px semibold face used for a selected row.
  const longestMenuLabel = Math.max(
    allLabel.length,
    ...options.map((option) => option.label.length)
  );
  const menuWidth = Math.min(
    400,
    Math.max(triggerWidth, Math.ceil(longestMenuLabel * 8.6 + 92))
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
      setMenuStyle(floatingMenuStyle(trigger, menuWidth, 180));
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
        width: compact ? SP_COMPACT_SIZE : fluid ? "100%" : triggerWidth,
        minWidth: compact ? SP_COMPACT_SIZE : fluid ? 0 : triggerWidth,
      }}
    >
      <PriorityTooltip label={selectionLabel} className="w-full" suppressed={open}>
        <button
          type="button"
          onClick={toggleMenu}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={ariaLabel ? `${ariaLabel}. ${selectionLabel}` : selectionLabel}
          className={cn(
            "w-full h-10 flex items-center justify-center overflow-hidden bg-white border border-border-light rounded-lg text-text-primary hover:border-blue-subtle focus:outline-none focus:border-blue-primary focus:shadow-input-focus transition-[border-color,box-shadow,padding]",
            SP_MOTION,
            dense ? "text-[12px]" : "text-[13px]",
            compact ? "px-0" : dense ? "px-2" : "px-3"
          )}
        >
          {/* This leading slot is always 20px wide. Swapping an unrestricted
              icon for one/two/three selection dots cannot move the label. */}
          <span className="flex h-5 w-5 shrink-0 items-center justify-center">
            {picked.length === 1 && picked[0].avatarName ? (
              <Avatar
                name={picked[0].avatarName}
                className="h-5 w-5 shrink-0 text-[7px]"
              />
            ) : picked.length === 1 && picked[0].icon ? (
              <span
                className="flex h-5 w-5 items-center justify-center rounded-md"
                style={{
                  background: picked[0].color || "#8E98A8",
                  color: iconForeground(picked[0].color || "#8E98A8"),
                }}
              >
                {(() => {
                  const PickedIcon = picked[0].icon;
                  return PickedIcon ? <PickedIcon size={12} strokeWidth={2.1} /> : null;
                })()}
              </span>
            ) : picked.length > 0 ? (
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
            gap={dense ? "ml-1.5" : "ml-2"}
            className="min-w-0 text-left"
            style={{ flexGrow: compact ? 0 : 1, flexShrink: 1, flexBasis: "0%" }}
          >
            <span className="block truncate">{summary}</span>
          </PriorityLabel>
          <PriorityLabel collapsed={compact} gap={dense ? "ml-1.5" : "ml-2"} className="shrink-0">
            <ChevronDown
              size={dense ? 13 : 15}
              strokeWidth={2}
              // Same expo-out curve the panel uses, so the chevron and the menu
                // read as one gesture rather than two things that happened.
                className={cn(
                  "transition-[transform,color] duration-[240ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
                  open ? "rotate-180 text-blue-primary" : "text-text-tertiary"
                )}
            />
          </PriorityLabel>
        </button>
      </PriorityTooltip>

      {open && menuStyle && typeof document !== "undefined" && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          aria-multiselectable="true"
          aria-label={ariaLabel}
          className={cn(
            "menu-in z-[110] overflow-y-auto overflow-x-hidden rounded-lg border border-border-light bg-white p-1.5 shadow-[0_18px_48px_-16px_rgba(15,23,42,0.34)]"
          )}
          style={{ ...menuStyle, ...menuMotionVars(menuStyle) }}
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
          {options.map((o, rowIndex) => {
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
                  "menu-row-in w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors",
                  !on && "hover:bg-surface"
                )}
                style={{
                  ...(on ? { background: `${accent}0D` } : null),
                  ["--row" as string]: rowIndex,
                }}
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
                {o.avatarName ? (
                  <Avatar
                    name={o.avatarName}
                    className="h-5 w-5 shrink-0 text-[7px]"
                  />
                ) : Icon ? (
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
                {/* No truncation on an option label — a picker that hides
                    which option it is is not a picker. The menu reserves a
                    width from the longest label above; anything wider than
                    the 400px cap wraps rather than cutting. */}
                <span className={cn("min-w-0 flex-1 whitespace-normal leading-tight", on && "font-semibold")}>{o.label}</span>
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}
