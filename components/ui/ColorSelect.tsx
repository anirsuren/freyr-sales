"use client";

import { useState, useRef, useEffect, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check, Crown, Search, type LucideIcon } from "lucide-react";
import {
  PriorityLabel,
  PriorityTooltip,
  SP_COMPACT_SIZE,
  useSearchPriority,
} from "@/components/ui/SearchPriority";
import { Avatar } from "@/components/ui/Avatar";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { cn } from "@/lib/utils";

export type ColorOption = {
  value: string;
  label: string;
  color?: string; // dot / accent colour; omit for the "all" option
  icon?: LucideIcon;
  /** Render a real person avatar instead of a generic icon or colour dot. */
  avatarName?: string;
  /** Render the company's own logo mark. Same idea as avatarName, for
   *  accounts (Anir, Aug 16: "here you need to have the company logo"). A
   *  filter listing sixty-five customers as sixty-five identical blue dots
   *  said nothing about which one you were picking. */
  logoName?: string;
  description?: string;
  /**
   * THE OWNER WEARS THE CROWN (Anir, Aug 19, picking a group to put on a
   * goal: "I don't need that icon. I need the owner profile picture with the
   * crown on top"). Draws a small crown over `avatarName`, so the face in the
   * mark is unmistakably the person who runs this thing.
   */
  crown?: boolean;
  /**
   * The people inside this option, as an overlapping face stack on the right
   * ("I also need to see all the people in the group"). Up to five, then a
   * count. Purely a picture — the option's own words still say how many.
   */
  faces?: string[];
  badge?: string;
  badgeColor?: string;
  /** What the trigger shows when the toolbar compresses and the words go —
   *  e.g. "12" for "12 / page", so the collapsed square still tells you the
   *  value instead of repeating one generic glyph for every option. */
  short?: string;
  /**
   * A small blue pill after the label — "You" on the signed-in person's own
   * row (Anir, Aug 22: "clearly label with a blue tag 'you' after the name,
   * instead of grey text — make it blue and pop more"). A word, not a
   * parenthesis, so your own name is findable at a glance.
   */
  tag?: string;
  /**
   * DRAW NO MARK AT ALL.
   *
   * Anir, Aug 26, on the country picker: "remove the circles for the country,
   * I only need the flag obviously." An option whose label already carries its
   * own glyph — a flag emoji, say — does not want a dot beside it, and the
   * fall-through below draws one unconditionally, grey when no colour is
   * given. Grey dots are also banned everywhere else in this app.
   */
  noMark?: boolean;
};

/** Shared motion for the compress/expand — see components/ui/SearchPriority. */
const SP_MOTION =
  "duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none";

export type FloatingMenuStyle = CSSProperties & {
  left: number;
  width: number;
  maxHeight: number;
};

/**
 * Where the panel should grow FROM. A dropdown that flipped above its trigger
 * has to expand upward out of that trigger, or the motion reads as the menu
 * sliding through the control it belongs to.
 */
export function menuMotionVars(style: FloatingMenuStyle | null): CSSProperties {
  const opensUp = style ? style.bottom !== undefined : false;
  return {
    ["--menu-origin" as string]: opensUp ? "bottom left" : "top left",
    ["--menu-dir" as string]: opensUp ? -1 : 1,
  };
}

export function floatingMenuStyle(
  trigger: DOMRect,
  desiredWidth: number,
  minimumRoom: number
): FloatingMenuStyle {
  const edge = 12;
  /**
   * The menu hugs its trigger (Anir, Aug 19: "objectively there's nothing
   * wrong with this dropdown but it just looks off... maybe because it's too
   * low?"). Six pixels plus the menu's own shadow read as a detached panel
   * floating near the field rather than the field's own list.
   */
  const gap = 2;
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
  fill = false,
  ariaLabel,
  collapsible = true,
  compactTrigger = false,
  triggerLabel,
  dense = false,
  autoOpen = false,
  searchable: forceSearchable,
}: {
  value: string;
  options: ColorOption[];
  onChange: (v: string) => void;
  className?: string;
  minWidth?: number;
  /**
   * Take exactly the width of the cell you are placed in — no fitting to the
   * current label, in either direction.
   *
   * The default sizing exists so a lone control never cuts its own name off.
   * Inside a grid of equal columns it does the opposite: "Proposals · Product
   * Demos" pushed the trigger 12px past its column and into the next one,
   * while a short label left a 99px hole (Anir, Aug 26: "the folder name here
   * is getting intersected" and "I have some gap here... between the third and
   * the fourth one"). A row of pickers should read as one aligned band.
   */
  fill?: boolean;
  ariaLabel?: string;
  /** Opt out of the search-priority compression (default: follow the toolbar). */
  collapsible?: boolean;
  /** Keep detailed descriptions in the menu while using a standard one-line trigger. */
  compactTrigger?: boolean;
  /** A shorter stable label for dense toolbars, while the menu keeps full option labels. */
  triggerLabel?: string;
  /** Reduce internal padding/gaps without hiding the visible label. */
  dense?: boolean;
  /** Open the menu the moment the select mounts — for flows where picking IS
   *  the next step (Anir, Aug 17: "my eyes should go there… I don't know
   *  where to go after I click add offering"). */
  autoOpen?: boolean;
  /**
   * Force the search box on a list shorter than the ten-option threshold
   * (Anir, Aug 21: "for the status, you definitely want to search for that
   * there as well, with the press Enter to select that").
   *
   * Status has eight options, under the automatic bar, but it is a list
   * people know the answer to before they open it — typing "wo" and pressing
   * Enter beats reading eight rows.
   */
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<FloatingMenuStyle | null>(null);
  // Long lists get a search box (Anir: "all big dropdowns like this with
  // over 10 things definitely need a search bar").
  const [menuQuery, setMenuQuery] = useState("");
  // autoOpen: the menu is already up when the control appears, search focused
  // — clicking "Add another offering" lands you IN the picker, no hunting.
  useEffect(() => {
    if (!autoOpen) return;
    const t = window.setTimeout(() => {
      const rect = ref.current?.getBoundingClientRect();
      if (rect) {
        const desiredWidth = Math.max(rect.width, 240);
        setMenuStyle(floatingMenuStyle(rect, desiredWidth, 260));
      }
      setOpen(true);
    }, 80);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /* Typing while the menu is open ALWAYS searches (Anir, Aug 22: "if I
     search up pro and press enter it should automatically go to Propose —
     this applies to basically all dropdowns, regardless of whether it has a
     search bar or not"). Short lists draw no box until a letter lands; the
     first keystroke summons it with the letter already inside. */
  const searchable =
    (forceSearchable ?? options.length > 10) || menuQuery.trim() !== "";
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value) ?? options[0];
  const detailed = options.some((o) => o.description);
  // The rows the menu is actually showing right now. Hoisted out of the JSX
  // so Enter in the search box can commit the top one (Anir, Aug 20: "when I
  // press Enter on all these dropdowns with the search bar, it has to pick
  // the first").
  const menuQ = menuQuery.trim().toLowerCase();
  const visibleOptions =
    searchable && menuQ
      ? options.filter(
          (o) =>
            o.label.toLowerCase().includes(menuQ) ||
            (o.description ?? "").toLowerCase().includes(menuQ)
        )
      : options;
  // An exact typed name beats row order — typing "Novartis" in full and
  // hitting Enter must not land on "Novartis + Cognizant" just because it
  // sorts higher.
  const enterPick =
    visibleOptions.find((o) => o.label.trim().toLowerCase() === menuQ) ??
    visibleOptions[0];

  /* The route from "menu open" to "typed": printable keys land in the query
     even before the search box exists, Enter commits the top match, Backspace
     erases. Once the box has drawn, its own handlers take over (the guard
     skips events already aimed at an input). */
  useEffect(() => {
    if (!open) return;
    const onType = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)
      )
        return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Enter") {
        if (!menuQuery.trim() || !enterPick) return;
        e.preventDefault();
        /* Same reason as the search input below: the palette shortcut must
           not see the Enter that picked an option. */
        e.stopImmediatePropagation();
        onChange(enterPick.value);
        setMenuQuery("");
        setOpen(false);
        return;
      }
      if (e.key === "Backspace") {
        if (!menuQuery) return;
        e.preventDefault();
        setMenuQuery((q) => q.slice(0, -1));
        return;
      }
      if (e.key.length === 1) {
        e.preventDefault();
        setMenuQuery((q) => q + e.key);
      }
    };
    document.addEventListener("keydown", onType);
    return () => document.removeEventListener("keydown", onType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, menuQuery, enterPick]);
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
      /* A detailed menu keeps its 304px floor but never ignores a WIDE
         trigger: under the plan-a-deal field the 304px panel dangled off a
         1200px control (Anir, Aug 27: "why is the drop-down so small?...
         it looks bad"). The list is the field's own — it wears the field's
         width. */
      const desiredWidth = Math.max(rect.width, detailed ? 304 : 240);
      setMenuStyle(floatingMenuStyle(rect, desiredWidth, 260));
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
    /* Escape dismisses THIS menu and stops there. It used to reach the
       Modal's own Escape handler as well, so tapping Escape to back out of a
       dropdown threw away the whole half-filled form behind it (found by the
       Aug 22 UI sweep). */
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      e.preventDefault();
      setOpen(false);
    };
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
        return floatingMenuStyle(rect, width, 260);
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
    if (o.logoName)
      return (
        <CompanyLogo
          name={o.logoName}
          className={cn(
            "shrink-0",
            prominent ? "h-8 w-8 text-[10px]" : "h-5 w-5 text-[7px]"
          )}
        />
      );
    if (o.avatarName)
      return o.crown ? (
        <span className="relative shrink-0">
          <Avatar
            name={o.avatarName}
            className={cn(prominent ? "h-8 w-8 text-[10px]" : "h-5 w-5 text-[7px]")}
          />
          <span
            className={cn(
              "absolute grid place-items-center rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.22)]",
              prominent ? "-right-1 -top-1 h-4 w-4" : "-right-0.5 -top-0.5 h-3 w-3"
            )}
          >
            <Crown
              size={prominent ? 9 : 7}
              strokeWidth={2.8}
              className="text-[color:#7C3AED]"
            />
          </span>
        </span>
      ) : (
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
    if (o.noMark) return null;
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
  /**
   * WIDE ENOUGH FOR THE LABEL IT IS ACTUALLY SHOWING (Anir, Aug 24, at the
   * Offerings sort reading "By recomme…" and the Customers page reading "All
   * on o…": "make sure this filter actually shows up. No dots." A control whose
   * own name is cut off is a control you have to hover to read.
   *
   * Note what this does NOT do — it does not size from the longest OPTION,
   * which is the thing the memo above forbids and for good reason. It sizes
   * from the CURRENT one: bounded, usually short, and it changes only when the
   * selection changes. `minWidth` is still the caller's floor.
   *
   * 6.9px per character is the measured average for this app's 13px face; the
   * constant is the trigger's own chrome (dot, gaps, chevron, padding).
   */
  const shownLabel = String(triggerLabel || selected?.label || "");
  const fitWidth = compact
    ? SP_COMPACT_SIZE
    : Math.max(
        minWidth,
        Math.ceil(shownLabel.length * 6.9) + (selected ? 34 : 12) + 34
      );

  return (
    <div
      ref={ref}
      className={cn("relative transition-[min-width]", SP_MOTION, className)}
      style={{
        width: fill ? "100%" : compact ? SP_COMPACT_SIZE : undefined,
        minWidth: fill ? 0 : fitWidth,
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
            <span className={cn("flex min-w-0 items-center", showDetailedTrigger && "text-[12.5px] font-semibold leading-tight")}>
              <span className="truncate">{triggerLabel || selected?.label}</span>
              {!triggerLabel && selected?.tag && (
                <span className="ml-1.5 inline-flex shrink-0 items-center rounded-full bg-blue-light px-1.5 py-[1px] text-[9.5px] font-bold uppercase tracking-[0.04em] text-blue-primary">
                  {selected.tag}
                </span>
              )}
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
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    /* THE PICK IS CONSUMED HERE AND GOES NO FURTHER.
                       TopBar has a global "Enter opens the command palette"
                       shortcut, guarded by "is the user typing?". Committing
                       a pick closes this menu, which unmounts the very input
                       that made the guard true — so by the time the window
                       listener ran, focus had fallen back to <body>, the
                       guard passed, and the palette threw a full-screen
                       backdrop over the page. Every click afterwards hit the
                       backdrop and the app looked frozen. React attaches at
                       the root, below window, so the native event has to be
                       stopped explicitly. */
                    e.stopPropagation();
                    e.nativeEvent?.stopImmediatePropagation?.();
                    if (!enterPick) return;
                    onChange(enterPick.value);
                    setOpen(false);
                  }}
                  placeholder="Search…"
                  aria-label={`Search ${ariaLabel || "options"}`}
                  className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-text-tertiary"
                />
              </div>
            </div>
          )}
          {visibleOptions.map((o, rowIndex) => {
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
                    {o.tag && (
                      <span className="ml-1.5 inline-flex shrink-0 items-center rounded-full bg-blue-light px-1.5 py-[1px] align-[1px] text-[9.5px] font-bold uppercase tracking-[0.04em] text-blue-primary">
                        {o.tag}
                      </span>
                    )}
                  </span>
                  {detailed && o.description && (
                    <span className="mt-1 block whitespace-normal text-[10.5px] font-normal leading-snug text-text-tertiary">
                      {o.description}
                    </span>
                  )}
                </span>
                {o.faces && o.faces.length > 0 && (
                  // The group, drawn. It sits opposite the owner's face so the
                  // row reads "this person runs it, these people are in it".
                  <span className="flex shrink-0 items-center">
                    {o.faces.slice(0, 5).map((name, i) => (
                      <Avatar
                        key={`${name}-${i}`}
                        name={name}
                        className={cn(
                          "h-[22px] w-[22px] text-[8px] ring-2 ring-white",
                          i > 0 && "-ml-2"
                        )}
                      />
                    ))}
                    {o.faces.length > 5 && (
                      <span className="-ml-2 grid h-[22px] w-[22px] place-items-center rounded-full bg-surface text-[9px] font-bold text-text-secondary ring-2 ring-white tnum">
                        +{o.faces.length - 5}
                      </span>
                    )}
                  </span>
                )}
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
  placeholder,
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
  /** What the empty trigger says, when "nothing picked" must read as a
   *  prompt rather than a state (Saras, Aug 28: two offering owners read
   *  the required division picker's "Any division" as a valid choice —
   *  "can you replace it with 'Choose one or more divisions'?"). The menu's
   *  clear row keeps allLabel, where "any" is exactly what it means. */
  placeholder?: string;
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
  // Long lists get a search box here too, same 10-row line the single select
  // draws (Anir, Aug 18: "you have to look at all the things and make sure
  // you have search bars for the big dropdowns").
  const [query, setQuery] = useState("");
  /* Same law as the single select (Anir, Aug 22: "this applies to basically
     all dropdowns, regardless of whether it has a search bar or not"): short
     lists draw no box until a letter lands; the first keystroke summons it
     with the letter already inside. The multi had only given Enter to lists
     long enough to earn a search box, so a two-option menu ignored the key
     entirely — found clicking through the Solutioning create dialog, where
     Enter on a customer's two deals picked nothing. */
  const searchable = options.length > 10 || query.trim() !== "";
  const q = query.trim().toLowerCase();
  const visibleOptions = q
    ? options.filter((o) => o.label.toLowerCase().includes(q))
    : options;
  const enterPick =
    visibleOptions.find((o) => o.label.trim().toLowerCase() === q) ??
    visibleOptions[0];
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);
  /* The route from "menu open" to "typed", multi edition: printable keys land
     in the query before the box exists, Enter TICKS the top match and keeps
     the menu up (a multi is picked from repeatedly), Backspace erases. Events
     already aimed at an input are the box's own business. */
  useEffect(() => {
    if (!open) return;
    const onType = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)
      )
        return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Enter") {
        if (!enterPick) return;
        e.preventDefault();
        // The palette shortcut and the dialog behind must not see this Enter.
        e.stopImmediatePropagation();
        onChange(
          values.includes(enterPick.value)
            ? values.filter((v) => v !== enterPick.value)
            : [...values, enterPick.value]
        );
        setQuery("");
        return;
      }
      if (e.key === "Backspace") {
        if (!query) return;
        e.preventDefault();
        setQuery((prev) => prev.slice(0, -1));
        return;
      }
      if (e.key.length === 1) {
        e.preventDefault();
        setQuery((prev) => prev + e.key);
      }
    };
    document.addEventListener("keydown", onType);
    return () => document.removeEventListener("keydown", onType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query, enterPick, values]);
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
    /* Escape dismisses THIS menu and stops there. It used to reach the
       Modal's own Escape handler as well, so tapping Escape to back out of a
       dropdown threw away the whole half-filled form behind it (found by the
       Aug 22 UI sweep). */
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      e.preventDefault();
      setOpen(false);
    };
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
        return floatingMenuStyle(rect, width, 260);
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
      ? triggerLabel || placeholder || allLabel
      : picked.length === 1
        ? picked[0].label
        : joined.length <= 34
          ? joined
          : `${picked.length} selected`;
  const selectionLabel =
    picked.length === 0
      ? (placeholder ?? allLabel)
      : `${allLabel}: ${picked.map((option) => option.label).join(", ")}`;
  // `minWidth` is the caller's floor, not permission to ellipsize the normal
  // unrestricted label. Keep the track stable through every selection state,
  // but make it wide enough for "All customer types" / "All categories" at
  // rest. Multi-selection summaries stay deliberately short instead of
  // growing this track.
  const baseTriggerWidth =
    width ?? Math.max(minWidth, Math.ceil(allLabel.length * 7.2 + 70));
  // `maxWidth` alone is enough to let the summary grow the trigger — it used
  // to require `width` too, so "V1.0.4 (current), V2.0.0" ellipsized at the
  // floor width no matter what the caller allowed (Anir, Aug 17: "it can be
  // much bigger… so it doesn't say ..."). 7.4px/char is measured-generous for
  // the 13px face; the clamp is the caller's maxWidth.
  const triggerWidth =
    maxWidth !== undefined
      ? Math.min(
          maxWidth,
          Math.max(baseTriggerWidth, Math.ceil(summary.length * 7.4 + 61))
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
            {picked.length === 1 && picked[0].logoName ? (
              <CompanyLogo
                name={picked[0].logoName}
                className="h-5 w-5 shrink-0 text-[7px]"
              />
            ) : picked.length === 1 && picked[0].avatarName ? (
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
          {searchable && (
            <div className="sticky -top-1.5 z-10 -mx-1.5 -mt-1.5 mb-1 border-b border-border-light bg-white p-1.5">
              <div className="flex items-center gap-1.5 rounded-md bg-surface px-2 py-1.5">
                <Search size={13} strokeWidth={2.2} className="shrink-0 text-text-tertiary" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    e.stopPropagation();
                    e.nativeEvent?.stopImmediatePropagation?.();
                    // Same rule as the single select, except a multi keeps
                    // the menu up: tick the top match, clear the box, type
                    // the next name.
                    const hit =
                      visibleOptions.find((o) => o.label.trim().toLowerCase() === q) ??
                      visibleOptions[0];
                    if (!hit) return;
                    toggle(hit.value);
                    setQuery("");
                  }}
                  placeholder="Search…"
                  aria-label="Search options"
                  className="w-full bg-transparent text-[13px] text-text-primary outline-none placeholder:text-text-tertiary"
                />
              </div>
            </div>
          )}
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
          {visibleOptions.map((o, rowIndex) => {
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
                {o.logoName ? (
                  <CompanyLogo
                    name={o.logoName}
                    className="h-5 w-5 shrink-0 text-[7px]"
                  />
                ) : o.avatarName ? (
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
          {searchable && visibleOptions.length === 0 && (
            <p className="px-2.5 py-3 text-[12.5px] text-text-secondary">
              Nothing matches &quot;{query.trim()}&quot;.
            </p>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
