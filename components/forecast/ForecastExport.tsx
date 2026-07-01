"use client";

import { Download } from "lucide-react";
import { toCSV, downloadCSV } from "@/lib/csv";

interface StageRow {
  stage: string;
  prob: number;
  count: number;
  value: number;
  weighted: number;
}
interface RepRow {
  name: string;
  open: number;
  weighted: number;
  pct: number;
}

// Forecast was the one board-relevant page with no export. Suren works in Excel,
// so this hands him the commit/best-case summary plus the by-stage and by-rep
// breakdowns as RAW numbers (not "$1.4M" strings) so they stay summable and
// chartable in a spreadsheet.
export function ForecastExport({
  commit,
  bestCase,
  quota,
  gap,
  byStage,
  byRep,
}: {
  commit: number;
  bestCase: number;
  quota: number;
  gap: number;
  byStage: StageRow[];
  byRep: RepRow[];
}) {
  function exportCsv() {
    const summary = toCSV(
      ["Metric", "Value"],
      [
        ["Commit (weighted)", commit],
        ["Best case (open)", bestCase],
        ["Quarter quota", quota],
        ["Gap to quota", gap],
      ]
    );
    const stage = toCSV(
      ["Stage", "Probability %", "Deals", "Value", "Weighted"],
      byStage.map((s) => [s.stage, s.prob, s.count, s.value, s.weighted])
    );
    const rep = toCSV(
      ["Rep", "Open", "Weighted", "% of quota"],
      byRep.map((r) => [r.name, r.open, r.weighted, r.pct])
    );
    downloadCSV("freyr-forecast.csv", [summary, "", stage, "", rep].join("\n"));
  }

  return (
    <button
      onClick={exportCsv}
      className="flex items-center gap-2 text-[13px] font-medium px-3 py-2 rounded-lg border border-border text-text-secondary hover:bg-surface transition-colors"
    >
      <Download size={16} strokeWidth={1.5} />
      Export CSV
    </button>
  );
}
