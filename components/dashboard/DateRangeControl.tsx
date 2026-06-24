"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

const RANGES = [
  { k: "7d", l: "7D" },
  { k: "30d", l: "30D" },
  { k: "90d", l: "90D" },
  { k: "all", l: "All" },
];

export function DateRangeControl({ value }: { value: string }) {
  const router = useRouter();
  return (
    <div className="flex items-center gap-1 bg-surface p-1 rounded-lg border border-border-light">
      {RANGES.map((r) => (
        <button
          key={r.k}
          onClick={() => router.push(`/dashboard?range=${r.k}`, { scroll: false })}
          className={cn(
            "px-2.5 py-1 rounded-md text-[11px] font-semibold uppercase tracking-[0.05em] transition-colors",
            value === r.k
              ? "bg-white shadow-card text-text-primary"
              : "text-text-secondary hover:text-text-primary"
          )}
        >
          {r.l}
        </button>
      ))}
    </div>
  );
}
