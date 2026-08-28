"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { Avatar } from "@/components/ui/Avatar";
import { createPortal } from "react-dom";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Search, X, type LucideIcon } from "lucide-react";
import {
  floatingMenuStyle,
  menuMotionVars,
  type FloatingMenuStyle,
} from "@/components/ui/ColorSelect";
import { cn } from "@/lib/utils";

/**
 * PICK MANY FROM A LONG LIST WITHOUT A CHIP WALL.
 *
 * Born on the opportunity form (Anir, Aug 16: "whateven is this fix it" — 60
 * flat chips pushed the fields off screen) and now shared. Two shapes:
 *
 * - "inline": chips + search box + in-flow match list (the original).
 * - "dropdown": a closed trigger like every ColorSelect in the app; the menu
 *   FLOATS over the page (Anir, Aug 17: "the whole thing is actually a
 *   dropdown like the other one", and "the popup stays the same dimensions" —
 *   an in-flow list grew the modal every time it opened). Options that carry
 *   a `group` sit under their own collapsible category header ("each category
 *   is a dropdown"), with a search bar pinned on top.
 */
export type MultiPickerOption = {
  id: string;
  label: string;
  sub?: string;
  /** Identity colour — chips and menu rows wear it (chip rule: colour +
   *  icon, never plain gray). */
  color?: string;
  icon?: LucideIcon;
  /** Company whose logo fronts the row — deals wear their account's mark
   *  (Anir, Aug 18: "that's ugly. I need colors, logos, etc."). */
  logoName?: string;
  /**
   * PERSON WHOSE FACE FRONTS THE ROW.
   *
   * The company case was supported and the person case was not, so a picker
   * full of teammates fell through to a coloured dot — the same complaint,
   * a third time (Anir, Aug 28: "never do this mistake again with the profile
   * pictures"). Both marks are handled at every one of the three places this
   * component draws a row, so a new picker cannot reintroduce it by passing
   * the obvious prop.
   */
  avatarName?: string;
  /** Category this option lives under in the dropdown variant. */
  group?: string;
};

/**
 * A CHOSEN THING WEARS THE SAME PILL EVERY OTHER CHOSEN THING WEARS (Anir,
 * Aug 28: "I don't like how this looks. The blue thing, just keep it
 * consistent. Where is the profile picture and stuff?").
 *
 * The uncoloured chip was solid blue with white text, which is the shape of a
 * BUTTON, not of an identity — and it was the only chip in the app drawn that
 * way. It also swallowed the logo it was already being handed: a company mark
 * on a saturated blue field reads as a smudge, which is why the picked deals
 * had no logo while the very same rows in the list below did.
 *
 * Tinted fill, hairline border, blue text: the pill every entity already
 * wears, and a surface a logo can actually sit on.
 */
function cnChip(color?: string): string {
  return color
    ? "group inline-flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-semibold transition-opacity hover:opacity-80"
    : "group inline-flex cursor-pointer items-center gap-1 rounded-full border border-blue-subtle/60 bg-blue-light/70 px-2 py-1 text-[11.5px] font-semibold text-blue-primary transition-colors hover:border-blue-subtle hover:bg-blue-light";
}

function OptionRow({
  o,
  on,
  onPick,
  rowIndex,
}: {
  o: MultiPickerOption;
  on: boolean;
  onPick: () => void;
  rowIndex: number;
}) {
  const accent = o.color || "#0071E3";
  return (
    <button
      type="button"
      role="option"
      aria-selected={on}
      onClick={onPick}
      className={cn(
        "menu-row-in relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-[background-color,transform]",
        !on && "hover:bg-surface active:scale-[0.99]"
      )}
      style={{
        ...(on ? { background: `${accent}0D` } : null),
        ["--row" as string]: rowIndex,
      }}
    >
      {o.avatarName ? (
        <Avatar name={o.avatarName} className="h-6 w-6 shrink-0 text-[8px]" />
      ) : o.logoName ? (
        <CompanyLogo name={o.logoName} className="h-6 w-6 shrink-0 text-[8px]" />
      ) : o.icon ? (
        <o.icon
          size={13}
          strokeWidth={2.4}
          aria-hidden="true"
          className="shrink-0"
          style={{ color: accent }}
        />
      ) : (
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: accent }} />
      )}
      <span className={cn("min-w-0 flex-1 whitespace-normal leading-snug", on && "font-semibold")}>{o.label}</span>
      {o.sub && (
        <span className="shrink-0 text-[11px] text-text-tertiary tnum">{o.sub}</span>
      )}
      {on && (
        <Check size={14} strokeWidth={2.6} className="shrink-0" style={{ color: accent }} />
      )}
    </button>
  );
}

function DropdownPicker({
  options,
  selected,
  onToggle,
  placeholder,
  emptyLabel,
  ariaLabel,
  single = false,
  topOptions = [],
  side = "bottom",
}: {
  options: MultiPickerOption[];
  selected: string[];
  onToggle: (id: string) => void;
  placeholder: string;
  emptyLabel: string;
  ariaLabel?: string;
  /** One pick closes the menu; the trigger shows the pick, not chips. */
  single?: boolean;
  /** Rows above the categories, picked directly (e.g. "type it yourself"). */
  topOptions?: MultiPickerOption[];
  /** "right" hangs the panel beside the trigger instead of under it. */
  side?: "bottom" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [menuStyle, setMenuStyle] = useState<FloatingMenuStyle | null>(null);
  // ONE PANEL THAT NAVIGATES (Anir, Aug 17: "when I click on a category it
  // should go there, not have 2 separate tables — just one table"): clicking
  // a category swaps the SAME panel to that category's options, with a back
  // row on top. No fly-out, no accordion.
  const [level, setLevel] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);
  const q = query.trim().toLowerCase();
  const searching = q.length > 0;

  // Categories keep the order the options arrived in.
  const groups = useMemo(() => {
    const out: { name: string; items: MultiPickerOption[] }[] = [];
    const index = new Map<string, number>();
    for (const o of options) {
      const name = o.group ?? "";
      if (!index.has(name)) {
        index.set(name, out.length);
        out.push({ name, items: [] });
      }
      out[index.get(name)!].items.push(o);
    }
    return out;
  }, [options]);
  const grouped = groups.some((g) => g.name !== "");

  const pick = (id: string) => {
    onToggle(id);
    if (single) {
      setLevel(null);
      setOpen(false);
    }
  };

  const matches = (o: MultiPickerOption) =>
    !q ||
    o.label.toLowerCase().includes(q) ||
    (o.sub ?? "").toLowerCase().includes(q) ||
    (o.group ?? "").toLowerCase().includes(q);

  // The flat list a search shows, hoisted so Enter can commit the top row
  // (Anir, Aug 20: "when I press Enter on all these dropdowns with the search
  // bar, it has to pick the first"). An exactly-typed label wins over row
  // order, so typing a full name never lands on a longer one above it.
  const searchHits = [...topOptions, ...options].filter(matches);
  const enterPick =
    searchHits.find((o) => o.label.trim().toLowerCase() === q) ?? searchHits[0];

  const toggleMenu = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = ref.current?.getBoundingClientRect();
    // Wide enough that "Lead Generation and Outreach" never ellipsizes
    // (Anir: "make it longer so there's no ...").
    if (rect) setMenuStyle(sideStyle(rect));
    setQuery("");
    setLevel(null);
    setOpen(true);
  };

  /** Panel placement: beside the trigger when side="right" and there is
   *  room, else the usual below/above from floatingMenuStyle. */
  const sideStyle = (rect: DOMRect): FloatingMenuStyle => {
    /* A NAME IS NOT 900 PIXELS WIDE (Anir, Aug 28: "this need not be so long,
       the checkmark so far away from name").

       The menu took the trigger's width, which was fine while these forms were
       640px and absurd once they went to 980: a list of people stretched the
       full dialog and threw the tick to the far edge, a hand-span from the
       name it belonged to. 400 is the floor a name and a role need; 520 is as
       wide as a list of names can usefully get. Between them it still follows
       the field, so a narrow picker is unchanged. */
    const width = Math.min(Math.max(side === "right" ? 400 : rect.width, 400), 520);
    if (side === "right") {
      const edge = 12;
      const maxHeight = Math.min(440, window.innerHeight - edge * 2);
      if (rect.right + 8 + width <= window.innerWidth - edge) {
        return {
          position: "fixed",
          left: rect.right + 8,
          top: Math.max(edge, Math.min(rect.top, window.innerHeight - maxHeight - edge)),
          width,
          maxHeight,
        };
      }
      if (rect.left - width - 8 >= edge) {
        return {
          position: "fixed",
          left: rect.left - width - 8,
          top: Math.max(edge, Math.min(rect.top, window.innerHeight - maxHeight - edge)),
          width,
          maxHeight,
        };
      }
    }
    return floatingMenuStyle(rect, width, 260);
  };

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        ref.current &&
        !ref.current.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setLevel(null);
        setOpen(false);
      }
    };
    /* ESCAPE DISMISSES THIS MENU AND STOPS THERE.
       It reached the Modal's own Escape handler as well, so tapping Escape to
       back out of a picker threw away the whole half-filled form behind it —
       found in the browser on Aug 28, filling the new-meeting form: one press
       closed the dropdown AND the dialog, and everything typed was gone.

       ColorSelect was given this exact guard on Aug 22 and MultiPicker never
       was, which is the second time today the two picker components have
       differed on something that should be identical in both. */
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      e.preventDefault();
      // Escape steps BACK first, then closes.
      setLevel((prev) => {
        if (prev !== null) return null;
        setOpen(false);
        return null;
      });
    };
    const onResize = () => {
      setLevel(null);
      setOpen(false);
    };
    // Fixed-position menu, measured at open — re-anchor on scroll so it never
    // strands mid-viewport (same lesson as ColorSelect, Aug 8). The fly-out
    // just closes: its row may have scrolled anywhere.
    const onScroll = () => {
      const rect = ref.current?.getBoundingClientRect();
      if (!rect) return;
      setMenuStyle(() => sideStyle(rect));
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

  let rowIndex = 0;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggleMenu}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel ?? placeholder}
        className="flex min-h-[40px] w-full cursor-pointer items-center gap-2 rounded-lg border border-border-light bg-white px-3 py-1.5 text-left text-[13px] transition-[border-color,box-shadow] hover:border-blue-subtle focus:border-blue-primary focus:shadow-input-focus focus:outline-none"
      >
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {selected.length === 0 ? (
            <span className="text-text-tertiary">{placeholder}</span>
          ) : single ? (
            (() => {
              const o =
                byId.get(selected[0]) ??
                topOptions.find((t) => t.id === selected[0]);
              const Icon = o?.icon;
              const c = o?.color ?? "#0071E3";
              return (
                <span className="flex min-w-0 items-center gap-2 text-text-primary">
                  {Icon && (
                    <span
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md"
                      style={{ background: c, color: "#fff" }}
                    >
                      <Icon size={12} strokeWidth={2.2} />
                    </span>
                  )}
                  <span className="truncate">{o?.label ?? selected[0]}</span>
                </span>
              );
            })()
          ) : (
            selected.map((id) => {
              const o = byId.get(id);
              const Icon = o?.icon;
              const c = o?.color;
              return (
                <span
                  key={id}
                  role="button"
                  tabIndex={0}
                  title="Remove"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggle(id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      onToggle(id);
                    }
                  }}
                  className={cnChip(c)}
                  style={c ? { background: `${c}16`, color: c } : undefined}
                >
                  {/* THE FOURTH PLACE THIS DRAWS A CHIP, and the one that was
                      still wrong (Anir, Aug 28: "profile pictures here too").
                      The chips shown INSIDE the closed field only ever drew an
                      icon, so the same person wore a face in the menu and
                      nothing at all once picked. All four sites read the same
                      three marks now, in the same order. */}
                  {o?.avatarName ? (
                    <Avatar name={o.avatarName} className="h-[18px] w-[18px] shrink-0 text-[7px]" />
                  ) : o?.logoName ? (
                    <CompanyLogo name={o.logoName} className="h-[18px] w-[18px] shrink-0 text-[7px]" />
                  ) : (
                    Icon && <Icon size={11} strokeWidth={2.5} aria-hidden="true" />
                  )}
                  {o?.label ?? id}
                  <X size={11} strokeWidth={2.8} className="opacity-70 group-hover:opacity-100" />
                </span>
              );
            })
          )}
        </span>
        <ChevronDown
          size={15}
          strokeWidth={2}
          className={cn(
            "shrink-0 transition-[transform,color] duration-[240ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
            open ? "rotate-180 text-blue-primary" : "text-text-tertiary"
          )}
        />
      </button>

      {open && menuStyle && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            aria-label={ariaLabel ?? placeholder}
            aria-multiselectable
            className="menu-in z-[110] overflow-y-auto overflow-x-hidden rounded-lg border border-border-light bg-white p-1.5 shadow-[0_18px_48px_-16px_rgba(15,23,42,0.34)]"
            style={{ ...menuStyle, ...menuMotionVars(menuStyle) }}
          >
            <div className="sticky -top-1.5 z-10 -mx-1.5 -mt-1.5 mb-1 border-b border-border-light bg-white p-1.5">
              <div className="flex items-center gap-1.5 rounded-md bg-surface px-2 py-1.5">
                <Search size={13} strokeWidth={2.2} className="shrink-0 text-text-tertiary" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setLevel(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    /* Consumed here — see ColorSelect for why the palette
                       shortcut must never see this keystroke. */
                    e.stopPropagation();
                    e.nativeEvent?.stopImmediatePropagation?.();
                    if (!searching || !enterPick) return;
                    pick(enterPick.id);
                    // A single-pick menu closes itself in `pick`; a multi
                    // stays up, so clear the box and type the next name.
                    if (!single) setQuery("");
                  }}
                  placeholder="Search…"
                  aria-label={`Search ${ariaLabel ?? "options"}`}
                  className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-text-tertiary"
                />
              </div>
            </div>

            {options.length === 0 ? (
              <p className="px-2.5 py-2 text-[12px] text-text-tertiary">{emptyLabel}</p>
            ) : searching || !grouped ? (
              // Typing shows every matching option at once, flat — search
              // cuts across categories.
              searchHits.map((o) => (
                <OptionRow
                  key={o.id}
                  o={o}
                  on={selected.includes(o.id)}
                  onPick={() => pick(o.id)}
                  rowIndex={rowIndex++}
                />
              ))
            ) : level !== null ? (
              <>
                {/* Inside a category: a back row, then its options — the
                    SAME panel, navigated. */}
                <button
                  type="button"
                  onClick={() => setLevel(null)}
                  className="mb-0.5 flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] font-bold uppercase tracking-[0.04em] text-text-secondary transition-colors hover:bg-surface"
                >
                  <ChevronLeft size={14} strokeWidth={2.4} className="shrink-0" />
                  {level}
                </button>
                {(groups.find((g) => g.name === level)?.items ?? []).map((o) => (
                  <OptionRow
                    key={o.id}
                    o={o}
                    on={selected.includes(o.id)}
                    onPick={() => pick(o.id)}
                    rowIndex={rowIndex++}
                  />
                ))}
              </>
            ) : (
              <>
                {topOptions.map((o) => (
                  <OptionRow
                    key={o.id}
                    o={o}
                    on={selected.includes(o.id)}
                    onPick={() => pick(o.id)}
                    rowIndex={rowIndex++}
                  />
                ))}
                {/* One row per category — clicking GOES THERE (Anir: "when I
                    click on a category it should go there… just one table"),
                    full names, never an ellipsis. */}
                {groups.map((g) => {
                  if (!g.name) return null;
                  const pickedHere = g.items.filter((o) => selected.includes(o.id)).length;
                  const head = g.items[0];
                  const accent = head?.color || "#0071E3";
                  const HeadIcon = head?.icon;
                  return (
                    <button
                      key={g.name}
                      type="button"
                      onClick={() => setLevel(g.name)}
                      className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-surface"
                    >
                      {HeadIcon ? (
                        <span
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md"
                          style={{ background: `${accent}16`, color: accent }}
                        >
                          <HeadIcon size={12} strokeWidth={2.4} />
                        </span>
                      ) : (
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: accent }} />
                      )}
                      <span className="min-w-0 flex-1 whitespace-normal text-[12px] font-bold uppercase leading-snug tracking-[0.04em]" style={{ color: accent }}>
                        {g.name}
                      </span>
                      <span className="shrink-0 text-[11px] font-semibold text-text-tertiary tnum">
                        {pickedHere > 0 ? `${pickedHere} of ${g.items.length}` : g.items.length}
                      </span>
                      <ChevronRight size={13} strokeWidth={2.2} className="shrink-0 text-text-tertiary" />
                    </button>
                  );
                })}
              </>
            )}
            {options.length > 0 &&
              searching &&
              options.filter(matches).length === 0 && (
                <p className="px-2.5 py-2 text-[12px] text-text-tertiary">
                  Nothing matches &quot;{query.trim()}&quot;.
                </p>
              )}
          </div>,
          document.body
        )}


    </div>
  );
}

export function MultiPicker({
  options,
  selected,
  onToggle,
  placeholder,
  emptyLabel,
  variant = "inline",
  ariaLabel,
  single = false,
  topOptions,
  side,
}: {
  options: MultiPickerOption[];
  selected: string[];
  onToggle: (id: string) => void;
  placeholder: string;
  emptyLabel: string;
  /** "dropdown" = closed ColorSelect-style trigger + floating grouped menu. */
  variant?: "inline" | "dropdown";
  ariaLabel?: string;
  /** Dropdown variant only: one pick closes the menu. */
  single?: boolean;
  /** Dropdown variant only: direct-pick rows above the categories. */
  topOptions?: MultiPickerOption[];
  /** Dropdown variant only: "right" hangs the panel beside the trigger. */
  side?: "bottom" | "right";
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);
  const q = query.trim().toLowerCase();
  const matches = useMemo(
    () =>
      options
        .filter((o) => !selected.includes(o.id))
        .filter(
          (o) =>
            !q ||
            o.label.toLowerCase().includes(q) ||
            (o.sub ?? "").toLowerCase().includes(q)
        )
        .slice(0, 40),
    [options, selected, q]
  );

  if (variant === "dropdown")
    return (
      <DropdownPicker
        options={options}
        selected={selected}
        onToggle={onToggle}
        placeholder={placeholder}
        emptyLabel={emptyLabel}
        ariaLabel={ariaLabel}
        single={single}
        topOptions={topOptions}
        side={side}
      />
    );

  return (
    <div className="rounded-lg border border-border-light bg-white p-2">
      {selected.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selected.map((id) => {
            const o = byId.get(id);
            const Icon = o?.icon;
            const c = o?.color;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onToggle(id)}
                title="Remove"
                className={cnChip(c)}
                style={c ? { background: `${c}16`, color: c } : undefined}
              >
                {o?.avatarName ? (
                  <Avatar name={o.avatarName} className="h-[18px] w-[18px] shrink-0 text-[7px]" />
                ) : o?.logoName ? (
                  <CompanyLogo name={o.logoName} className="h-[18px] w-[18px] shrink-0 text-[7px]" />
                ) : (
                  Icon && <Icon size={11} strokeWidth={2.5} aria-hidden="true" />
                )}
                {o?.label ?? id}
                <X size={11} strokeWidth={2.8} className="opacity-70 group-hover:opacity-100" />
              </button>
            );
          })}
        </div>
      )}
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        /* The dropdown variant above already commits the top row on Enter;
           the inline one never did (Anir, Aug 22: "when I press enter it
           chooses the first option, any dropdown"). */
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            return;
          }
          if (e.key !== "Enter") return;
          const top = matches[0];
          if (!top) return;
          e.preventDefault();
          e.stopPropagation();
          e.nativeEvent?.stopImmediatePropagation?.();
          onToggle(top.id);
          setQuery("");
        }}
        placeholder={selected.length ? "Add another…" : placeholder}
        className="h-[34px] w-full rounded-lg border border-border-light bg-white px-2.5 text-[12.5px] outline-none focus:border-blue-subtle"
      />
      {open && (
        <div className="mt-1.5 max-h-[168px] overflow-y-auto rounded-lg border border-border-light">
          {options.length === 0 ? (
            <p className="px-2.5 py-2 text-[12px] text-text-tertiary">{emptyLabel}</p>
          ) : matches.length === 0 ? (
            <p className="px-2.5 py-2 text-[12px] text-text-tertiary">
              {q ? `Nothing matches "${query.trim()}".` : "All of them are already on this deal."}
            </p>
          ) : (
            matches.map((o) => (
              <button
                key={o.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onToggle(o.id);
                  setQuery("");
                }}
                className="flex w-full cursor-pointer items-center gap-2 px-2.5 py-1.5 text-left text-[12.5px] text-text-primary transition-colors hover:bg-surface"
              >
                {o.avatarName ? (
                  <Avatar name={o.avatarName} className="h-6 w-6 shrink-0 text-[8px]" />
                ) : o.logoName ? (
                  <CompanyLogo name={o.logoName} className="h-6 w-6 shrink-0 text-[8px]" />
                ) : o.icon ? (
                  <o.icon
                    size={13}
                    strokeWidth={2.4}
                    aria-hidden="true"
                    className="shrink-0"
                    style={{ color: o.color ?? "#8E98A8" }}
                  />
                ) : o.color ? (
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: o.color }}
                  />
                ) : null}
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {o.sub && (
                  <span className="shrink-0 text-[11px] text-text-tertiary tnum">
                    {o.sub}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
