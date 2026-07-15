"use client";

import { Download } from "lucide-react";
import { toCSV, downloadCSV } from "@/lib/csv";

export interface ExportRow {
  company: string;
  contact: string;
  service: string;
  outcome: string;
  date: string;
}

export function DashboardExport({ rows }: { rows: ExportRow[] }) {
  function exportCsv() {
    const csv = toCSV(
      ["Customer", "Contact", "Recommended Service", "Outcome", "Date"],
      rows.map((r) => [r.company, r.contact, r.service, r.outcome, r.date])
    );
    downloadCSV("freyr-dashboard-sessions.csv", csv);
  }
  return (
    <button
      onClick={exportCsv}
      data-dashboard-menu-close
      className="flex items-center gap-2 text-[13px] font-medium px-3 py-2 rounded-lg border border-border text-text-secondary hover:bg-surface transition-colors"
    >
      <Download size={16} strokeWidth={1.5} />
      Export CSV
    </button>
  );
}
