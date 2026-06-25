"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { TrendingUp, TrendingDown, SlidersHorizontal, Check } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Tooltip } from "@/components/ui/Tooltip";
import { GLOSSARY } from "@/lib/glossary";
import { cn } from "@/lib/utils";
import { CountUp } from "@/components/ui/CountUp";

export type KpiItem = {
  key: string;
  label: string;
  value: string;
  cur: number;
  prev: number | null;
  unit: "money" | "count" | "pct";
  href: string;
};

const STORE = "freyr.kpis.hidden.v1";

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
  rangeLabel,
}: {
  kpis: KpiItem[];
  comparable: boolean;
  rangeLabel: string;
}) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [compareOn, setCompareOn] = useState(true);
  const [customizeOpen, setCustomizeOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) setHidden(new Set(JSON.parse(raw)));
      const c = localStorage.getItem("freyr.kpis.compare");
      if (c != null) setCompareOn(c === "1");
    } catch {}
  }, []);

  function persist(next: Set<string>) {
    setHidden(next);
    try {
      localStorage.setItem(STORE, JSON.stringify(Array.from(next)));
    } catch {}
  }
  function toggleHidden(key: string) {
    const next = new Set(hidden);
    next.has(key) ? next.delete(key) : next.add(key);
    // never hide all
    if (next.size >= kpis.length) return;
    persist(next);
  }
  function toggleCompare() {
    const v = !compareOn;
    setCompareOn(v);
    try {
      localStorage.setItem("freyr.kpis.compare", v ? "1" : "0");
    } catch {}
  }

  const shown = kpis.filter((k) => !hidden.has(k.key));
  const showDelta = comparable && compareOn;

  return (
    <section>
      <div className="flex items-center justify-end gap-2 mb-3">
        {comparable && (
          <button
            onClick={toggleCompare}
            aria-pressed={compareOn}
            className={cn(
              "text-[12px] font-medium px-2.5 py-1 rounded-md border transition-colors",
              compareOn
                ? "border-blue-primary bg-blue-light text-blue-primary"
                : "border-border text-text-secondary hover:bg-surface"
            )}
          >
            vs {rangeLabel}
          </button>
        )}
        <div className="relative">
          <button
            onClick={() => setCustomizeOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={customizeOpen}
            className="inline-flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1 rounded-md border border-border text-text-secondary hover:bg-surface transition-colors"
          >
            <SlidersHorizontal size={13} strokeWidth={1.8} />
            Customize
          </button>
          {customizeOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setCustomizeOpen(false)} />
              <div
                role="menu"
                aria-label="Customize KPIs"
                className="absolute right-0 mt-2 w-[220px] bg-white border border-border-light rounded-xl shadow-card z-50 p-1.5"
              >
                <p className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                  Show metrics
                </p>
                {kpis.map((k) => {
                  const on = !hidden.has(k.key);
                  return (
                    <button
                      key={k.key}
                      role="menuitemcheckbox"
                      aria-checked={on}
                      onClick={() => toggleHidden(k.key)}
                      className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-[13px] text-text-primary hover:bg-surface transition-colors"
                    >
                      {k.label}
                      <span
                        className={cn(
                          "w-4 h-4 rounded border flex items-center justify-center",
                          on
                            ? "bg-blue-primary border-blue-primary text-white"
                            : "border-border"
                        )}
                      >
                        {on && <Check size={12} strokeWidth={3} />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 stagger">
        {shown.map((k) => {
          const d = showDelta ? deltaLabel(k) : null;
          return (
            <Link key={k.key} href={k.href} className="block">
              <Card className="h-[120px] flex flex-col justify-between hover:border-blue-subtle transition-colors group">
                <div className="flex justify-between items-start">
                  <Tooltip label={GLOSSARY["kpi_" + k.key.toLowerCase()]?.def} side="bottom" align="left">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary group-hover:text-blue-primary transition-colors cursor-help">
                      {k.label}
                    </span>
                  </Tooltip>
                  {d && (
                    <span
                      className="flex items-center gap-1 text-[12px] font-semibold tnum"
                      style={{ color: d.dir === "down" ? "#B02020" : "#1A7A35" }}
                    >
                      {d.text}
                      {d.dir === "down" ? (
                        <TrendingDown size={14} strokeWidth={2} />
                      ) : (
                        <TrendingUp size={14} strokeWidth={2} />
                      )}
                    </span>
                  )}
                </div>
                <span className="text-[28px] font-bold text-text-primary leading-none tnum">
                  <CountUp value={k.cur} unit={k.unit} />
                </span>
              </Card>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
