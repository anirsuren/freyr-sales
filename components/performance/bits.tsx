"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Activity,
  BadgeDollarSign,
  Check,
  CheckCircle2,
  ChevronDown,
  Handshake,
  Hash,
  Magnet,
  Percent,
  Search,
  ShieldCheck,
  ShieldQuestion,
  Sparkles,
  TrendingDown,
  TrendingUp,
  UserPlus,
  UserRound,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";
import {
  fmtAmount,
  pctMet,
  yearElapsed,
  type GoalUnit,
  type Pace,
} from "@/lib/performanceShared";

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
}: {
  value: string;
  onChange: (next: string) => void;
  people: string[];
  placeholder?: string;
  allowFree?: boolean;
  /** Name → workspace role, shown beside each name so you pick a person, not
   *  a string (Anir, Aug 15: "it should show a role"). */
  roles?: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties | null>(null);
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
    setMenuStyle({
      position: "fixed",
      left: rect.left,
      width: rect.width,
      top: spaceBelow > 300 ? rect.bottom + 6 : undefined,
      bottom: spaceBelow > 300 ? undefined : window.innerHeight - rect.top + 6,
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
  const matches = people.filter((p) => !q || p.toLowerCase().includes(q));
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
                placeholder="Search people…"
                className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-text-tertiary"
              />
            </div>
          )}
          <div className="max-h-[320px] overflow-y-auto p-1">
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
            ? "Tracking — counted and shown on Org performance. Click to stop tracking."
            : "Not tracked — master list only. Click to start tracking it on Org performance."
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
  size = "md",
}: {
  verified: boolean;
  onToggle?: () => void;
  size?: "sm" | "md";
}) {
  const Icon = verified ? ShieldCheck : ShieldQuestion;
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
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      title={
        verified
          ? "Leadership has signed this off — click to undo"
          : "Click when leadership has checked this number"
      }
      className={cn(
        // whitespace-nowrap for the same reason as the read-only chip above:
        // "Not verified" plus the VERIFY badge is three words in a narrow
        // column, and it wrapped mid-label.
        "group/vp inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border bg-white font-bold shadow-sm transition-all hover:-translate-y-px hover:shadow active:translate-y-0 active:shadow-none",
        size === "sm" ? "px-2 py-1 text-[10px]" : "px-2.5 py-1 text-[10.5px]"
      )}
      style={
        verified
          ? { color: "#16A34A", borderColor: "rgba(22,163,74,0.35)" }
          : { color: "#0058B0", borderColor: "rgba(0,113,227,0.35)" }
      }
    >
      <Icon size={size === "sm" ? 10 : 11} strokeWidth={2.4} />
      {verified ? "Verified" : "Not verified"}
      <span
        className={cn(
          "rounded-full px-1.5 py-px text-[9px] font-bold uppercase tracking-[0.04em] transition-colors",
          verified
            ? "bg-[rgba(22,163,74,0.10)] group-hover/vp:bg-[rgba(22,163,74,0.18)]"
            : "bg-[rgba(0,113,227,0.10)] group-hover/vp:bg-[rgba(0,113,227,0.18)]"
        )}
      >
        {verified ? "Undo" : "Verify"}
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
          of {target > 0 ? fmtAmount(unit, target) : "— (no target yet)"}
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
export function PaceTimeline({
  title,
  verified,
  awaiting,
  target,
  expectedPct,
  unit,
  accent = "#0071E3",
}: {
  title: React.ReactNode;
  verified: number;
  awaiting: number;
  target: number;
  /** 0-100. Where the calendar says this should be today. */
  expectedPct: number;
  unit: "currency" | "count" | "percent";
  accent?: string;
}) {
  const pctOf = (n: number) =>
    target > 0 ? Math.min(100, Math.max(0, (n / target) * 100)) : 0;
  const vPct = pctOf(verified);
  const aPct = pctOf(verified + awaiting);
  const marker = Math.min(100, Math.max(0, expectedPct));
  const gap = Math.max(0, (target * marker) / 100 - (verified + awaiting));

  return (
    <div className="min-w-[260px]">
      <p className="text-[12.5px] font-semibold text-text-primary">{title}</p>

      {target > 0 ? (
        <>
          <p className="mt-0.5 text-[11.5px] text-text-secondary tnum">
            {fmtAmount(unit, verified + awaiting)} of {fmtAmount(unit, target)}
          </p>

          {/* The timeline itself. */}
          <div className="relative mt-3 mb-1 h-2.5 w-full rounded-full bg-[color:var(--border-light)]">
            <span
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ width: `${aPct}%`, background: accent, opacity: 0.28 }}
            />
            <span
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ width: `${vPct}%`, background: accent }}
            />
            {/* Where the calendar says you should be. */}
            <span
              className="absolute -top-1 bottom-[-4px] w-[2px] rounded-full bg-text-primary"
              style={{ left: `calc(${marker}% - 1px)` }}
              aria-hidden="true"
            />
          </div>
          <div className="flex items-center justify-between text-[10px] font-semibold text-text-tertiary">
            <span>you are here · {Math.round(aPct)}%</span>
            <span>must be at {Math.round(marker)}%</span>
          </div>

          <div className="mt-2.5 space-y-1 border-t border-border-light pt-2">
            <PaceRow
              swatch={accent}
              label="Verified, counts now"
              value={fmtAmount(unit, verified)}
            />
            <PaceRow
              swatch={accent}
              faded
              label="Claimed, not checked yet"
              value={fmtAmount(unit, awaiting)}
            />
            <PaceRow
              label={gap > 0 ? "Behind the calendar by" : "Ahead of the calendar"}
              value={fmtAmount(unit, gap > 0 ? gap : 0)}
              strong
            />
          </div>
        </>
      ) : (
        <p className="mt-1 text-[11.5px] text-text-secondary">
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
    <p className="flex items-center gap-2 text-[11.5px]">
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
