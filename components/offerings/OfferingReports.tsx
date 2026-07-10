import Link from "next/link";
import { Users, DollarSign, KeyRound, ReceiptText } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { DonutChart, Legend, VIZ_SERIES } from "@/components/charts/Charts";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { formatMoney } from "@/lib/pipeline";
import { formatDate } from "@/lib/utils";
import { REVENUE_TYPE_META, type OfferingReport } from "@/lib/revenue";

// The offering owner's report (Suren, Jul 5): for THIS offering, everything
// cumulated across the customers using it — how many customers, total revenue,
// licensed users, and the revenue lines behind each. All pulled from the
// per-customer revenue entered on each account.
export function OfferingReports({
  report,
  offeringName,
}: {
  report: OfferingReport;
  offeringName: string;
}) {
  if (report.customerCount === 0) {
    return (
      <Card className="mt-6">
        <h2 className="text-[15px] font-semibold text-text-primary mb-1">
          No revenue yet
        </h2>
        <p className="text-[13px] text-text-secondary leading-relaxed max-w-[620px]">
          Once a customer marks {offeringName} as one they&apos;re using and adds
          the revenue on their account, it rolls up here — total revenue, how
          many customers, and how many licensed users, all in one place for the
          offering owner.
        </p>
      </Card>
    );
  }

  const segments = report.customers
    .filter((c) => c.revenue > 0)
    .map((c, i) => ({
      label: c.name,
      value: c.revenue,
      color: VIZ_SERIES[i % VIZ_SERIES.length],
    }));

  return (
    <div className="mt-6 space-y-6">
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile
          icon={Users}
          label="Customers"
          value={String(report.customerCount)}
          sub="using it"
        />
        <StatTile
          icon={DollarSign}
          label="Total revenue"
          value={formatMoney(report.totalRevenue)}
          sub="across all customers"
        />
        <StatTile
          icon={KeyRound}
          label="Licensed users"
          value={String(report.totalLicenses)}
          sub="seats sold"
        />
        <StatTile
          icon={ReceiptText}
          label="Revenue lines"
          value={String(report.lineCount)}
          sub="contracts on file"
        />
      </section>

      {segments.length > 0 && (
        <Card>
          <h2 className="text-[15px] font-semibold text-text-primary mb-1">
            Revenue by customer
          </h2>
          <p className="text-[12px] text-text-tertiary mb-4">
            Where this offering&apos;s revenue comes from.
          </p>
          <div className="flex items-center gap-6 flex-wrap">
            <DonutChart
              segments={segments}
              size={150}
              thickness={16}
              centerLabel={formatMoney(report.totalRevenue)}
              centerSub="total"
            />
            <Legend
              items={segments.map((s) => ({
                label: s.label,
                color: s.color,
                value: formatMoney(s.value),
              }))}
            />
          </div>
        </Card>
      )}

      <Card className="p-0 overflow-hidden">
        <div className="px-5 pt-4 pb-2.5">
          <h2 className="text-[15px] font-semibold text-text-primary">
            Revenue detail
          </h2>
          <p className="text-[12px] text-text-tertiary">
            Every revenue line, by customer.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-surface border-b border-border-light">
                {["Customer", "Type", "Revenue", "Licenses", "Term", "Notes"].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-5 py-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-text-tertiary whitespace-nowrap"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light">
              {report.customers.flatMap((c) =>
                (c.lines.length ? c.lines : [null]).map((l, i) => (
                  <tr key={`${c.id}-${l?.id ?? i}`}>
                    <td className="px-5 py-3 text-[13px] whitespace-nowrap">
                      {i === 0 ? (
                        <Link
                          href={`/customers/${c.id}?tab=offerings`}
                          className="inline-flex items-center gap-2.5 font-semibold text-text-primary hover:text-blue-primary"
                        >
                          <CompanyLogo name={c.name} className="w-7 h-7 text-[10px]" />
                          {c.name}
                        </Link>
                      ) : (
                        // Continuation line for the same customer — muted, indented,
                        // no cryptic arrow (Anir, Jul 8: "what is this enter icon?").
                        <span className="inline-flex items-center gap-2.5 pl-[38px] text-text-tertiary">
                          {c.name}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      {l ? (
                        <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-blue-primary bg-blue-light rounded px-2 py-0.5">
                          {REVENUE_TYPE_META[l.revenue_type].short}
                        </span>
                      ) : (
                        <span className="text-[12.5px] text-text-tertiary">
                          in use — no revenue yet
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-[13px] font-semibold text-text-primary tnum whitespace-nowrap">
                      {l ? formatMoney(l.amount) : "—"}
                    </td>
                    <td className="px-5 py-3 text-[13px] text-text-secondary tnum whitespace-nowrap">
                      {l && l.revenue_type === "license" && l.num_licenses
                        ? l.num_licenses
                        : "—"}
                    </td>
                    <td className="px-5 py-3 text-[12.5px] text-text-tertiary tnum whitespace-nowrap">
                      {l && (l.start_date || l.end_date)
                        ? `${formatDate(l.start_date)} → ${formatDate(l.end_date)}`
                        : "—"}
                    </td>
                    <td className="px-5 py-3 text-[12.5px] text-text-secondary max-w-[240px] truncate">
                      {l?.description || "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
