"use client";

import { cn } from "@/lib/utils";

export interface TabItem {
  key: string;
  label: string;
}

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: TabItem[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="flex gap-6 border-b border-border-light">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={cn(
            "pb-3 -mb-px border-b-2 text-[15px] transition-colors",
            active === t.key
              ? "border-blue-primary text-text-primary font-medium"
              : "border-transparent text-text-secondary hover:text-text-primary"
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
