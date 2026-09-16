"use client";

import { Radar } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { SIGNAL_META, type SignalId } from "@/lib/marketIntelSignals";
import { tint } from "@/lib/tint";
import { cn } from "@/lib/utils";

export function TopSignals({ counts, active, onPick }: {
  counts: Partial<Record<SignalId, number>>;
  active: SignalId | null;
  onPick: (id: SignalId | null) => void;
}) {
  const top = (Object.entries(counts) as [SignalId, number][])
    .filter(([id, count]) => id !== "others" && count > 0)
    .sort(([a, x], [b, y]) => y - x || SIGNAL_META[a].label.localeCompare(SIGNAL_META[b].label))
    .slice(0, 5);

  return (
    <Card className="p-4">
      <h2 className="flex items-center gap-2 text-[13px] font-semibold text-text-primary">
        <Radar size={14} strokeWidth={2} className="text-blue-primary" />
        Top signals
      </h2>
      <p className="mt-1 text-[11.5px] leading-snug text-text-tertiary">
        Most frequent in this briefing. Select one to see its updates.
      </p>
      {top.length ? (
        <div className="mt-3 space-y-1">
          {top.map(([id, count]) => {
            const { icon: Icon, color, label } = SIGNAL_META[id];
            const selected = active === id;
            return (
              <button key={id} type="button" aria-pressed={selected}
                onClick={() => onPick(selected ? null : id)}
                className={cn("flex w-full items-center gap-2.5 rounded-lg px-2 py-2.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-primary", selected ? "bg-blue-subtle" : "hover:bg-surface")}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ color, background: tint(color, 9) }}>
                  <Icon size={14} strokeWidth={2} />
                </span>
                <span className="min-w-0 flex-1 text-[12px] font-medium leading-snug text-text-primary">{label}</span>
                <span className="tnum shrink-0 text-[12px] font-semibold text-text-secondary" aria-label={`${count} updates`}>{count}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="mt-3 text-[12px] text-text-secondary">No specific signals in this briefing yet.</p>
      )}
    </Card>
  );
}
