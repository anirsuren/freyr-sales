"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Activity,
  BadgeDollarSign,
  Check,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Handshake,
  Hash,
  Magnet,
  Percent,
  Search,
  ShieldCheck,
  Minus,
  ShieldQuestion,
  ShieldX,
  Sparkles,
  TrendingDown,
  TrendingUp,
  UserPlus,
  UserRound,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { useCurrentUserOrNull } from "@/components/auth/CurrentUserProvider";
import { cn } from "@/lib/utils";
import {
  ENTRY_COLOR,
  entryStatus,
  entryStatusLabel,
  isPending,
  fmtAmount,
  goalFamilyActuals,
  pctMet,
  yearElapsed,
  type GoalUnit,
  type Pace,
  type PerformanceState,
  type PrimaryGoal,
} from "@/lib/performanceShared";
import { BarChart } from "@/components/charts/Charts";

/**
 * Shared chips, pills and bars for the Performance module. Goal types are
 * color+icon coded (house rule: no plain gray tags); pace and verification
 * use the reserved status colours because they ARE status.
 */

type TypeMeta = { color: string; icon: LucideIcon };

const TYPE_META_BY_NAME: Record<string, TypeMeta> = {
  "financial and revenue performance": {
    color: "#0F766E",
    icon: BadgeDollarSign,
  },
  "lead generation and outreach": { color: "#0071E3", icon: Magnet },
  "sales activity & engagement": { color: "#B4318F", icon: Activity },
  "proposal & deal execution": { color: "#C2410C", icon: Handshake },
};

const FALLBACK_TYPE_COLORS = ["#6D28D9", "#0EA5E9", "#DB2777", "#4F46E5"];

export function typeMeta(type: string): TypeMeta {
  const hit = TYPE_META_BY_NAME[type.trim().toLowerCase()];
  if (hit) return hit;
  let h = 0;
  for (let i = 0; i < type.length; i++) h = (h * 31 + type.charCodeAt(i)) >>> 0;
  return {
    color: FALLBACK_TYPE_COLORS[h % FALLBACK_TYPE_COLORS.length],
    icon: Sparkles,
  };
}

/** The colored icon square that fronts goal cards and rows — same visual
 *  language as the Offerings catalog tiles. */
export function TypeIconTile({
  type,
  className,
}: {
  type: string;
  className?: string;
}) {
  const meta = typeMeta(type);
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
        className
      )}
      style={{ color: meta.color, background: `${meta.color}14` }}
    >
      <Icon size={18} strokeWidth={2} />
    </span>
  );
}

export function TypeChip({
  type,
  size = "md",
}: {
  type: string;
  size?: "sm" | "md";
}) {
  const meta = typeMeta(type);
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-semibold",
        size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[10.5px]"
      )}
      style={{ color: meta.color, background: `${meta.color}14` }}
    >
      <Icon size={size === "sm" ? 10 : 11} strokeWidth={2.2} />
      {type}
    </span>
  );
}

/**
 * A person picker that looks like people (Anir: "I know you need the profile
 * pictures here, not the blue dots"). Real headshots, a search box for long
 * rosters, and — when nobody matches — a "use this name" row so free text
 * still works.
 */
export function PersonSelect({
  value,
  onChange,
  people,
  placeholder = "Pick a person…",
  allowFree = true,
  roles,
  meName,
}: {
  value: string;
  onChange: (next: string) => void;
  people: string[];
  placeholder?: string;
  allowFree?: boolean;
  /** Marks the reader's own name "(you)", the way every other picker in the
   *  app does (Anir, Aug 19: "it should say that it's me, right?"). */
  meName?: string;
  /** Name → workspace role, shown beside each name so you pick a person, not
   *  a string (Anir, Aug 15: "it should show a role"). */
  roles?: Record<string, string>;
}) {
  /* Every picker marks you, not just the ones whose caller happened to pass a
     name down: the assign-a-person and subgoal pickers sat next to the log
     form saying "Anir Suren" while that one said "Anir Suren (you)". */
  const signedIn = useCurrentUserOrNull();
  const myName = meName ?? signedIn?.name ?? "";
  const isMe = (n: string) =>
    !!myName && n.trim().toLowerCase() === myName.trim().toLowerCase();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties | null>(null);
  const [listMax, setListMax] = useState(320);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  /** The menu renders in a PORTAL with fixed positioning so no ancestor's
   *  overflow-hidden can clip it — inside the inline goal expansion the old
   *  absolute menu was cut off after one row (Anir, Aug 12: "I can't
   *  see"). */
  const anchorMenu = () => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const spaceBelow = window.innerHeight - rect.bottom;
    const below = spaceBelow > 300;
    // The LIST fits the space that is actually there. A fixed 320px cap let
    // the menu run past the bottom of the screen and slice the last person in
    // half (Anir, Aug 18: "this last guy is clearly getting cut off") — now
    // the panel stops short of the edge and the roster scrolls inside it.
    const room = (below ? spaceBelow : rect.top) - 18;
    const searchRow = people.length > 6 ? 41 : 0;
    setListMax(Math.max(180, Math.min(320, room - searchRow)));
    setMenuStyle({
      position: "fixed",
      left: rect.left,
      width: rect.width,
      top: below ? rect.bottom + 6 : undefined,
      bottom: below ? undefined : window.innerHeight - rect.top + 6,
      zIndex: 200,
    });
  };

  useEffect(() => {
    if (!open) return;
    anchorMenu();
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!ref.current?.contains(target) && !menuRef.current?.contains(target))
        setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onScroll = () => anchorMenu();
    const onResize = () => setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, { capture: true } as EventListenerOptions);
      window.removeEventListener("resize", onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const q = query.trim().toLowerCase();
  /* YOU COME FIRST (Anir, Aug 22: "if you think people are always going to
     choose themselves, have it always be the first option"). The rest keeps
     its incoming order; the sort is stable. */
  const matches = people
    .filter((p) => !q || p.toLowerCase().includes(q))
    .sort((a, b) => Number(isMe(b)) - Number(isMe(a)));
  const exact = people.some((p) => p.toLowerCase() === q);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          // Position first, THEN show: anchoring used to run an effect late,
          // so the menu painted one frame at the wrong spot and jumped
          // (Anir, Aug 12: "it glitches... like a frame stutter").
          if (!open) anchorMenu();
          setOpen((v) => !v);
          setQuery("");
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-[40px] w-full cursor-pointer items-center gap-2 rounded-lg border border-border-light bg-white px-2.5 text-left transition-colors hover:border-blue-subtle"
      >
        {value ? (
          <>
            <Avatar name={value} className="h-6 w-6 text-[9px]" />
            <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-text-primary">
              {value}
              {isMe(value) && (
                <span className="ml-1.5 inline-flex shrink-0 items-center rounded-full bg-blue-light px-1.5 py-[1px] align-[1px] text-[9.5px] font-bold uppercase tracking-[0.04em] text-blue-primary">You</span>
              )}
            </span>
          </>
        ) : (
          <span className="min-w-0 flex-1 truncate text-[13.5px] text-text-tertiary">
            {placeholder}
          </span>
        )}
        <ChevronDown
          size={14}
          strokeWidth={2.2}
          className={cn(
            "shrink-0 text-text-tertiary transition-transform",
            open && "rotate-180 text-blue-primary"
          )}
        />
      </button>
      {open &&
        menuStyle !== null &&
        typeof document !== "undefined" &&
        createPortal(
        <div
          ref={menuRef}
          role="listbox"
          style={menuStyle ?? undefined}
          className="menu-in overflow-hidden rounded-xl border border-border-light bg-white shadow-[0_16px_48px_-12px_rgba(0,0,0,0.22)]"
        >
          {people.length > 6 && (
            <div className="flex items-center gap-1.5 border-b border-border-light px-2.5 py-2">
              <Search size={13} strokeWidth={2.2} className="text-text-tertiary" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                /* Same house rule as every other searchable dropdown: Enter
                   commits the top match (Anir, Aug 22). */
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
                  onChange(top);
                  setOpen(false);
                }}
                placeholder="Search people…"
                className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-text-tertiary"
              />
            </div>
          )}
          <div style={{ maxHeight: listMax }} className="overflow-y-auto p-1">
            {matches.map((p) => (
              <button
                key={p}
                type="button"
                role="option"
                aria-selected={p === value}
                onClick={() => {
                  onChange(p);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors",
                  p === value ? "bg-[rgba(0,113,227,0.07)]" : "hover:bg-surface"
                )}
              >
                <Avatar name={p} className="h-6 w-6 text-[9px]" />
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-text-primary">
                  {p}
                  {isMe(p) && (
                    <span className="ml-1.5 inline-flex shrink-0 items-center rounded-full bg-blue-light px-1.5 py-[1px] align-[1px] text-[9.5px] font-bold uppercase tracking-[0.04em] text-blue-primary">You</span>
                  )}
                </span>
                {roles?.[p.trim()] && <RoleChip role={roles[p.trim()]} />}
                {p === value && (
                  <Check size={13} strokeWidth={2.6} className="shrink-0 text-blue-primary" />
                )}
              </button>
            ))}
            {matches.length === 0 && !allowFree && (
              <p className="px-2 py-2 text-[12px] text-text-tertiary">
                Nobody matches that.
              </p>
            )}
            {allowFree && q && !exact && (
              <button
                type="button"
                onClick={() => {
                  onChange(query.trim());
                  setOpen(false);
                }}
                className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[rgba(0,113,227,0.10)] text-blue-primary">
                  <UserPlus size={12} strokeWidth={2.2} />
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-blue-primary">
                  Use &ldquo;{query.trim()}&rdquo;
                </span>
              </button>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

/**
 * The tracking switch (Anir: "that should probably be more like a toggle").
 * ON = the goal is counted and shown on Org performance; OFF = it stays on
 * the master list only. His concept, his words: "these goals, right now we
 * are going to pick it up as an org goal... I may have some goals I don't
 * want to track here."
 */
export function TrackSwitch({
  on,
  onToggle,
  disabled = false,
  withLabel = false,
}: {
  on: boolean;
  onToggle?: () => void;
  disabled?: boolean;
  /** Show "Tracking / Not tracked" text beside the switch. */
  withLabel?: boolean;
}) {
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={on ? "Tracking on Org performance" : "Not tracked"}
        title={
          on
            ? "Tracking. Counted and shown on Org performance. Click to stop tracking."
            : "Not tracked. Master list only. Click to start tracking it on Org performance."
        }
        disabled={disabled || !onToggle}
        onClick={(e) => {
          e.stopPropagation();
          onToggle?.();
        }}
        onKeyDown={(e) => e.stopPropagation()}
        className={cn(
          "relative h-[20px] w-[36px] shrink-0 rounded-full transition-colors",
          onToggle && !disabled ? "cursor-pointer" : "cursor-default opacity-70",
          on ? "bg-blue-primary" : "bg-[rgba(0,113,227,0.18)]"
        )}
      >
        <span
          className={cn(
            "absolute top-[2px] h-4 w-4 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25)] transition-all",
            on ? "left-[18px]" : "left-[2px]"
          )}
        />
      </button>
      {withLabel && (
        <span
          className={cn(
            "text-[11px] font-bold",
            on ? "text-blue-primary" : "text-text-tertiary"
          )}
        >
          {on ? "Tracking" : "Not tracked"}
        </span>
      )}
    </span>
  );
}

export function UnitChip({ unit }: { unit: GoalUnit }) {
  const meta =
    unit === "currency"
      ? { label: "Money", color: "#0F766E", icon: BadgeDollarSign }
      : unit === "percent"
        ? { label: "Percentage", color: "#6D28D9", icon: Percent }
        : { label: "Count", color: "#0071E3", icon: Hash };
  const Icon = meta.icon;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
      style={{ color: meta.color, background: `${meta.color}12` }}
    >
      <Icon size={10} strokeWidth={2.2} />
      {meta.label}
    </span>
  );
}

const PACE_META: Record<
  Pace,
  { label: string; color: string; icon: LucideIcon } | null
> = {
  met: { label: "Target met", color: "#16A34A", icon: CheckCircle2 },
  ahead: { label: "Ahead", color: "#16A34A", icon: TrendingUp },
  ontrack: { label: "On track", color: "#0071E3", icon: Activity },
  lagging: { label: "Lagging", color: "#DC2626", icon: TrendingDown },
  unset: null,
  /* A target with no schedule cannot be behind or ahead of anything. Saying
     "no schedule" is the honest verdict; the old code called it lagging
     against a line the app drew itself (Anir, Aug 16). */
  /* NEVER GRAY IN A GRAPH (Suren, the same rule that turned VIZ.slate from
     #8E98A8 into a real violet). This colour is not only a chip: it paints a
     slice and a legend dot in "Where the goals stand". Violet because the
     reserved status hues are spoken for — green met, blue on track, red
     lagging — and "nobody set a schedule" is not a verdict about the goal. */
  unscheduled: { label: "No schedule", color: "#A855F7", icon: CalendarClock },
};

export function PacePill({ pace, size = "md" }: { pace: Pace; size?: "sm" | "md" }) {
  const meta = PACE_META[pace];
  /**
   * A goal with no target gets NO pill at all (Anir, Aug 14: "you don't need
   * to say 'no target yet' either").
   *
   * It used to render a gray "no target yet" chip beside every goal name,
   * which was noise on a page where most goals have no target yet, and gray
   * besides. The Target column already says "Set target" on the same row, so
   * the fact was on screen twice.
   *
   * The bar chart keeps its own "no target yet" caption, which he asked to
   * leave: there the bar is 0% with nothing else to explain it.
   */
  if (!meta) return null;
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-bold",
        size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[10.5px]"
      )}
      style={{ color: meta.color, background: `${meta.color}14` }}
    >
      <Icon size={size === "sm" ? 10 : 11} strokeWidth={2.4} />
      {meta.label}
    </span>
  );
}

/** Manual yes/no, clickable in real mode: "I'll tell you when it is verified." */
export function VerifiedPill({
  verified,
  onToggle,
  nothingToVerify = false,
  size = "md",
}: {
  verified: boolean;
  onToggle?: () => void;
  /**
   * There is nothing logged here, so there is nothing to sign off (Anir,
   * Aug 19: "why is it asking me to even fucking verify this, bro? There's
   * nothing here"). Saying "Not verified" invited a decision that cannot be
   * made; this says why the button is missing instead.
   */
  nothingToVerify?: boolean;
  size?: "sm" | "md";
}) {
  const Icon = verified ? ShieldCheck : ShieldQuestion;
  if (!onToggle && nothingToVerify && !verified) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 whitespace-nowrap rounded-full font-semibold text-text-tertiary",
          size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[10.5px]"
        )}
        title="Nothing has been logged here yet, so there is nothing to verify."
      >
        <Minus size={size === "sm" ? 10 : 11} strokeWidth={2.4} />
        Nothing to verify
      </span>
    );
  }
  // Read-only chip: leadership hasn't opened the switch to this viewer.
  if (!onToggle) {
    return (
      <span
        className={cn(
          // whitespace-nowrap: "Not verified" is two words and the Verified
          // column is narrow, so it broke across two lines inside the pill and
          // made that one row taller than every other (Anir, Aug 14, with a
          // screenshot). The label is short; it should never wrap.
          "inline-flex items-center gap-1 whitespace-nowrap rounded-full font-bold",
          size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[10.5px]"
        )}
        style={
          verified
            ? { color: "#16A34A", background: "rgba(22,163,74,0.10)" }
            : { color: "#0058B0", background: "rgba(0,113,227,0.10)" }
        }
      >
        <Icon size={size === "sm" ? 10 : 11} strokeWidth={2.4} />
        {verified ? "Verified" : "Not verified"}
      </span>
    );
  }
  // Clickable: dress like a real button — border, shadow, hover fill, a
  // visible action (Anir, Aug 12: "this doesn't even look like a button").
  //
  // ONE LABEL AT A TIME (Anir, Aug 19: "it shouldn't say 'undo' and
  // 'verified' on the same thing. When I hover over it, it'll say it"). The
  // pill used to print its state AND its action side by side, so a signed-off
  // row read "Verified UNDO" — two contradictory words on one badge. Now the
  // resting label is the state and the hover label is what the click does,
  // and undoing turns the pill red because that is what it is: taking money
  // back out of the count.
  //
  // Both labels live in the same grid cell, so the pill is already as wide as
  // its widest word and swapping them cannot resize it mid-hover (Anir, Aug
  // 19 on the same swap in the claims table: "it glitches out, so it
  // shouldn't even be moving the table").
  const HoverIcon = verified ? ShieldX : ShieldCheck;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      title={
        verified
          ? "Leadership has signed this off. Click to undo"
          : "Click when leadership has checked this number"
      }
      className={cn(
        "group/vp inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border bg-white font-bold shadow-sm transition-all hover:-translate-y-px hover:shadow active:translate-y-0 active:shadow-none",
        verified
          ? "border-[rgba(22,163,74,0.35)] text-[#16A34A] hover:border-[rgba(220,38,38,0.45)] hover:bg-[rgba(220,38,38,0.08)] hover:text-[#DC2626]"
          // Fills light blue under the cursor rather than only swapping its
          // words (Anir, Aug 19: "should be light filled in blue when I hover
          // over it").
          : "border-[rgba(0,113,227,0.35)] text-[#0058B0] hover:border-blue-primary hover:bg-blue-light",
        size === "sm" ? "px-2 py-1 text-[10px]" : "px-2.5 py-1 text-[10.5px]"
      )}
    >
      <span className="grid shrink-0 place-items-center">
        <Icon
          size={size === "sm" ? 10 : 11}
          strokeWidth={2.4}
          className="col-start-1 row-start-1 group-hover/vp:opacity-0"
        />
        <HoverIcon
          size={size === "sm" ? 10 : 11}
          strokeWidth={2.4}
          className="col-start-1 row-start-1 opacity-0 group-hover/vp:opacity-100"
        />
      </span>
      <span className="grid">
        <span className="col-start-1 row-start-1 group-hover/vp:opacity-0">
          {verified ? "Verified" : "Not verified"}
        </span>
        <span className="col-start-1 row-start-1 opacity-0 group-hover/vp:opacity-100">
          {verified ? "Undo sign-off" : "Verify"}
        </span>
      </span>
    </button>
  );
}

export function MetPill({ met, size = "md" }: { met: boolean; size?: "sm" | "md" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-bold",
        size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[10.5px]"
      )}
      style={
        met
          ? { color: "#16A34A", background: "rgba(22,163,74,0.10)" }
          : { color: "#0071E3", background: "rgba(0,113,227,0.08)" }
      }
    >
      {met ? <CheckCircle2 size={size === "sm" ? 10 : 11} strokeWidth={2.4} /> : null}
      {met ? "Met" : "In progress"}
    </span>
  );
}

/**
 * The progress bar with the calendar marker: the fill is what's achieved, the
 * tick is where the year says you should be. Running-total goals only — a
 * ratio goal has no "should be by now".
 */
export function GoalBar({
  actual,
  target,
  year,
  unit,
  showExpected = true,
  pace,
  className,
}: {
  actual: number;
  target: number;
  year: number;
  unit: GoalUnit;
  showExpected?: boolean;
  pace: Pace;
  className?: string;
}) {
  const pct = Math.min(100, pctMet(actual, target));
  const expected = Math.min(100, yearElapsed(year) * 100);
  const color =
    pace === "lagging" ? "#DC2626" : pace === "ontrack" ? "#0071E3" : "#16A34A";
  return (
    <div className={cn("min-w-0", className)}>
      <div className="relative h-2 overflow-hidden rounded-full bg-[rgba(0,113,227,0.10)]">
        <div
          className="h-full rounded-full transition-[width] duration-700"
          style={{
            width: `${target > 0 ? pct : 0}%`,
            background: target > 0 ? color : undefined,
          }}
        />
        {showExpected && target > 0 && (
          <div
            title={`Where the calendar says you should be: ${Math.round(expected)}%`}
            className="absolute top-[-1px] h-[calc(100%+2px)] w-[2px] rounded-full bg-text-primary/55"
            style={{ left: `calc(${expected}% - 1px)` }}
          />
        )}
      </div>
      <p className="mt-1 flex items-baseline justify-between gap-2 text-[10.5px] text-text-tertiary">
        <span className="tnum">
          <span className="font-semibold text-text-primary">
            {fmtAmount(unit, actual)}
          </span>{" "}
          of {target > 0 ? fmtAmount(unit, target) : ", (no target yet)"}
        </span>
        {target > 0 && (
          <span className="tnum font-semibold" style={{ color }}>
            {Math.round(pctMet(actual, target))}%
          </span>
        )}
      </p>
    </div>
  );
}

/**
 * WHO SOMEONE IS, next to their name (Anir, Aug 15: "I feel like it should
 * show a role"). Colour and icon, never a bare grey word, same rule every
 * other tag in the app follows — and never red, amber or green, which mean
 * something here.
 */
const ROLE_META: Record<string, { label: string; color: string; icon: LucideIcon }> = {
  admin: { label: "Admin", color: "#7C3AED", icon: ShieldCheck },
  manager: { label: "Manager", color: "#0071E3", icon: UsersRound },
  rep: { label: "Rep", color: "#0F766E", icon: UserRound },
};

export function RoleChip({ role }: { role: string }) {
  // Same rule as RoleTag: an unrecognised role prints nothing, never a guess.
  if (!role || !role.trim()) return null;
  const meta = ROLE_META[role.trim().toLowerCase()];
  if (!meta) return null;
  const Icon = meta.icon;
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.04em]"
      style={{ background: `${meta.color}14`, color: meta.color }}
    >
      <Icon size={9} strokeWidth={2.6} />
      {meta.label}
    </span>
  );
}

/**
 * A GROUP NAME, EVERYWHERE IT APPEARS.
 *
 * Standing rule, restated by Anir on Aug 15 after finding a bare "test" in a
 * chart heading: "wherever it says test, it has to be the variable name...
 * it has to be blue with the icon for GROUP always." A group is a category,
 * and the category rule is colour AND icon, never plain text and never a
 * colour on its own.
 *
 * One component so the pill can never drift again: the chart headings, the
 * tiles, the drill-down boxes and the verification queue all render it.
 */
export function GroupPill({
  name,
  size = "md",
}: {
  name: string;
  /** "sm" for the dense drill-down boxes and the queue line. */
  size?: "sm" | "md";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-blue-light align-baseline font-bold text-blue-primary",
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-0.5 text-[12.5px]"
      )}
    >
      <UsersRound
        size={size === "sm" ? 10 : 12}
        strokeWidth={2.4}
        aria-hidden="true"
        className="shrink-0"
      />
      {name}
    </span>
  );
}


/**
 * WHERE YOU ARE AND WHERE YOU HAVE TO BE, on one line (Anir, Aug 15: "when I
 * hover over it, it'll show me a pop-up with an expanded version... it'll be
 * kind of like a timeline. It'll show me: I'm here, and this is where I have
 * to be. Very, very clear. Same thing for all three of these").
 *
 * The track is the whole target. The solid part is money that has been signed
 * off, the pale part is claimed and still waiting, and the marker is the
 * calendar: where this would have to stand today to be on time.
 */
/**
 * WHERE EACH NUMBER STARTS AND STOPS (Anir, Aug 20: "what does 80k + 120k
 * mean? ... Show a line: this is 80k, this is 120k. Like a vertical line, then
 * a horizontal line, and then a vertical line").
 *
 * The header pill said "$80K +$120K" and left you to work out which part of the
 * bar was which. This measures them: a bracket under each segment, exactly as
 * wide as the segment, with its own amount underneath in its own colour.
 */
export function SegmentBrackets({
  parts,
  unit,
}: {
  parts: { key: string; value: number; pct: number; color: string }[];
  unit: GoalUnit;
}) {
  const shown = parts.filter((p) => p.pct > 0.5 && p.value > 0);
  /* ONE SEGMENT STILL DESERVES ITS LABEL (Anir, Aug 20: "it doesn't even show
     me anything now" — a group with nothing verified and $250K sent back drew
     a bar with no bracket at all, so the only number near it was a $0).
     Two brackets exist to tell segments apart; one bracket still says what the
     bar is made of, which is the whole job. */
  if (shown.length < 1) return null;
  return (
    <div className="mt-1 flex w-full items-start" aria-hidden="true">
      {shown.map((p) => (
        <span
          key={p.key}
          className="min-w-0 shrink-0 px-[1.5px]"
          style={{ width: `${p.pct}%` }}
        >
          {/* THE TICKS POINT AT THE BAR (Anir, Aug 20: "do it the opposite
              way. The vertical lines should be pointing towards the bar").
              Drawn with the rule on top, the bracket opened downwards and
              read as a tray under the label instead of a measurement of the
              segment above it. Rule on the bottom, ticks rising to meet the
              bar they measure. */}
          <span
            className="block h-[5px] rounded-b-[2px] border-x-[1.5px] border-b-[1.5px]"
            style={{ borderColor: p.color }}
          />
          {/* A TRUNCATED AMOUNT IS NOT AN AMOUNT. The label was clipped to
              its segment's share of the bar, so a narrow slice printed "$8…"
              — the one thing the bracket exists to say. It stays on one line
              and is allowed to overrun its slice: centred on the bracket it
              measures, so it still reads as belonging to it. */}
          <span
            className="mt-[3px] block overflow-visible whitespace-nowrap text-center text-[10px] font-bold tnum"
            style={{ color: p.color }}
          >
            {fmtAmount(unit, p.value)}
          </span>
        </span>
      ))}
    </div>
  );
}

export function PaceTimeline({
  title,
  verified,
  awaiting,
  sentBack = 0,
  target,
  expectedPct,
  unit,
  accent = "#0071E3",
  compact = false,
  expected,
  expectedDueLabel,
  onSetSchedule,
}: {
  title: React.ReactNode;
  verified: number;
  awaiting: number;
  /**
   * The slice of `awaiting` that was SENT BACK rather than merely unread
   * (Anir, Aug 20: "I should be able to see blue and the red stripe, so I
   * don't see that reflected. It's confusing"). The chart above this panel
   * draws refused money in red; the drill-down was still calling it a pale
   * blue "claimed, not checked yet", which is the one reading it is not.
   */
  sentBack?: number;
  target: number;
  /** 0-100. Where the calendar says this should be today. */
  expectedPct: number;
  unit: "currency" | "count" | "percent";
  accent?: string;
  /**
   * Where the goal should be by today, when the pipeline can say. Given, the
   * marker sits on that number and the caption names its source; absent, it
   * falls back to the calendar share, which is only a reference (Anir, Aug 16:
   * the straight line "doesn't make any sense" for deals dated November).
   */
  expected?: number;
  /** When that figure was due, e.g. "30 Sep". */
  expectedDueLabel?: string;
  /** Offered when there is no schedule, so the sentence that names the gap can
   *  also close it (Anir, Aug 16: "if ur gonna say this u might as well put a
   *  button to take the user there"). */
  onSetSchedule?: () => void;
  /**
   * Drawn inside a narrow drill-down column instead of a 420px hover card
   * (Anir, Aug 16: "whatever you had when I hover over it, that's the same
   * thing that should show up here. I don't want this text. I want it visually
   * shown"). Same anatomy, smaller type, no minimum width, and no title — the
   * row it opens from already names the thing.
   */
  compact?: boolean;
}) {
  const pctOf = (n: number) =>
    target > 0 ? Math.min(100, Math.max(0, (n / target) * 100)) : 0;
  const vPct = pctOf(verified);
  const aPct = pctOf(verified + awaiting);
  /**
   * NOTHING IS DRAWN UNLESS SOMEBODY SET IT (Anir, Aug 16: "Who the fuck is
   * saying 'must be at 375K'? ... It shouldn't be you"). `expected` now comes
   * from the goal's own milestones. Absent, the track carries no marker and no
   * caption instead of a line the app made up.
   */
  const hasSchedule = expected !== undefined && expected > 0 && target > 0;
  const mustBe = expected ?? 0;
  const marker = hasSchedule
    ? Math.min(100, Math.max(0, (mustBe / target) * 100))
    : 0;
  const ahead = verified + awaiting - mustBe;

  /* THE FDL VERSION TIMELINE, FOR A NUMBER (Anir, Aug 15: "look at what you
   * did on the timeline for the FDL components. It looks a lot better.
   * Everything's so squished here. Use as much space as you need. Show me the
   * percent, show me what number you're at, and show me what number you have
   * to get to").
   *
   * Same anatomy as that timeline: every point on the track is a dot, its
   * label sits centred over that dot in its own lane, and the ends of the
   * track are labelled underneath. No black rule — the calendar is a dot like
   * everything else, and the end of the track carries one too, so the last
   * point does not look unfinished.
   *
   * NO LEADER LINES (Anir, Aug 16: "the lines r still weird", after three goes
   * at making them behave). A 5px stub between a label and the dot it belongs
   * to reads as a stray mark, and when the dot and the stub met it looked like
   * the line was stabbing the dot. The label is centred on its dot, which says
   * the same thing with nothing to misalign. */
  const LANE = compact ? 16 : 19;
  /**
   * A LABEL NEVER LEAVES THE BOX (Anir, Aug 16: "this looks so weird still why
   * r u cutting it off", with "must be at" sliced off the right edge).
   *
   * Centring every label on its dot pushes half of it outside the track once
   * the dot nears either end, and the panel clips it. Near an edge the label
   * anchors to that edge instead of straddling the dot, so it always reads in
   * full however narrow the column is.
   */
  const labelPos = (pct: number): React.CSSProperties => {
    const at = Math.min(100, Math.max(0, pct));
    if (at <= 14) return { left: 0 };
    if (at >= 86) return { right: 0 };
    return { left: `${at}%`, transform: "translateX(-50%)" };
  };
  /**
   * TOP AND BOTTOM, NEVER CROSSING (Anir, Aug 16: "you can't intersect, bro.
   * You can utilize the top and the bottom of the slides").
   *
   * Both labels used to hang above the track, and when the two points sat
   * close together the second one dropped into a lower lane — which put its
   * leader line straight through the first one's. Sending "where you are"
   * under the track instead gives each label its own half of the picture, so
   * the lines can never meet however close the dots get.
   */
  /**
   * ALWAYS SPLIT, NEVER JUDGED (Anir, Aug 16: "Don't stop until you've
   * confirmed that it'll never intersect... You have the top and the bottom,
   * right? That should never happen").
   *
   * This used to keep both labels above the track and only split them when the
   * two points came within 30% of each other. That number was a guess about
   * text width in a container whose width the component never knows: at 30%
   * apart in a narrow column the two labels still met. One label above, one
   * below, always — then no distance between the dots can ever bring them
   * together, and the layout no longer jumps between two arrangements.
   */
  /** Track thickness, and how far the biggest dot reaches past its centre. */
  /** Breathing room between the track and a label sitting under it. */
  const GAP = 6;
  /** Height of a label line, so its lane can be reserved exactly. */
  const LABEL = compact ? 14 : 17;

  return (
    <div className={compact ? "w-full" : "min-w-[380px]"}>
      {!compact && (
        <p className="text-[13px] font-semibold text-text-primary">{title}</p>
      )}

      {target > 0 ? (
        <>
          <div
            className={compact ? "relative mt-1" : "relative mt-3.5"}
            /* THE TOP LANE ALWAYS CARRIES SOMETHING (Anir, Aug 16: "I didn't
               ask you to shorten it. I asked you to actually use it and put
               some text on top"). With a schedule it holds "must be at"; with
               none it holds where you are — so the space is used either way
               and nothing sits on the track. */
            style={{ paddingTop: LANE + 8 }}
          >
            {/* THE ZERO END, SAID ONCE, UP TOP (Anir, Aug 20: "where you say
                $0, put that $0 on top... you can move it up for sure"). The
                left end needs no circle and no bottom row of its own. */}
            <span
              className={cn(
                "absolute left-0 font-semibold text-text-tertiary tnum",
                compact ? "text-[9.5px]" : "text-[11px]"
              )}
              style={{ top: LANE - (compact ? 12 : 14) + 8 }}
            >
              {fmtAmount(unit, 0)}
            </span>
            {/* THE TARGET SITS WHERE THE TARGET IS (Anir, Aug 22: "why is the
                500K so far? He should be on the right side, where 500K
                actually is — just like the $0"). The number now mirrors the
                zero: pinned over the track's right terminus, the circle it
                labels, instead of leading a sentence that dragged it left. */}
            <span
              className={cn(
                "absolute right-0 font-bold text-text-primary tnum",
                compact ? "text-[9.5px]" : "text-[11px]"
              )}
              style={{ top: LANE - (compact ? 12 : 14) + 8 }}
            >
              {fmtAmount(unit, target)}
            </span>
            {/* WHERE YOU ARE, IN THE LANE ABOVE — when nothing else is using
                it (Anir, Aug 16: "you're not using the top of the progress
                bar... I didn't ask you to shorten it. I asked you to actually
                use it and put some text on top"). With a schedule the top lane
                belongs to "must be at" and this stays underneath, so the two
                can never collide. */}
            {!hasSchedule && verified + awaiting > 0 && (
              <span
                className="absolute flex flex-col items-center"
                style={{ ...labelPos(aPct), top: 0 }}
              >
                {/* THE HEADLINE IS WHAT COUNTS (Anir, Aug 20: "also fix that
                    too", pointing at "$200K · 40%" in red).
                    
                    It used to be the total CLAIMED, painted red whenever any
                    of it had been sent back — so a bar carrying $80K verified
                    and $120K rejected announced "$200K" in the colour that
                    means rejected, saying the whole lot was refused. The
                    brackets under the same bar already said $80K and $120K
                    separately, so the headline was arguing with them.
                    
                    It reads verified money now, in verified green, matching
                    the % met on the row, the chart above it and the CSV. The
                    claimed total is still right there as the length of the
                    bar and the sum of the two brackets. */}
                <span
                  className={cn(
                    "whitespace-nowrap font-bold text-text-primary tnum",
                    compact ? "text-[10px]" : "text-[12px]"
                  )}
                >
                  {fmtAmount(unit, verified + awaiting)} · {Math.round(aPct)}%
                </span>
              </span>
            )}

            {/* WHERE THE GOAL'S OWN SCHEDULE SAYS IT SHOULD BE. */}
            {hasSchedule && (
            <span
              className="absolute flex flex-col items-center"
              style={{ ...labelPos(marker), top: 0 }}
            >
              <span
                className={cn(
                  "whitespace-nowrap font-semibold text-text-secondary tnum",
                  compact ? "text-[10px]" : "text-[12px]"
                )}
              >
                must be at {fmtAmount(unit, mustBe)}
              </span>
            </span>
            )}

            {/* THE TRACK. */}
            <div
              className={cn(
                "relative w-full rounded-full bg-[color:var(--border-light)]",
                compact ? "h-2" : "h-2.5"
              )}
            >
              {/* THE SAME STRIPE THE CHART DRAWS (Anir, Aug 20: "if you're
                  doing red stripe, it should show red stripe everywhere, not
                  just red"). Unverified money was a flat 32% wash here while
                  the bar chart above it striped the identical figure, so the
                  two panels described one fact in two visual languages. Red
                  when a group owner refused it, burnt orange while it simply
                  waits its turn. */}
              <span
                className="unverified-fill absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: `${aPct}%`,
                  ["--fill" as string]:
                    sentBack > 0 ? ENTRY_COLOR.sent_back : ENTRY_COLOR.reported,
                }}
              />
              {/* Signed off is GREEN and solid, everywhere (Anir, Aug 20:
                  "I like the idea that verified is green, but then make it
                  consistent"). The collapsed rail already drew it green while
                  this track drew the same money blue. */}
              <span
                className="absolute inset-y-0 left-0 rounded-full"
                style={{ width: `${vPct}%`, background: ENTRY_COLOR.verified }}
              />
              {/* Every point on the track wears a dot, including the last one. */}
              <span
                className="absolute top-1/2 h-[13px] w-[13px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[2.5px] border-white"
                style={{
                  left: `${aPct}%`,
                  background:
                    awaiting <= 0
                      ? ENTRY_COLOR.verified
                      : sentBack > 0
                        ? ENTRY_COLOR.sent_back
                        : ENTRY_COLOR.reported,
                }}
                aria-hidden="true"
              />
              {hasSchedule && (
                <span
                  className="absolute top-1/2 h-[11px] w-[11px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-text-tertiary"
                  style={{ left: `${marker}%` }}
                  aria-hidden="true"
                />
              )}
              <span
                className="absolute top-1/2 h-[13px] w-[13px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[2.5px] bg-white"
                // The target marker is the finish line, not a status.
                style={{ left: "100%", borderColor: "var(--text-tertiary)" }}
                aria-hidden="true"
              />
            </div>


            {/* THE TARGET HANGS OFF ITS OWN CIRCLE (Anir, Aug 20: "I need to
                be able to clearly see that $500K is where that grey circle
                is"). It used to sit a full row below the brackets, so the
                number and the mark it labels read as two unrelated facts. One
                row now: brackets measure the money on the left, the target
                labels its circle on the right. */}
            {/* Brackets and the target share one FLEX row — not an absolute
                overlay, which collapsed to nothing whenever the brackets had
                fewer than two segments to draw and dropped the target on top
                of the legend (Anir, Aug 20: "the text is overlapping"). */}
            {/* BRACKETS GET THE BAR'S FULL WIDTH (Anir, Aug 20: "the line
                should be from the left to the right do u see the isuse").
                
                They used to share a flex row with the target block, so the
                measuring row was ~169px against a 339px bar — every bracket
                stopped short of the segment it was measuring, by half. The
                target moved to its own line underneath, which costs one line
                and makes the brackets line up with the stripes exactly. */}
            <div className="block">
              <span className="block w-full">
                <SegmentBrackets
                  unit={unit}
                  parts={[
                    {
                      key: "verified",
                      value: verified,
                      pct: vPct,
                      color: ENTRY_COLOR.verified,
                    },
                    {
                      key: "unverified",
                      value: awaiting,
                      pct: Math.max(0, aPct - vPct),
                      color:
                        sentBack > 0 ? ENTRY_COLOR.sent_back : ENTRY_COLOR.reported,
                    },
                  ]}
                />
              </span>
              <span className="mt-1 block text-right">
                <span
                  className={cn(
                    "inline text-text-tertiary",
                    compact ? "text-[9px]" : "text-[10.5px]"
                  )}
                >
                  {hasSchedule ? (
                    `target · due ${expectedDueLabel ?? "by now"}`
                  ) : onSetSchedule ? (
                    <>
                      target ·{" "}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSetSchedule();
                        }}
                        className="cursor-pointer font-semibold text-blue-primary underline-offset-2 hover:underline"
                      >
                        set a schedule
                      </button>
                    </>
                  ) : (
                    "target · no schedule set on this goal"
                  )}
                </span>
              </span>
            </div>

          </div>

          <div className={cn(compact ? "mt-2 space-y-1" : "mt-3 space-y-1.5")}>
            <PaceRow
              swatch={ENTRY_COLOR.verified}
              label="Verified, counts now"
              value={fmtAmount(unit, verified)}
            />
            {/* ONE ORDER, EVERYWHERE (Anir, Aug 20: "the order and stuff
                matters... there shouldn't be any confusion"). Signed off, then
                the thing somebody has to act on, then the thing that is merely
                waiting its turn — the same order the track is drawn in and the
                same order every panel lists them. */}
            {sentBack > 0 && (
              <PaceRow
                swatch={ENTRY_COLOR.sent_back}
                label="Sent back, needs a fix"
                value={fmtAmount(unit, sentBack)}
              />
            )}
            {awaiting - sentBack > 0 && (
              <PaceRow
                swatch={ENTRY_COLOR.reported}
                faded
                label="Claimed, not checked yet"
                value={fmtAmount(unit, awaiting - sentBack)}
              />
            )}
            {/* NO SCHEDULE, NO VERDICT (Anir, Aug 16: "Who the fuck is saying
                'must be at 375K'?"). Without a milestone there is nothing to
                be ahead of or behind, so the row is simply absent rather than
                measuring against a line the app drew itself. */}
            {hasSchedule && (
              <PaceRow
                label={ahead < 0 ? "Behind schedule by" : "Ahead of schedule by"}
                value={fmtAmount(unit, Math.abs(ahead))}
                strong
              />
            )}
          </div>
        </>
      ) : (
        <p className="mt-1 text-[12px] text-text-secondary">
          No target set, so there is no pace to be measured against.{" "}
          {fmtAmount(unit, verified + awaiting)} logged so far.
        </p>
      )}
    </div>
  );
}

function PaceRow({
  swatch,
  faded,
  label,
  value,
  strong,
}: {
  swatch?: string;
  faded?: boolean;
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <p className="flex items-center gap-2 text-[12px]">
      {swatch && (
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: swatch, opacity: faded ? 0.28 : 1 }}
        />
      )}
      <span className={cn("text-text-secondary", !swatch && "ml-4")}>{label}</span>
      <b
        className={cn(
          "ml-auto tnum",
          strong ? "text-text-primary" : "text-text-secondary"
        )}
      >
        {value}
      </b>
    </p>
  );
}

/**
 * ONE PERSON'S WHOLE STORY ON ONE GOAL (Anir, Aug 19: "when I press the
 * dropdown, it should give me a ton more information about them, maybe cards,
 * like a row of three or four cards at the top, and maybe some graphs. It
 * should be pretty extensive").
 *
 * Four cards say where they stand, a monthly chart says how they got there,
 * and the entries themselves are listed underneath — the same numbers the
 * verification queue works from, never a second opinion.
 */
export function PersonGoalPanel({
  goal,
  person,
  target,
  done,
  state,
}: {
  goal: PrimaryGoal;
  person: string;
  target: number;
  done: number;
  state: PerformanceState;
}) {
  const mine = goalFamilyActuals(state, goal)
    .filter((a) => a.person.trim().toLowerCase() === person.trim().toLowerCase())
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  const verified = mine
    .filter((a) => entryStatus(a) === "verified")
    .reduce((s, a) => s + a.amount, 0);
  const waiting = mine
    .filter((a) => isPending(a))
    .reduce((s, a) => s + a.amount, 0);
  const sentBackMine = mine
    .filter((a) => entryStatus(a) === "sent_back")
    .reduce((s, a) => s + a.amount, 0);
  const left = Math.max(0, target - done);
  const pct = target > 0 ? Math.min(100, Math.round((done / target) * 100)) : 0;

  // Month by month, oldest first. Only months that carry something, so a
  // brand-new goal shows one honest bar instead of twelve empty ones.
  const byMonth = new Map<string, { value: number; pending: number }>();
  for (const a of mine) {
    const key = a.date.slice(0, 7);
    const cell = byMonth.get(key) ?? { value: 0, pending: 0 };
    cell.value += a.amount;
    if (isPending(a)) cell.pending += a.amount;
    byMonth.set(key, cell);
  }
  const months = [...byMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, cell]) => ({
      label: new Date(`${key}-01T00:00:00`).toLocaleDateString(undefined, {
        month: "short",
      }),
      value: cell.value,
      pending: cell.pending,
      color: ENTRY_COLOR.verified,
      pendingColor:
        sentBackMine > 0 ? ENTRY_COLOR.sent_back : ENTRY_COLOR.reported,
      dotColor: typeMeta(goal.type).color,
      // NO CAPTION (Anir, Aug 20: "why are you saying 200k twice"). The bar
      // already prints its own value label above itself; a caption under it
      // repeated the same figure in a lighter grey, on the bar AND in its
      // tooltip. The formatter it needed is the reason the unit is passed in.
    }));

  const card = (label: string, value: string, tone?: string) => (
    <div className="rounded-lg border border-border-light bg-white px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
        {label}
      </p>
      <p className={cn("mt-1 text-[16px] font-bold tnum", tone ?? "text-text-primary")}>
        {value}
      </p>
    </div>
  );

  return (
    <div className="border-t border-border-light bg-white px-3 py-3">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {card("Target", target > 0 ? fmtAmount(goal.unit, target) : "Not set")}
        {/* The tiles read in the same three colours the bars do: what counts
            is green, what is still owed to somebody wears the colour of whose
            move it is. */}
        {card(
          "Counted",
          fmtAmount(goal.unit, done),
          "text-[color:var(--entry-verified-ink)]"
        )}
        {card(
          "Waiting to verify",
          waiting > 0 ? fmtAmount(goal.unit, waiting) : "Nothing",
          waiting > 0
            ? sentBackMine > 0
              ? "text-[color:var(--entry-sent-back-ink)]"
              : "text-[color:var(--entry-waiting)]"
            : undefined
        )}
        {card(
          target > 0 ? "Still to go" : "Entries",
          target > 0 ? fmtAmount(goal.unit, left) : String(mine.length)
        )}
      </div>

      {target > 0 && (
        <div className="mt-3">
          <div className="flex items-baseline justify-between text-[11px]">
            <span className="font-semibold text-text-secondary">
              {pct}% of their target
            </span>
            <span className="text-text-tertiary tnum">
              {fmtAmount(goal.unit, verified)} signed off
            </span>
          </div>
          {/* Signed off, then whatever is still owed — the same two-part
              bar and the same colours as every other track. It was one solid
              blue sweep, which drew refused money as if it counted. */}
          <span className="mt-1 flex h-2 overflow-hidden rounded-full bg-surface">
            <span
              className="block h-full"
              style={{
                width: `${target > 0 ? Math.min(100, (verified / target) * 100) : 0}%`,
                background: ENTRY_COLOR.verified,
              }}
            />
            <span
              className="unverified-fill block h-full"
              style={{
                width: `${target > 0 ? Math.min(100 - Math.min(100, (verified / target) * 100), (waiting / target) * 100) : 0}%`,
                ["--fill" as string]:
                  sentBackMine > 0 ? ENTRY_COLOR.sent_back : ENTRY_COLOR.reported,
              }}
            />
          </span>
        </div>
      )}

      {months.length > 0 ? (
        <div className="mt-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
            Month by month
          </p>
          <div className="mt-1.5">
            {/* `unit` here is the WORD printed after each value ("12 calls"),
                not the goal's kind — passing goal.unit put the literal word
                "count" after every bar, so a month read "80K count" while the
                tile above it read 80,000 (Anir, Aug 19: "WHY would it say 80k
                and not the full amount like $80,000"). The goal's own
                formatter draws these now, so the chart and the tiles say the
                same number the same way, currency symbol included. */}
            <BarChart
              data={months}
              height={140}
              format={goal.unit === "currency" ? "money" : "number"}
            />
          </div>
        </div>
      ) : (
        <p className="mt-3 text-[12px] text-text-tertiary">
          Nothing logged against this goal yet.
        </p>
      )}

      {mine.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
            Latest entries
          </p>
          <ul className="mt-1.5 divide-y divide-border-light">
            {mine.slice(0, 6).map((a) => (
              /* LEFT-PACKED (Anir, Aug 20: "for latest entries, there's too
                 much gap here between the left side and the right side, so
                 that doesn't look good"). The middle column was `flex-1`, so
                 on a row with no deal name it was an empty span holding the
                 status pill half a screen away from the money it describes.
                 The facts sit together now and the pill follows them. */
              <li key={a.id} className="flex items-center gap-2 py-1.5 text-[12px]">
                <span className="w-[74px] shrink-0 text-text-tertiary tnum">
                  {a.date}
                </span>
                <span className="shrink-0 font-semibold text-text-primary tnum">
                  {fmtAmount(goal.unit, a.amount, a.currency)}
                </span>
                {/* The account wears its own mark here too. */}
                {a.customer && (
                  <span className="flex min-w-0 shrink items-center gap-1.5">
                    <CompanyLogo
                      name={a.customer}
                      className="h-[16px] w-[16px] shrink-0 text-[6px]"
                    />
                    <span className="min-w-0 truncate text-text-secondary">
                      {a.customer}
                    </span>
                  </span>
                )}
                {(a.dealLabel ?? a.note) && (
                  <span className="min-w-0 truncate text-text-secondary">
                    {a.dealLabel ?? a.note}
                  </span>
                )}
                {/* Three states, three colours: signed off is green, sent
                    back is red, waiting on the owner is amber. It used to say
                    "Waiting" for both of the last two. */}
                <span
                  className={cn(
                    "ml-1 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold",
                    entryStatus(a) === "verified"
                      ? "bg-[rgba(22,163,74,0.10)] text-[color:var(--entry-verified-ink)]"
                      : entryStatus(a) === "sent_back"
                        ? "bg-[rgba(220,38,38,0.10)] text-[color:var(--entry-sent-back-ink)]"
                        : "bg-[rgba(194,65,12,0.10)] text-[color:var(--entry-waiting)]"
                  )}
                >
                  {entryStatus(a) === "reported" ? "Waiting" : entryStatusLabel(a)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
