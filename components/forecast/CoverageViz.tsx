"use client";

import { useEffect, useState } from "react";
import { BarChart3, PieChart } from "lucide-react";
import { DonutChart, DonutLegend } from "@/components/charts/Charts";
import { formatMoney } from "@/lib/pipeline";

type View = "bar" | "pie";

const STORAGE_KEY = "freyr.forecast.coverageViz";

/**
 * The "Weighted commit coverage" block on the forecast page. Suren asked for a
 * pie option on top of the split bar ("you can keep the bar chart, but maybe
 * you have an option for the user to have a pie chart as well"), so this owns
 * the whole block client-side with a tiny bar/pie toggle. The choice persists
 * (standing rule: every UI choice must save).
 */
export function CoverageViz({
  activeWeighted,
  riskWeighted,
  activePct,
  riskPct,
  commit,
}: {
  activeWeighted: number;
  riskWeighted: number;
  activePct: number;
  riskPct: number;
  commit: number;
}) {
  // Default to "bar" for SSR, then adopt the saved choice after mount — reading
  // localStorage during render would mismatch the server-rendered HTML.
  const [view, setView] = useState<View>("bar");
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "bar" || saved === "pie") setView(saved);
  }, []);

  const pick = (next: View) => {
    setView(next);
    localStorage.setItem(STORAGE_KEY, next);
  };

  const segments = [
    { label: "Recently active", value: activeWeighted, color: "#34C759" },
    { label: "Needs attention", value: riskWeighted, color: "#FF9500" },
  ].filter((s) => s.value > 0);

  return (
    // flex-1 lets the block absorb the card's spare vertical space so the pie
    // view doesn't stretch the card; my-auto below centers whichever view.
    <div className="mt-4 flex flex-1 flex-col rounded-lg border border-border-light bg-surface/35 p-3">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold text-text-primary">Weighted commit coverage</p>
        <div className="flex items-center gap-2">
          <p className="text-[10px] text-text-tertiary tnum">{formatMoney(commit)} total</p>
          <div className="flex items-center rounded-md bg-surface p-0.5">
            <button
              type="button"
              aria-label="Bar view"
              aria-pressed={view === "bar"}
              onClick={() => pick("bar")}
              className={`flex items-center justify-center rounded p-1 transition-colors ${
                view === "bar"
                  ? "bg-white text-blue-primary shadow-sm"
                  : "text-text-tertiary hover:text-text-secondary"
              }`}
            >
              <BarChart3 size={13} />
            </button>
            <button
              type="button"
              aria-label="Pie view"
              aria-pressed={view === "pie"}
              onClick={() => pick("pie")}
              className={`flex items-center justify-center rounded p-1 transition-colors ${
                view === "pie"
                  ? "bg-white text-blue-primary shadow-sm"
                  : "text-text-tertiary hover:text-text-secondary"
              }`}
            >
              <PieChart size={13} />
            </button>
          </div>
        </div>
      </div>

      <div className="my-auto">
        {view === "bar" ? (
          <>
            <div className="flex h-3 overflow-hidden rounded-full bg-surface">
              {activePct > 0 && <span className="bg-[#34C759]" style={{ width: `${activePct}%` }} />}
              {riskPct > 0 && <span className="bg-[#FF9500]" style={{ width: `${riskPct}%` }} />}
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 text-[9.5px] text-text-secondary">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#34C759]" />{activePct}% recently active</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#FF9500]" />{riskPct}% needs attention</span>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-3">
            <DonutChart
              syncId="coverage-viz"
              segments={segments}
              size={116}
              thickness={14}
              format="money"
              centerLabel={`${activePct}%`}
              centerSub="active"
            />
            <div className="flex-1 min-w-0">
              <DonutLegend items={segments} format="money" syncId="coverage-viz" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
