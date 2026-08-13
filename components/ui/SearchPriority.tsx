"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Search } from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";

/**
 * Search priority — one shared mechanism, adopted by every list toolbar.
 *
 * Suren's ask (Jul 27): "When I press the search bar, the stuff to the right of
 * it gets compressed. The search bar takes priority. The All Roles dropdown
 * changes to just the dot, the Name A–Z dropdown to just the icon… so there's
 * space for the search bar if there's a long name."
 *
 * So: the moment the search owns the row (focused, or holding a query) every
 * control to its right sheds its words and keeps its colour + glyph. Nothing is
 * hidden and nothing stops working — a collapsed control still opens its menu,
 * still announces its full label to a screen reader, and still explains itself
 * on hover. On blur with an empty box, the row springs back.
 *
 * How the motion stays smooth (no measuring, no layout jank):
 *  - the label collapses via a grid track (1fr → 0fr), which interpolates the
 *    element's *own content width* exactly, so the control shrinks in step;
 *  - the control's `min-width` animates px → px alongside it;
 *  - padding and flex-grow animate too, so the glyph lands dead-centre in the
 *    square instead of hugging the left edge.
 * Every transition is `motion-reduce:transition-none`, so under
 * `prefers-reduced-motion` the compression is instant — the same wholesale
 * stance app/globals.css takes on entrance animation.
 */

type SearchPriorityValue = {
  /** True while the search owns the row. */
  active: boolean;
  setFocused: (focused: boolean) => void;
};

const SearchPriorityContext = createContext<SearchPriorityValue | null>(null);

/** True when the toolbar's search has priority and controls should compact. */
export function useSearchPriority(): boolean {
  return useContext(SearchPriorityContext)?.active ?? false;
}

/**
 * The compressed state, but only once the motion has settled. Hover tooltips
 * mount on this rather than on the raw flag: swapping a wrapper element around
 * a control mid-transition would remount it and snap the animation, so the
 * explain-on-hover layer waits for the row to come to rest.
 */
export function usePrioritySettled(): boolean {
  const active = useSearchPriority();
  const [settled, setSettled] = useState(active);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(active), SP_DURATION_MS + 60);
    return () => clearTimeout(timer);
  }, [active]);
  return settled;
}

export const SP_DURATION_MS = 240;

/** Shared timing/curve. Arbitrary values carry no spaces (Tailwind rule). */
const SP_MOTION =
  "duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none";

/** The square a collapsed control shrinks to — matches the h-10 control row. */
export const SP_COMPACT_SIZE = 40;

/**
 * Wrap a toolbar row. Renders the row itself (no extra layout layer) and tells
 * everything inside whether the search currently has priority.
 */
export function SearchPriority({
  query,
  className,
  style,
  children,
}: {
  /** The live search text — a non-empty box keeps the row compressed. */
  query: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  /**
   * FOCUS ALONE DECIDES (Anir, Aug 13: "when I click outside the search bar,
   * it should go away" → "when I type something, I think the search bar should
   * go away when i click away").
   *
   * It used to stay expanded while the box held any text, so the toolbar was
   * stuck in its compressed, icon-only state for as long as a filter was
   * applied — you could not read the filters you were using. Clicking away now
   * always springs the row back; the query itself is untouched, and the
   * results stay filtered.
   */
  const active = focused;
  const value = useMemo<SearchPriorityValue>(
    () => ({ active, setFocused }),
    [active]
  );
  return (
    <SearchPriorityContext.Provider value={value}>
      <div className={className} style={style}>
        {children}
      </div>
    </SearchPriorityContext.Provider>
  );
}

/**
 * The search box that claims the space. Grows into the width its neighbours
 * give up; focusing it (mouse OR Tab) starts the compression, Escape clears and
 * releases it.
 */
export function PrioritySearchInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
  width = 190,
  expandedWidth = 320,
  grow = false,
  growMaxWidth,
  growExpandedMaxWidth,
  className,
  inputClassName,
  iconClassName,
  iconSize = 15,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  ariaLabel?: string;
  /** Resting width in px. Ignored when `grow` is set. */
  width?: number;
  /** Width once the search has priority. Ignored when `grow` is set. */
  expandedWidth?: number;
  /** For toolbars where the box is already `flex-1` — it simply absorbs the
   *  space the compressed controls release, so no width animation is needed. */
  grow?: boolean;
  /** A `grow` box that is capped: the cap itself lifts when search takes
   *  priority. Omit both to leave an uncapped `flex-1` box alone. */
  growMaxWidth?: number;
  growExpandedMaxWidth?: number;
  className?: string;
  inputClassName?: string;
  iconClassName?: string;
  iconSize?: number;
}) {
  const handle = useContext(SearchPriorityContext);
  const active = handle?.active ?? false;
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      className={cn(
        "relative min-w-0 transition-[width,max-width]",
        SP_MOTION,
        className
      )}
      style={
        grow
          ? growMaxWidth === undefined
            ? undefined
            : {
                maxWidth:
                  active && growExpandedMaxWidth !== undefined
                    ? growExpandedMaxWidth
                    : growMaxWidth,
              }
          : { width: active ? expandedWidth : width }
      }
    >
      <Search
        size={iconSize}
        strokeWidth={1.6}
        aria-hidden="true"
        // `cn` is a plain join (no tailwind-merge), so the overridable bits are
        // *replaced*, never appended — otherwise `left-2.5 left-3` would settle
        // by stylesheet order rather than by intent.
        className={cn(
          "pointer-events-none absolute top-1/2 -translate-y-1/2 text-text-tertiary",
          iconClassName ?? "left-2.5"
        )}
      />
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => handle?.setFocused(true)}
        onBlur={() => handle?.setFocused(false)}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          // Escape empties the box and hands the row back — the same restore
          // you get by clicking away from an empty search.
          event.preventDefault();
          if (value) onChange("");
          inputRef.current?.blur();
        }}
        placeholder={placeholder}
        aria-label={ariaLabel}
        // Replaced wholesale, not merged — see the note on the icon above.
        className={
          inputClassName ??
          "w-full text-[13px] bg-surface border border-border rounded-md pl-8 pr-3 py-2 outline-none focus:border-blue-primary"
        }
      />
    </div>
  );
}

/**
 * A stretch of label text that collapses to nothing when the search takes over.
 * The grid track does the work, so the width it gives up is exactly the width
 * the text occupied — no measuring, no guessed max-widths, no "…".
 */
export function PriorityLabel({
  children,
  className,
  style,
  collapsed,
  /** Leading gap that collapses with the text, so the glyph ends up centred. */
  gap = "ml-2",
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Override the context (used where a control opts out of compacting). */
  collapsed?: boolean;
  gap?: string | false;
}) {
  const contextCollapsed = useSearchPriority();
  const off = collapsed ?? contextCollapsed;
  return (
    <span
      data-collapsed={off ? "true" : "false"}
      style={style}
      className={cn(
        // `flex-grow` is in the list on purpose: where this label is the
        // flex-1 filler of a control (ColorSelect), releasing its slack must
        // interpolate too. Snapping grow 1→0 would collapse the box in one
        // frame and the glyph would jump to centre instead of gliding there.
        "grid transition-[grid-template-columns,opacity,margin,flex-grow] motion-reduce:transition-none",
        SP_MOTION,
        off ? "grid-cols-[0fr] opacity-0" : "grid-cols-[1fr] opacity-100",
        gap && (off ? "ml-0" : gap),
        className
      )}
    >
      <span className="min-w-0 overflow-hidden whitespace-nowrap">
        {children}
      </span>
    </span>
  );
}

/**
 * Explains a collapsed control on hover using the app's shared portal tooltip.
 * Only mounts once the row has settled, so it never interrupts the motion.
 */
export function PriorityTooltip({
  label,
  children,
  className,
  side = "bottom",
  /** True while this control's own menu is open — then the tooltip is muted.
   *  A compressed filter's tooltip sits directly under the trigger, which is
   *  exactly where its menu opens, so it landed on top of the options (Anir,
   *  Aug 13: "careful here because this pop-up is blocking it when the search
   *  bar is like that"). You already know what you clicked. */
  suppressed = false,
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
  side?: "top" | "bottom";
  suppressed?: boolean;
}) {
  const settled = usePrioritySettled();
  if (!settled || suppressed) return <>{children}</>;
  return (
    <Tooltip label={label} side={side} className={className}>
      {children}
    </Tooltip>
  );
}
