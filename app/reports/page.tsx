import Link from "next/link";
import {
  DollarSign,
  KeyRound,
  Users,
  Package,
  ReceiptText,
  CircleDot,
  CalendarClock,
} from "lucide-react";
import { getDb } from "@/lib/db";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatTile } from "@/components/ui/StatTile";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { OfferingIcon } from "@/components/ui/OfferingIcon";
import { ReportsExport } from "@/components/reports/ReportsExport";
import {
  DonutChart,
  Legend,
  VIZ,
  VIZ_SERIES,
} from "@/components/charts/Charts";
import { listOfferings } from "@/lib/offerings";
import { portfolioReport, REVENUE_TYPE_META } from "@/lib/revenue";
import { buildDeals, formatMoney, STAGE_PROBABILITY } from "@/lib/pipeline";
import { cn, formatDate } from "@/lib/utils";

export const metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

// The offering-owner / executive report (Suren, Jul 5 doc): "how many licenses,
// how many customers have bought them, how much revenue, is there any progress
// currently going on" — cumulated across every offering and customer from the
// per-account revenue lines. Everything real; exports to Excel.
export default async function ReportsPage() {
  const db = getDb();
  const [customers, sessions, contacts, interactions] = await Promise.all([
    db.customers.list(),
    db.pitchSessions.list(),
    db.contacts.list(),
    db.interactions.list(),
  ]);
  const offerings = listOfferings().map((o) => ({
    id: o.id,
    offering_name: o.offering_name,
    offering_category: o.offering_category,
  }));
  const report = portfolioReport(customers, offerings);

  // "Progress currently going on" — open deals still in flight (his question).
  const deals = buildDeals(sessions, customers, contacts, interactions);
  const openDeals = deals.filter((d) => d.stage !== "Closed Lost");
  const openValue = openDeals.reduce((s, d) => s + d.value, 0);
  const weightedOpen = openDeals.reduce(
    (s, d) => s + d.value * (STAGE_PROBABILITY[d.stage] ?? 0),
    0
  );

  const hasRevenue = report.totalRevenue > 0 || report.offeringCount > 0;

  const tiles = [
    { label: "Offering revenue", value: formatMoney(report.totalRevenue), sub: "on the books", icon: DollarSign },
    { label: "Licensed users", value: String(report.totalLicenses), sub: "seats sold", icon: KeyRound },
    { label: "Customers", value: String(report.customerCount), sub: "using offerings", icon: Users },
    { label: "Offerings sold", value: String(report.offeringCount), sub: "generating revenue", icon: Package },
    { label: "Contracts", value: String(report.lineCount), sub: `${report.activeCount} active now`, icon: ReceiptText },
    { label: "In progress", value: formatMoney(openValue), sub: `${openDeals.length} open deals`, icon: CircleDot },
  ];

  // Chart data
  const categorySegments = report.byCategory.map((c, i) => ({
    label: c.label,
    value: c.value,
    color: VIZ_SERIES[i % VIZ_SERIES.length],
    // Which offerings make up this category's revenue (Suren: every graph → who).
    tip: report.byOffering
      .filter((o) => o.category === c.label && o.revenue > 0)
      .map((o) => ({ name: o.name, value: formatMoney(o.revenue) })),
  }));
  const TYPE_COLOR: Record<string, string> = {
    annual: VIZ.blue,
    project: VIZ.indigo,
    annual_service: VIZ.teal,
    license: VIZ.green,
  };
  const typeSegments = report.byType.map((t) => ({
    label: t.label,
    value: t.revenue,
    color: TYPE_COLOR[t.type] || VIZ.slate,
    // Which contracts make up this revenue type — branded with the customer's
    // logo so each slice reads as a real row (Suren: "add the logo").
    tip: report.renewals
      .filter((r) => r.revenue_type === t.type)
      .map((r) => ({
        logo: r.customer,
        name: `${r.customer} · ${r.offering}`,
        value: formatMoney(r.amount),
      })),
  }));

  return (
    <div className="space-y-6 stagger">
      <PageHeader
        title="Reports"
        subtitle="Revenue across every offering — how much we make, how many licenses and customers, and what's in flight. All from the revenue logged on each account."
        action={<ReportsExport report={report} />}
      />

      {!hasRevenue ? (
        <EmptyState
          icon={ReceiptText}
          title="No offering revenue yet"
          description="As reps log the revenue on the offerings each customer uses (on the customer's Offerings tab), it rolls up here — total revenue, licenses, customers, renewals, and what's in progress."
        />
      ) : (
        <>
          <section className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {tiles.map((t) => (
              <StatTile
                key={t.label}
                icon={t.icon}
                label={t.label}
                value={t.value}
                sub={t.sub}
              />
            ))}
          </section>


          {/* Two donuts side by side — by category and by revenue type */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <Card>
              <h2 className="text-[15px] font-semibold text-text-primary mb-1">
                Revenue by category
              </h2>
              <p className="text-[12px] text-text-tertiary mb-4">
                Where revenue sits across the six offering categories.
              </p>
              <div className="flex items-center gap-6">
                <DonutChart
                  segments={categorySegments}
                  size={150}
                  thickness={16}
                  centerLabel={formatMoney(report.totalRevenue)}
                  centerSub="total"
                />
                <Legend
                  items={categorySegments.map((s) => ({
                    label: s.label,
                    color: s.color,
                    value: formatMoney(s.value),
                  }))}
                />
              </div>
            </Card>
            <Card>
              <h2 className="text-[15px] font-semibold text-text-primary mb-1">
                Revenue by type
              </h2>
              <p className="text-[12px] text-text-tertiary mb-4">
                Annual, project, service and license revenue.
              </p>
              <div className="flex items-center gap-6">
                <DonutChart
                  segments={typeSegments}
                  size={150}
                  thickness={16}
                  centerLabel={formatMoney(report.totalRevenue)}
                  centerSub="total"
                />
                <Legend
                  items={report.byType.map((t) => ({
                    label: `${t.label} (${t.count})`,
                    color: TYPE_COLOR[t.type] || VIZ.slate,
                    value: formatMoney(t.revenue),
                  }))}
                />
              </div>
            </Card>
          </section>

          {/* Per-offering revenue detail */}
          <Card className="p-0 overflow-hidden">
            <div className="px-5 pt-4 pb-2.5">
              <h2 className="text-[15px] font-semibold text-text-primary">
                Every offering, by revenue
              </h2>
              <p className="text-[12px] text-text-tertiary">
                Customers, revenue, licenses and contracts per offering.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-surface border-b border-border-light">
                    {[
                      { h: "Offering" },
                      { h: "Category" },
                      { h: "Customers", num: true },
                      { h: "Revenue", num: true },
                      { h: "Licenses", num: true },
                      { h: "Contracts", num: true },
                    ].map(({ h, num }) => (
                      <th
                        key={h}
                        className={cn(
                          "px-5 py-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-text-tertiary whitespace-nowrap",
                          num && "text-right w-[1%]"
                        )}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-light">
                  {report.byOffering.map((o) => (
                    <tr key={o.offering_id}>
                      <td className="px-5 py-3 text-[13px] font-semibold whitespace-nowrap">
                        <Link
                          href={`/offerings/${o.offering_id}?tab=reports`}
                          className="inline-flex items-center gap-2.5 text-text-primary hover:text-blue-primary"
                        >
                          <OfferingIcon name={o.name} className="w-7 h-7" />
                          {o.name}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-[12.5px] text-text-secondary whitespace-nowrap">
                        {o.category}
                      </td>
                      <td className="px-5 py-3 text-[13px] text-text-secondary tnum text-right">{o.customers}</td>
                      <td className="px-5 py-3 text-[13px] font-semibold text-text-primary tnum whitespace-nowrap text-right">
                        {formatMoney(o.revenue)}
                      </td>
                      <td className="px-5 py-3 text-[13px] text-text-secondary tnum text-right">
                        {o.licenses || "—"}
                      </td>
                      <td className="px-5 py-3 text-[13px] text-text-secondary tnum text-right">{o.lines}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Renewals — the licenses/contracts and when they end */}
          <Card className="p-0 overflow-hidden">
            <div className="px-5 pt-4 pb-2.5 flex items-center gap-2">
              <CalendarClock size={16} strokeWidth={1.9} className="text-blue-primary" />
              <div>
                <h2 className="text-[15px] font-semibold text-text-primary">
                  Renewals &amp; contract terms
                </h2>
                <p className="text-[12px] text-text-tertiary">
                  Every contract by end date — what&apos;s up for renewal soonest.
                </p>
              </div>
            </div>
            {report.renewals.length === 0 ? (
              <p className="px-5 pb-5 text-[13px] text-text-secondary">
                No dated contracts yet — add start/end dates to a revenue line and
                renewals track here.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-surface border-b border-border-light">
                      {[
                        { h: "Customer" },
                        { h: "Offering" },
                        { h: "Type", shrink: true },
                        { h: "Revenue", num: true },
                        { h: "Ends", num: true },
                        { h: "Status", shrink: true },
                      ].map(({ h, num, shrink }) => (
                        <th
                          key={h}
                          className={cn(
                            "px-5 py-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-text-tertiary whitespace-nowrap",
                            num && "text-right w-[1%]",
                            shrink && "w-[1%]"
                          )}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-light">
                    {report.renewals.map((r, i) => (
                      <tr key={`${r.customer_id}-${r.offering_id}-${i}`}>
                        <td className="px-5 py-3 whitespace-nowrap">
                          <Link
                            href={`/customers/${r.customer_id}?tab=offerings`}
                            className="group/customer flex items-center gap-2.5"
                          >
                            <CompanyLogo name={r.customer} className="w-7 h-7 text-[10px]" />
                            <span className="text-[13px] font-semibold text-text-primary group-hover/customer:text-blue-primary">
                              {r.customer}
                            </span>
                          </Link>
                        </td>
                        <td className="px-5 py-3 text-[12.5px] text-text-secondary whitespace-nowrap">
                          {r.offering}
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-blue-primary bg-blue-light rounded px-2 py-0.5">
                            {REVENUE_TYPE_META[r.revenue_type].short}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-[13px] font-semibold text-text-primary tnum whitespace-nowrap text-right">
                          {formatMoney(r.amount)}
                        </td>
                        <td className="px-5 py-3 text-[12.5px] text-text-secondary tnum whitespace-nowrap text-right">
                          {formatDate(r.end_date)}
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap">
                          <span
                            className={cn(
                              "text-[11px] font-semibold uppercase tracking-[0.04em] rounded-full px-2.5 py-0.5",
                              r.daysLeft < 0
                                ? "text-error bg-error/10"
                                : r.daysLeft <= 90
                                ? "text-warning bg-warning/10"
                                : "text-success bg-success/10"
                            )}
                          >
                            {r.daysLeft < 0
                              ? "Expired"
                              : r.daysLeft <= 90
                              ? `${r.daysLeft}d — renew soon`
                              : "Active"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <p className="text-[12px] text-text-tertiary">
            <span className="font-semibold text-text-primary tnum">
              {formatMoney(weightedOpen)}
            </span>{" "}
            weighted pipeline is still in progress on top of the{" "}
            {formatMoney(report.totalRevenue)} already on the books — see the{" "}
            <Link href="/forecast" className="text-blue-primary hover:underline">
              forecast
            </Link>{" "}
            for the deal-by-deal view.
          </p>
        </>
      )}
    </div>
  );
}
