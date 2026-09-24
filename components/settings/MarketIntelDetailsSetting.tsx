"use client";

import { PanelLeft, PanelRight } from "lucide-react";
import { useStoredView } from "@/lib/useStoredView";
import { cn } from "@/lib/utils";

export function MarketIntelDetailsSetting() {
  const [side, setSide] = useStoredView("freyr.mi.details.side", "right", ["right", "left"] as const);

  return (
    <div>
      <p className="text-[13px] font-medium text-text-primary">Market Intel company details</p>
      <p className="mt-1 text-[12px] text-text-secondary">Choose where the details panel sits on company pages. You can hide it in either layout.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2" role="group" aria-label="Company details position">
        {([
          { value: "right", label: "Right", description: "Current layout", Icon: PanelRight },
          { value: "left", label: "Left", description: "Highlighted beside the feed", Icon: PanelLeft },
        ] as const).map(({ value, label, description, Icon }) => (
          <button
            key={value}
            type="button"
            aria-pressed={side === value}
            onClick={() => setSide(value)}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-primary",
              side === value ? "border-blue-primary bg-blue-light" : "border-border-light bg-white hover:border-blue-subtle hover:bg-surface"
            )}
          >
            <Icon size={19} className={side === value ? "text-blue-primary" : "text-text-secondary"} />
            <span>
              <span className="block text-[13px] font-semibold text-text-primary">{label}</span>
              <span className="block text-[11.5px] text-text-secondary">{description}</span>
            </span>
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11.5px] text-text-tertiary">Saved on this device.</p>
    </div>
  );
}
