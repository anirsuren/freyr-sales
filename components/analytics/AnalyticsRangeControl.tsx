"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

const RANGES = [
  { key: "7d", label: "7D", name: "Last 7 days" },
  { key: "30d", label: "30D", name: "Last 30 days" },
  { key: "90d", label: "90D", name: "Last 90 days" },
  { key: "all", label: "All", name: "All time" },
];

export function AnalyticsRangeControl({ range }: { range: string }) {
  const router = useRouter();
  const [selectedRange, setSelectedRange] = useState(range);
  const [isPending, startTransition] = useTransition();

  useEffect(() => setSelectedRange(range), [range]);

  return (
    <div className="flex items-center gap-3">
      <div className="hidden text-right sm:block">
        <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
          Analytics period
        </p>
        <p className="mt-0.5 text-[11px] text-text-secondary">
          Updates all charts
        </p>
      </div>
      <div
        className={cn(
          "flex items-center gap-1 rounded-lg border border-border-light bg-surface p-1 transition-opacity",
          isPending && "opacity-70"
        )}
        role="group"
        aria-label="Analytics period for all charts"
      >
        {RANGES.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-label={item.name}
            aria-pressed={selectedRange === item.key}
            onClick={() => {
              if (item.key === selectedRange) return;
              setSelectedRange(item.key);
              startTransition(() => {
                router.replace(`/analytics?range=${item.key}`, { scroll: false });
              });
            }}
            className={cn(
              "rounded-md px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.05em] transition-[color,background-color,box-shadow]",
              selectedRange === item.key
                ? "bg-blue-primary text-white shadow-sm"
                : "text-text-secondary hover:text-text-primary"
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
