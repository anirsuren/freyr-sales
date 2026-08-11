"use client";

import {
  Activity,
  BadgeDollarSign,
  CheckCircle2,
  Handshake,
  Hash,
  Magnet,
  Percent,
  ShieldCheck,
  ShieldQuestion,
  Sparkles,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
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
  if (!meta) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-full bg-[rgba(0,113,227,0.06)] font-medium text-text-tertiary",
          size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[10.5px]"
        )}
      >
        no target yet
      </span>
    );
  }
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
  const body = (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-bold transition-opacity",
        size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[10.5px]",
        onToggle && "group-hover/vp:opacity-80"
      )}
      style={
        verified
          ? { color: "#16A34A", background: "rgba(22,163,74,0.10)" }
          : { color: "#B45309", background: "rgba(180,83,9,0.10)" }
      }
    >
      <Icon size={size === "sm" ? 10 : 11} strokeWidth={2.4} />
      {verified ? "Verified" : "Not verified"}
    </span>
  );
  if (!onToggle) return body;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      title={verified ? "Mark as not verified" : "Mark as verified"}
      className="group/vp cursor-pointer"
    >
      {body}
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
