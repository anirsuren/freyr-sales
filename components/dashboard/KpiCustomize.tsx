"use client";

import { useEffect, useState } from "react";
import { SlidersHorizontal, Check } from "lucide-react";
import { cn } from "@/lib/utils";

// The KPI "Customize" + "vs range" controls, lifted OUT of the KPI section into
// the dashboard header row (next to Digest / Export CSV) — Suren didn't want them
// eating a whole row above the cards. State is shared with the KPI grid via
// localStorage + a window event so the two stay in sync without a context.
export const KPI_STORE = "freyr.kpis.hidden.v1";
export const KPI_COMPARE = "freyr.kpis.compare";
export const KPI_EVENT = "freyr:kpis-change";

export function KpiCustomize({
  kpis,
  comparable,
  rangeLabel,
}: {
  kpis: { key: string; label: string }[];
  comparable: boolean;
  rangeLabel: string;
}) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [compareOn, setCompareOn] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KPI_STORE);
      if (raw) setHidden(new Set(JSON.parse(raw)));
      const c = localStorage.getItem(KPI_COMPARE);
      if (c != null) setCompareOn(c === "1");
    } catch {}
  }, []);

  function broadcast() {
    window.dispatchEvent(new Event(KPI_EVENT));
  }
  function toggleHidden(key: string) {
    const next = new Set(hidden);
    next.has(key) ? next.delete(key) : next.add(key);
    if (next.size >= kpis.length) return; // never hide all
    setHidden(next);
    try {
      localStorage.setItem(KPI_STORE, JSON.stringify(Array.from(next)));
    } catch {}
    broadcast();
  }
  function toggleCompare() {
    const v = !compareOn;
    setCompareOn(v);
    try {
      localStorage.setItem(KPI_COMPARE, v ? "1" : "0");
    } catch {}
    broadcast();
  }

  return (
    <>
      {comparable && (
        <button
          onClick={toggleCompare}
          aria-pressed={compareOn}
          className={cn(
            "text-[13px] font-medium px-3 py-2 rounded-md border transition-colors whitespace-nowrap",
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
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={open}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium px-3 py-2 rounded-md border border-border text-text-secondary hover:bg-surface transition-colors"
        >
          <SlidersHorizontal size={14} strokeWidth={1.8} />
          Customize
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
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
    </>
  );
}
