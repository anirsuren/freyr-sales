"use client";

import { Download } from "lucide-react";
import { toCSV, downloadCSV } from "@/lib/csv";
import type { PortfolioReport } from "@/lib/revenue";

// Suren lives in Excel and said he'll "ask for a report" — this hands him the
// whole revenue book as raw numbers: the headline totals, revenue per offering,
// and every renewal date, all summable/chartable in a spreadsheet.
export function ReportsExport({ report }: { report: PortfolioReport }) {
  function exportCsv() {
    const summary = toCSV(
      ["Metric", "Value"],
      [
        ["Total offering revenue", report.totalRevenue],
        ["Licensed users sold", report.totalLicenses],
        ["Customers using offerings", report.customerCount],
        ["Offerings with revenue", report.offeringCount],
        ["Revenue lines (contracts)", report.lineCount],
        ["Currently active contracts", report.activeCount],
      ]
    );
    const byOffering = toCSV(
      ["Offering", "Category", "Customers", "Revenue", "Licenses", "Contracts"],
      report.byOffering.map((o) => [
        o.name,
        o.category,
        o.customers,
        o.revenue,
        o.licenses,
        o.lines,
      ])
    );
    const renewals = toCSV(
      ["Customer", "Offering", "Type", "Revenue", "End date", "Days left"],
      report.renewals.map((r) => [
        r.customer,
        r.offering,
        r.revenue_type,
        r.amount,
        r.end_date,
        r.daysLeft,
      ])
    );
    downloadCSV(
      "freyr-offering-report.csv",
      [summary, "", byOffering, "", renewals].join("\n")
    );
  }

  // Nothing logged yet means nothing to export. The button used to stay live
  // on a page whose body reads "No offering revenue yet", and handed back an
  // empty spreadsheet (Anir, Aug 14).
  const empty = report.lineCount === 0;

  return (
    <button
      onClick={exportCsv}
      disabled={empty}
      title={empty ? "Nothing to export yet. No revenue has been logged." : undefined}
      className="flex items-center gap-2 text-[13px] font-medium px-3 py-2 rounded-lg border border-border text-text-secondary hover:bg-surface transition-colors disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent"
    >
      <Download size={16} strokeWidth={1.5} />
      Export CSV
    </button>
  );
}
