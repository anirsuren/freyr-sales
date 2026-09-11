"use client";

import { Radar } from "lucide-react";
import { SIGNAL_META, signalsFor, type SignalGroup, type SignalId } from "@/lib/marketIntelSignals";
import { cn } from "@/lib/utils";
import { tint } from "@/lib/tint";

/**
 * THE MAIN BAR: SIGNALS (Saras, Sep 11: "the main bar at the top of these
 * modules will be 'Signals' - with a list of all signals. Then another
 * secondary one on 'Sources'"). Her titles in her order, for the tab the
 * company sits in: ten on a customer, nine on a competitor. Every signal is
 * always on the bar with its count; one with nothing in view is muted rather
 * than missing, so the list reads the same on every company. "All signals"
 * lets go of a pick; clicking the picked signal again does too.
 */
export function SignalRow({
  group,
  counts,
  total,
  active,
  onPick,
  className,
}: {
  group: SignalGroup;
  counts: Partial<Record<SignalId, number>>;
  /** Items in view, for "All signals". */
  total: number;
  active: SignalId | null;
  onPick: (id: SignalId | null) => void;
  className?: string;
}) {
  const chip =
    "flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors";
  const all = active === null;
  return (
    <div
      role="group"
      aria-label="Signals"
      className={cn("rounded-xl border border-border-light bg-white px-3.5 py-3", className)}
    >
      <p className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.06em] text-text-tertiary">Signals</p>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          aria-pressed={all}
          onClick={() => onPick(null)}
          className={cn(
            chip,
            all
              ? "border-transparent bg-[color:var(--ink-bright-blue)] text-white"
              : "border-border-light bg-white text-text-secondary hover:border-blue-subtle hover:text-text-primary"
          )}
        >
          <Radar size={13} strokeWidth={2.2} />
          All signals
          <span className={cn("tnum", all ? "opacity-85" : "text-text-tertiary")}>{total}</span>
        </button>
        {signalsFor(group).map((id) => {
          const meta = SIGNAL_META[id];
          const Icon = meta.icon;
          const count = counts[id] ?? 0;
          const on = active === id;
          const empty = count === 0;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={on}
              onClick={() => onPick(on ? null : id)}
              disabled={empty && !on}
              className={cn(
                chip,
                on
                  ? "border-transparent text-white"
                  : empty
                    ? "cursor-default border-border-light bg-white text-text-tertiary opacity-60"
                    : "border-border-light bg-white text-text-secondary hover:border-blue-subtle hover:text-text-primary"
              )}
              style={on ? { background: meta.color } : empty ? undefined : { color: meta.color, background: tint(meta.color, 6) }}
            >
              <Icon size={13} strokeWidth={2.2} />
              {meta.label}
              <span className={cn("tnum", on ? "opacity-85" : "text-text-tertiary")}>{count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
