"use client";

import { SIGNAL_ICON, SIGNAL_KINDS, SIGNAL_META, type SignalKind } from "@/lib/marketIntelSignals";
import { cn } from "@/lib/utils";
import { tint } from "@/lib/tint";

/**
 * THE NINE SIGNALS, AT THE TOP (Saras, Sep 10: "instead of the signal mix
 * being mentioned here on the right, can it also come at the top? Those 9
 * signals can be visible at the top itself"). Every kind is always on the
 * row, in her order, with its count; a kind with nothing this window is
 * muted rather than missing, so the vocabulary reads the same on every
 * company. Click one to keep only those items; click it again to let go.
 */
export function SignalRow({
  counts,
  active,
  onPick,
  className,
}: {
  counts: Partial<Record<SignalKind, number>>;
  active: SignalKind | null;
  onPick: (kind: SignalKind | null) => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label="Signals"
      className={cn("flex flex-wrap items-center gap-1.5", className)}
    >
      {SIGNAL_KINDS.map((kind) => {
        const meta = SIGNAL_META[kind];
        const Icon = SIGNAL_ICON[kind];
        const count = counts[kind] ?? 0;
        const on = active === kind;
        const empty = count === 0;
        return (
          <button
            key={kind}
            type="button"
            aria-pressed={on}
            title={meta.label}
            onClick={() => onPick(on ? null : kind)}
            disabled={empty && !on}
            className={cn(
              "flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold transition-colors",
              on
                ? "border-transparent text-white"
                : empty
                  ? "cursor-default border-border-light bg-white text-text-tertiary opacity-60"
                  : "border-border-light bg-white text-text-secondary hover:border-blue-subtle hover:text-text-primary"
            )}
            style={
              on
                ? { background: meta.color }
                : empty
                  ? undefined
                  : { color: meta.color, background: tint(meta.color, 6) }
            }
          >
            <Icon size={12} strokeWidth={2.2} />
            {meta.short}
            <span className={cn("tnum", on ? "opacity-85" : "text-text-tertiary")}>{count}</span>
          </button>
        );
      })}
    </div>
  );
}
