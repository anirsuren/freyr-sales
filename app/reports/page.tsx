import Link from "next/link";
import {
  DollarSign,
  KeyRound,
  Users,
  Package,
  ReceiptText,
  CircleDot,
  CalendarClock,
  Grid3X3,
  ArrowRight,
} from "lucide-react";
import { getDb } from "@/lib/db";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatTile } from "@/components/ui/StatTile";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { OfferingIcon } from "@/components/ui/OfferingIcon";
import { HoverCard } from "@/components/ui/HoverCard";
import { ReportsExport } from "@/components/reports/ReportsExport";
import {
  DonutChart,
  DonutLegend,
  LineChart,
  Sparkline,
  VIZ,
  VIZ_SERIES,
} from "@/components/charts/Charts";
import { ExpandedChartModal } from "@/components/charts/ExpandedChartModal";
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
  const CATEGORY_SHORT: Record<string, string> = {
    "Global Regulatory Intelligence": "Global intelligence",
    "Regulatory Information Management": "RIM",
    "Submissions and Document Operations": "Submissions",
    "Labeling and Artwork": "Labeling & artwork",
    "Freya Fusion Platform and Agents": "Freya Fusion",
  };
  const categoryLegend = categorySegments.map((segment) => ({
    ...segment,
    label: CATEGORY_SHORT[segment.label] || segment.label,
  }));
  // Four contract types, four clearly different hues. blue/indigo were near
  // twins and teal/green were the pair Anir called out as "so similar"; these
  // sit a quarter-turn apart on the wheel so a glance at the Type column is
  // enough (Anir, Jul 25: "it has to be distinct and easy").
  const TYPE_COLOR: Record<string, string> = {
    annual: "#2563EB", // blue
    project: "#7C3AED", // violet
    annual_service: "#C2410C", // burnt orange, this colour is also the Type chip's TEXT (below), and amber was unreadable there
    license: "#059669", // emerald
  };
  const typeSegments = report.byType.map((t) => ({
    label: REVENUE_TYPE_META[t.type].short,
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
  const renewalHorizons = [0, 90, 180, 365];
  const renewalHorizonLabels = ["Now", "90 days", "180 days", "1 year"];
  const topOfferings = report.byOffering
    .filter((offering) => offering.revenue > 0)
    .slice(0, 4);
  const offeringTrendSeries = topOfferings.map((offering, index) => ({
    label: offering.name,
    color: VIZ_SERIES[index % VIZ_SERIES.length],
    points: renewalHorizons.map((horizon) =>
      report.renewals
        .filter(
          (renewal) =>
            renewal.offering_id === offering.offering_id &&
            renewal.daysLeft >= horizon
        )
        .reduce((total, renewal) => total + renewal.amount, 0)
    ),
  }));
  const offeringTrendTips = renewalHorizons.map((horizon) =>
    report.renewals
      .filter((renewal) => renewal.daysLeft >= horizon)
      .slice(0, 6)
      .map((renewal) => ({
        logo: renewal.customer,
        name: renewal.customer,
        sub: `${renewal.offering} · ${REVENUE_TYPE_META[renewal.revenue_type].short}`,
        value: formatMoney(renewal.amount),
      }))
  );
  const offeringInsights = new Map(
    report.byOffering.map((offering) => {
      const renewals = report.renewals.filter(
        (renewal) => renewal.offering_id === offering.offering_id
      );
      const customerRevenue = new Map<string, number>();
      for (const renewal of renewals) {
        customerRevenue.set(
          renewal.customer,
          (customerRevenue.get(renewal.customer) || 0) + renewal.amount
        );
      }
      const rankedCustomers = Array.from(customerRevenue.entries()).sort(
        (a, b) => b[1] - a[1]
      );
      const visibleCustomers = rankedCustomers.slice(0, 4);
      const otherRevenue = rankedCustomers
        .slice(4)
        .reduce((sum, [, value]) => sum + value, 0);
      const customerSegments = [
        ...visibleCustomers.map(([customer, value], index) => ({
          label: customer,
          value,
          color: VIZ_SERIES[index % VIZ_SERIES.length],
          tip: [
            {
              logo: customer,
              name: customer,
              value: formatMoney(value),
            },
          ],
        })),
        ...(otherRevenue > 0
          ? [
              {
                label: "Other customers",
                value: otherRevenue,
                color: VIZ.slate,
                tip: rankedCustomers.slice(4).map(([customer, value]) => ({
                  logo: customer,
                  name: customer,
                  value: formatMoney(value),
                })),
              },
            ]
          : []),
      ];
      const renewalCurve = renewalHorizons.map((horizon) =>
        renewals
          .filter((renewal) => renewal.daysLeft >= horizon)
          .reduce((sum, renewal) => sum + renewal.amount, 0)
      );
      return [
        offering.offering_id,
        { customerSegments, renewalCurve, renewals },
      ] as const;
    })
  );

  return (
    <div className="space-y-6 stagger">
      <PageHeader
        title="Reports"
        subtitle="Portfolio reporting across customers, offerings, revenue, contracts, and active sales motions."
        action={<ReportsExport report={report} />}
      />

      <Card className="p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-light text-blue-primary">
            <Grid3X3 size={19} strokeWidth={1.8} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold text-text-primary">
              Customer Offering Heat Map
            </h2>
            <p className="mt-1 max-w-[720px] text-[12px] leading-relaxed text-text-secondary">
              See the current motion for every customer and offering, then
              open a pairing for value, dates, linked records and history.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-5">
            <div className="hidden items-center gap-5 sm:flex">
              <p className="whitespace-nowrap text-[11px] text-text-tertiary">
                <span className="mr-1 font-bold text-text-primary tnum">
                  {customers.length}
                </span>
                customers
              </p>
              <p className="whitespace-nowrap text-[11px] text-text-tertiary">
                <span className="mr-1 font-bold text-text-primary tnum">
                  {offerings.length}
                </span>
                offerings
              </p>
            </div>
            <Link
              href="/reports/customer-offering-heat-map"
              className="group inline-flex h-9 items-center gap-2 rounded-md border border-border bg-white px-3.5 text-[12px] font-semibold text-text-primary transition-[transform,background-color,border-color] hover:border-blue-subtle hover:bg-blue-light active:scale-[0.97]"
            >
              Open report
              <ArrowRight
                size={14}
                strokeWidth={2}
                className="text-blue-primary transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          </div>
        </div>
      </Card>

      {!hasRevenue ? (
        <EmptyState
          icon={ReceiptText}
          title="No offering revenue yet"
          description="Reps log revenue on each customer's Offerings tab. It rolls up here: total revenue, licenses, customers, renewals, and what is still in progress."
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


          {/* Three complementary revenue views in one compact row. Donut
              legends stay one item per line so labels never wrap into a
              confusing left-to-right tag cloud. */}
          <section
            data-tour="reports-revenue"
            className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-3"
          >
            <Card className="flex h-full min-h-[236px] flex-col p-4">
              <div className="flex min-h-[56px] items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="mb-1 text-[15px] font-semibold text-text-primary">
                    Revenue by category
                  </h2>
                  <p className="text-[12px] leading-[1.35] text-text-tertiary">
                    Revenue across offering categories.
                  </p>
                </div>
                <ExpandedChartModal
                  title="Revenue by category"
                  subtitle="Revenue across offering categories."
                  chart={{
                    kind: "donut",
                    segments: categoryLegend,
                    centerLabel: formatMoney(report.totalRevenue),
                    centerSub: "total",
                    format: "money",
                    legendBars: false,
                    legendValues: false,
                  }}
                  className="h-8 whitespace-nowrap px-2.5 text-[11px]"
                />
              </div>
              <div className="mt-3 flex min-h-[136px] flex-1 items-center">
                <div className="grid w-full grid-cols-[112px_minmax(0,1fr)] items-center gap-3">
                  <div className="h-[112px] w-[112px] shrink-0">
                    <DonutChart
                      segments={categorySegments}
                      size={112}
                      thickness={13}
                      centerLabel={formatMoney(report.totalRevenue)}
                      centerSub="total"
                      format="money"
                      syncId="reports-category"
                    />
                  </div>
                  <DonutLegend
                    items={categoryLegend}
                    total={report.totalRevenue}
                    format="money"
                    bars={false}
                    showValues={false}
                    syncId="reports-category"
                    className="text-[10.5px]"
                  />
                </div>
              </div>
            </Card>
            <Card className="flex h-full min-h-[236px] flex-col p-4">
              <div className="flex min-h-[56px] items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="mb-1 text-[15px] font-semibold text-text-primary">
                    Revenue by type
                  </h2>
                  <p className="text-[12px] leading-[1.35] text-text-tertiary">
                    Revenue by contract structure.
                  </p>
                </div>
                <ExpandedChartModal
                  title="Revenue by type"
                  subtitle="Revenue by contract structure."
                  chart={{
                    kind: "donut",
                    segments: typeSegments,
                    centerLabel: formatMoney(report.totalRevenue),
                    centerSub: "total",
                    format: "money",
                    legendBars: false,
                  }}
                  className="h-8 whitespace-nowrap px-2.5 text-[11px]"
                />
              </div>
              <div className="mt-3 flex min-h-[136px] flex-1 items-center">
                <div className="grid w-full grid-cols-[112px_minmax(0,1fr)] items-center gap-3">
                  <div className="h-[112px] w-[112px] shrink-0">
                    <DonutChart
                      segments={typeSegments}
                      size={112}
                      thickness={13}
                      centerLabel={formatMoney(report.totalRevenue)}
                      centerSub="total"
                      format="money"
                      syncId="reports-type"
                    />
                  </div>
                  <DonutLegend
                    items={typeSegments}
                    total={report.totalRevenue}
                    format="money"
                    bars={false}
                    syncId="reports-type"
                    className="text-[10.5px]"
                  />
                </div>
              </div>
            </Card>
            <Card className="flex h-full min-h-[236px] flex-col p-4">
              <div className="flex min-h-[56px] items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="mb-1 text-[15px] font-semibold text-text-primary">
                    Top offerings
                  </h2>
                  <p className="text-[12px] leading-[1.35] text-text-tertiary">
                    Contracted revenue remaining through upcoming renewals.
                  </p>
                </div>
                <ExpandedChartModal
                  title="Top offerings"
                  subtitle="Contracted revenue remaining through upcoming renewals."
                  chart={{
                    kind: "line",
                    series: offeringTrendSeries,
                    xLabels: renewalHorizonLabels,
                    pointLabels: renewalHorizonLabels,
                    pointTips: offeringTrendTips,
                    format: "money",
                  }}
                  className="h-8 whitespace-nowrap px-2.5 text-[11px]"
                />
              </div>
              <div className="mt-3 flex min-h-[136px] flex-1 flex-col">
                <div className="mb-2 grid min-w-0 grid-cols-2 gap-x-3 gap-y-1.5">
                  {topOfferings.map((offering, index) => (
                    <span
                      key={offering.offering_id}
                      className="inline-flex min-w-0 items-start gap-1.5 text-[9.5px] leading-[1.2] text-text-secondary"
                    >
                      <span
                        className="mt-0.5 h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: VIZ_SERIES[index % VIZ_SERIES.length] }}
                      />
                      <span className="break-words">{offering.name}</span>
                    </span>
                  ))}
                </div>
                <div className="mt-auto">
                  <LineChart
                    series={offeringTrendSeries}
                    xLabels={renewalHorizonLabels}
                    pointLabels={renewalHorizonLabels}
                    pointTips={offeringTrendTips}
                    height={106}
                    format="money"
                  />
                </div>
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
                      { h: "Revenue runway" },
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
                  {report.byOffering.map((o) => {
                    const insight = offeringInsights.get(o.offering_id);
                    return (
                    <tr key={o.offering_id}>
                      <td className="px-5 py-3 text-[13px] font-semibold whitespace-nowrap">
                        <HoverCard
                          side="right"
                          width={430}
                          delayMs={0}
                          content={
                            <div>
                              <div className="flex items-center gap-2.5 border-b border-border-light pb-2.5">
                                <OfferingIcon
                                  name={o.name}
                                  className="h-9 w-9 shrink-0"
                                />
                                <div className="min-w-0">
                                  <p className="truncate text-[13.5px] font-semibold text-text-primary">
                                    {o.name}
                                  </p>
                                  <p className="truncate text-[10.5px] text-text-tertiary">
                                    {o.category}
                                  </p>
                                </div>
                              </div>
                              <div className="mt-3 grid grid-cols-[minmax(0,1fr)_120px] gap-4">
                                <div>
                                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
                                    Revenue by customer
                                  </p>
                                  {insight?.customerSegments.length ? (
                                    <div className="flex items-center gap-2.5">
                                      <DonutChart
                                        segments={insight.customerSegments}
                                        size={82}
                                        thickness={10}
                                        centerLabel={formatMoney(o.revenue)}
                                        centerSub="booked"
                                        format="money"
                                        syncId={`report-offering-${o.offering_id}`}
                                      />
                                      <DonutLegend
                                        items={insight.customerSegments}
                                        total={o.revenue}
                                        format="money"
                                        showValues={false}
                                        syncId={`report-offering-${o.offering_id}`}
                                        className="min-w-0 text-[9.5px]"
                                      />
                                    </div>
                                  ) : (
                                    <p className="rounded-lg bg-surface px-3 py-4 text-[11px] text-text-tertiary">
                                      No booked revenue yet.
                                    </p>
                                  )}
                                </div>
                                <div className="grid grid-cols-1 gap-2">
                                  {[
                                    ["Customers", String(o.customers)],
                                    ["Licenses", String(o.licenses || 0)],
                                    ["Contracts", String(o.lines)],
                                  ].map(([label, value]) => (
                                    <div
                                      key={label}
                                      className="rounded-lg bg-surface px-2.5 py-2"
                                    >
                                      <p className="text-[8.5px] font-semibold uppercase tracking-[0.03em] text-text-tertiary">
                                        {label}
                                      </p>
                                      <p className="mt-0.5 text-[13px] font-bold leading-none text-text-primary tnum">
                                        {value}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <div className="mt-3 border-t border-border-light pt-2.5">
                                <div className="mb-1 flex items-center justify-between gap-3">
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
                                    Contracted revenue remaining
                                  </p>
                                  <span className="text-[10px] text-text-tertiary tnum">
                                    {insight?.renewals.length || 0} renewals
                                  </span>
                                </div>
                                <Sparkline
                                  points={insight?.renewalCurve || [0, 0, 0, 0]}
                                  color={VIZ.blue}
                                  height={48}
                                  format="money"
                                  xLabels={renewalHorizonLabels}
                                  label={`${o.name} remaining revenue`}
                                />
                              </div>
                              <p className="mt-2.5 border-t border-border-light pt-2.5 text-[11.5px] font-medium text-blue-primary">
                                View full offering report →
                              </p>
                            </div>
                          }
                        >
                          <Link
                            href={`/offerings/${o.offering_id}?tab=reports`}
                            className="inline-flex items-center gap-2.5 text-text-primary hover:text-blue-primary"
                          >
                            <OfferingIcon name={o.name} className="w-7 h-7" />
                            {o.name}
                          </Link>
                        </HoverCard>
                      </td>
                      <td className="px-5 py-3 text-[12.5px] text-text-secondary whitespace-nowrap">
                        {o.category}
                      </td>
                      <td className="px-5 py-3 text-[13px] text-text-secondary tnum text-right">{o.customers}</td>
                      <td className="px-5 py-3 text-[13px] font-semibold text-text-primary tnum whitespace-nowrap text-right">
                        {formatMoney(o.revenue)}
                      </td>
                      <td className="px-5 py-3 text-[13px] text-text-secondary tnum text-right">
                        {o.licenses || "-"}
                      </td>
                      <td className="w-[150px] px-5 py-3">
                        <Sparkline
                          points={insight?.renewalCurve || [0, 0, 0, 0]}
                          color={o.revenue > 0 ? VIZ.blue : VIZ.slate}
                          height={30}
                          format="money"
                          xLabels={renewalHorizonLabels}
                          label={`${o.name} revenue runway`}
                          pointTips={renewalHorizons.map((horizon) =>
                            (insight?.renewals || [])
                              .filter(
                                (renewal) => renewal.daysLeft >= horizon
                              )
                              .map((renewal) => ({
                                logo: renewal.customer,
                                name: renewal.customer,
                                value: formatMoney(renewal.amount),
                              }))
                          )}
                        />
                      </td>
                      <td className="px-5 py-3 text-[13px] text-text-secondary tnum text-right">{o.lines}</td>
                    </tr>
                  )})}
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
                  Every contract by end date, what&apos;s up for renewal soonest.
                </p>
              </div>
            </div>
            {report.renewals.length === 0 ? (
              <p className="px-5 pb-5 text-[13px] text-text-secondary">
                No dated contracts yet, add start/end dates to a revenue line and
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
                        {/* Each contract type carries its OWN colour — the same
                            one the revenue-by-type donut uses, instead of every
                            row reading identical blue (Anir, Jul 25: "we need
                            proper color-coded tags here in the type column"). */}
                        <td className="px-5 py-3 whitespace-nowrap">
                          <span
                            className="inline-block text-[11px] font-semibold uppercase tracking-[0.04em] rounded px-2 py-0.5"
                            style={{
                              color: TYPE_COLOR[r.revenue_type] || VIZ.slate,
                              background: `${TYPE_COLOR[r.revenue_type] || VIZ.slate}1A`,
                            }}
                          >
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
                              ? `${r.daysLeft}d: renew soon`
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
            {formatMoney(report.totalRevenue)} already on the books, see the{" "}
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
