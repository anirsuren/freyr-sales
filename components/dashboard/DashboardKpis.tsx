"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { HoverCard } from "@/components/ui/HoverCard";
import { KPI_EVENT, KPI_STORE } from "./KpiCustomize";

export type KpiDetail = {
  label: string;
  value: string;
  tone?: "default" | "good" | "warning" | "danger";
};

export type KpiItem = {
  key: string;
  label: string;
  value: string;
  cur: number;
  prev: number | null;
  unit: "money" | "count" | "pct";
  href: string;
  sub?: string;
  progress?: number;
  progressLabel?: string;
  sparkline?: number[];
  tone?: "default" | "danger";
  description?: string;
  details?: KpiDetail[];
};

function deltaLabel(item: KpiItem): { text: string; dir: "up" | "down" } | null {
  if (item.prev == null) return null;
  const diff = item.cur - item.prev;
  const dir = diff >= 0 ? "up" : "down";
  if (item.unit === "pct") return { text: `${diff > 0 ? "+" : ""}${diff} pts`, dir };
  if (item.prev === 0) return { text: item.cur === 0 ? "0%" : "new", dir };
  const pct = Math.round((diff / item.prev) * 100);
  return { text: `${pct > 0 ? "+" : ""}${pct}%`, dir };
}

export function DashboardKpis({
  kpis,
  comparable,
}: {
  kpis: KpiItem[];
  comparable: boolean;
}) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  useEffect(() => {
    const sync = () => {
      try {
        const raw = localStorage.getItem(KPI_STORE);
        setHidden(raw ? new Set(JSON.parse(raw)) : new Set());
      } catch {}
    };
    sync();
    window.addEventListener(KPI_EVENT, sync);
    return () => window.removeEventListener(KPI_EVENT, sync);
  }, []);

  const shown = kpis.filter((k) => !hidden.has(k.key));

  return (
    <section className="grid grid-cols-2 lg:grid-cols-5 gap-3 stagger">
      {shown.map((k) => {
        const delta = comparable ? deltaLabel(k) : null;
        const danger = k.tone === "danger";
        const progress = Math.max(0, Math.min(100, k.progress ?? 0));
        const card = (
          <Link
            href={k.href}
            className="group flex min-h-[154px] min-w-0 flex-col rounded-lg border border-border-light bg-white px-4 py-3.5 shadow-card transition-all hover:-translate-y-0.5 hover:border-blue-subtle hover:shadow-[0_9px_24px_rgba(0,0,0,0.07)]"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-[12px] font-medium text-text-secondary">{k.label}</p>
              <ArrowRight size={13} className="shrink-0 text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
            <p className={cn("mt-2 text-[22px] font-bold leading-none tnum whitespace-nowrap", danger ? "text-error" : "text-text-primary")}>{k.value}</p>
            <div className="mt-2 flex min-h-5 items-center gap-1.5">
              {delta && (
                <span
                  data-testid="kpi-delta"
                  className={cn(
                    "inline-flex items-center gap-0.5 text-[11px] font-semibold tnum",
                    delta.dir === "down" ? "text-error" : "text-success"
                  )}
                >
                  {delta.dir === "down" ? <TrendingDown size={12} /> : <TrendingUp size={12} />}
                  {delta.text}
                </span>
              )}
              {k.sub && <span className="min-w-0 text-[10.5px] leading-tight text-text-tertiary">{k.sub}</span>}
            </div>

            <div className="mt-auto pt-3">
              <div className="h-1.5 overflow-hidden rounded-full bg-surface">
                <div
                  className={cn("h-full rounded-full transition-[width]", danger ? "bg-error" : progress >= 100 ? "bg-success" : "bg-blue-primary")}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px]">
                <span className="min-w-0 leading-tight text-text-tertiary">{k.progressLabel || "Current position"}</span>
                <span className={cn("shrink-0 font-semibold tnum", danger ? "text-error" : "text-text-secondary")}>{Math.round(progress)}%</span>
              </div>
            </div>
          </Link>
        );
        return (
          <HoverCard
            key={k.key}
            delayMs={0}
            width={320}
            content={
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">{k.label}</p>
                <p className={cn("mt-1 text-[22px] font-bold tnum", danger ? "text-error" : "text-text-primary")}>{k.value}</p>
                {k.description && <p className="mt-2 text-[11.5px] leading-relaxed text-text-secondary">{k.description}</p>}
                {k.details && k.details.length > 0 && (
                  <div className="mt-3 divide-y divide-border-light rounded-md bg-surface px-3">
                    {k.details.map((detail) => (
                      <div key={detail.label} className="flex items-center justify-between gap-4 py-2 text-[11px]">
                        <span className="text-text-tertiary">{detail.label}</span>
                        <span className={cn(
                          "text-right font-semibold tnum",
                          detail.tone === "good" ? "text-success" :
                            detail.tone === "warning" ? "text-warning" :
                              detail.tone === "danger" ? "text-error" : "text-text-primary"
                        )}>{detail.value}</span>
                      </div>
                    ))}
                  </div>
                )}
                <p className="mt-3 flex items-center justify-end gap-1 text-[11px] font-semibold text-blue-primary">
                  Open details <ArrowRight size={12} />
                </p>
              </div>
            }
          >
            {card}
          </HoverCard>
        );
      })}
    </section>
  );
}
