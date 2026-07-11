"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Users,
  Target,
  Presentation,
  BarChart3,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Tooltip } from "@/components/ui/Tooltip";
import { GLOSSARY } from "@/lib/glossary";
import { CountUp } from "@/components/ui/CountUp";
import { KPI_STORE, KPI_EVENT } from "./KpiCustomize";

// A soft icon per metric gives each card identity + visual weight (premium feel
// vs. a hollow label+number). Keyed by the KPI key from the dashboard.
const KPI_ICON: Record<string, LucideIcon> = {
  pipeline: Wallet,
  leads: Users,
  winRate: Target,
  sessions: Presentation,
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
};

function deltaLabel(item: KpiItem): { text: string; dir: "up" | "down" } | null {
  if (item.prev == null) return null;
  const diff = item.cur - item.prev;
  const dir: "up" | "down" = diff >= 0 ? "up" : "down";
  if (item.unit === "pct") {
    if (diff === 0) return { text: "0 pts", dir };
    return { text: `${diff > 0 ? "+" : ""}${diff} pts`, dir };
  }
  if (item.prev === 0) {
    return item.cur === 0 ? { text: "0%", dir } : { text: "new", dir };
  }
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
  // Read-only mirror of the customize state — the controls now live in the header
  // (KpiCustomize); we sync from localStorage on mount + whenever it broadcasts.
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
  // Always show the change vs the previous period (Suren: dropped the "Change"
  // toggle — the delta is information a sales lead always wants, not a mode).
  const showDelta = comparable;

  return (
    <section>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 stagger">
        {shown.map((k) => {
          const d = showDelta ? deltaLabel(k) : null;
          const Icon = KPI_ICON[k.key] || BarChart3;
          return (
            <Link key={k.key} href={k.href} className="block">
              <Card className="h-[150px] flex flex-col justify-between hover:border-blue-subtle hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] transition-all duration-200 group">
                <div className="flex items-start justify-between">
                  <span className="w-9 h-9 rounded-lg bg-blue-light text-blue-primary flex items-center justify-center shrink-0 transition-colors group-hover:bg-blue-primary group-hover:text-white">
                    <Icon size={18} strokeWidth={1.9} />
                  </span>
                  {d && (
                    <span
                      data-testid="kpi-delta"
                      title={`${d.text} vs the previous period`}
                      className="inline-flex items-center gap-1 text-[12px] font-semibold tnum px-1.5 py-0.5 rounded-md"
                      style={{
                        color: d.dir === "down" ? "#B02020" : "#1A7A35",
                        background:
                          d.dir === "down"
                            ? "rgba(176,32,32,0.08)"
                            : "rgba(26,122,53,0.08)",
                      }}
                    >
                      {d.dir === "down" ? (
                        <TrendingDown size={13} strokeWidth={2} />
                      ) : (
                        <TrendingUp size={13} strokeWidth={2} />
                      )}
                      {d.text}
                    </span>
                  )}
                </div>
                <div>
                  <Tooltip
                    label={GLOSSARY["kpi_" + k.key.toLowerCase()]?.def}
                    side="bottom"
                    align="left"
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary cursor-help">
                      {k.label}
                    </span>
                  </Tooltip>
                  <p className="text-[28px] font-bold text-text-primary leading-none tnum mt-1.5">
                    <CountUp value={k.cur} unit={k.unit} />
                  </p>
                  {k.sub && (
                    <p className="text-[12px] text-text-tertiary mt-1.5 truncate">
                      {k.sub}
                    </p>
                  )}
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
