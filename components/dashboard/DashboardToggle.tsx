"use client";

import { useState } from "react";
import { Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

export function DashboardToggle({
  title,
  date,
  overview,
  analytics,
  actions,
}: {
  title: string;
  date?: string;
  overview: React.ReactNode;
  analytics: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const [view, setView] = useState<"overview" | "analytics">("overview");

  return (
    <div className="space-y-8">
      <section className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-text-primary">
            {title}
          </h1>
          {date && (
            <p className="text-[14px] text-text-secondary flex items-center gap-1.5 mt-1">
              <Calendar size={16} strokeWidth={1.5} />
              {date}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start">
          {actions}
          <div className="flex items-center gap-1 bg-surface p-1 rounded-lg border border-border-light">
            {(["overview", "analytics"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  "px-3 py-1 rounded-md text-[11px] font-semibold uppercase tracking-[0.05em] transition-colors",
                  view === v
                    ? "bg-white shadow-card text-text-primary"
                    : "text-text-secondary hover:text-text-primary"
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </section>

      {view === "overview" ? overview : analytics}
    </div>
  );
}
