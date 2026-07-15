import Link from "next/link";
import {
  CalendarRange,
  DollarSign,
  KeyRound,
  ReceiptText,
  Users,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { ChartInspector } from "@/components/charts/ChartInspector";
import {
  AreaChart,
  BarChart,
  DonutChart,
  DonutLegend,
  VIZ,
  VIZ_SERIES,
  type TipItem,
} from "@/components/charts/Charts";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { formatMoney } from "@/lib/pipeline";
import { cn, formatDate } from "@/lib/utils";
import {
  REVENUE_TYPES,
  REVENUE_TYPE_META,
  type OfferingReport,
} from "@/lib/revenue";
import type { OfferingRevenueLine } from "@/lib/types";

type ReportLine = {
  customerId: string;
  customer: string;
  line: OfferingRevenueLine;
};

function isActive(line: OfferingRevenueLine, at: Date) {
  const time = at.getTime();
  const start = line.start_date ? Date.parse(line.start_date) : Number.NEGATIVE_INFINITY;
  const end = line.end_date ? Date.parse(line.end_date) : Number.POSITIVE_INFINITY;
  return (Number.isNaN(start) || start <= time) && (Number.isNaN(end) || end >= time);
}

function lineStatus(line: OfferingRevenueLine, now: Date) {
  if (!line.end_date) return { label: "Ongoing", className: "bg-blue-light text-blue-primary" };
  const days = Math.ceil((Date.parse(line.end_date) - now.getTime()) / 86_400_000);
  if (days < 0) return { label: "Expired", className: "bg-red-50 text-red-700" };
  if (days <= 90) return { label: `${days}d left`, className: "bg-amber-50 text-amber-700" };
  return { label: "Active", className: "bg-green-50 text-green-700" };
}

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
        <h2 className="text-[15px] font-semibold text-text-primary mb-1">No revenue yet</h2>
        <p className="text-[13px] text-text-secondary leading-relaxed max-w-[620px]">
          Once a customer marks {offeringName} as in use and adds commercial terms,
          customer revenue, licenses, contract coverage, and renewals will appear here.
        </p>
      </Card>
    );
  }

  const now = new Date();
  const lines: ReportLine[] = report.customers.flatMap((customer) =>
    customer.lines.map((line) => ({
      customerId: customer.id,
      customer: customer.name,
      line,
    }))
  );
  const activeLines = lines.filter(({ line }) => isActive(line, now));
  const activeRevenue = activeLines.reduce((sum, item) => sum + item.line.amount, 0);
  const recurringTypes = new Set(["annual", "annual_service", "license"]);
  const recurringRevenue = lines
    .filter(({ line }) => recurringTypes.has(line.revenue_type))
    .reduce((sum, item) => sum + item.line.amount, 0);
  const recurringShare = report.totalRevenue
    ? Math.round((recurringRevenue / report.totalRevenue) * 100)
    : 0;
  const topCustomer = report.customers[0];
  const topCustomerShare = report.totalRevenue
    ? Math.round(((topCustomer?.revenue || 0) / report.totalRevenue) * 100)
    : 0;
  const renewals = lines
    .filter(({ line }) => line.end_date && Date.parse(line.end_date) >= now.getTime())
    .sort((a, b) => Date.parse(a.line.end_date!) - Date.parse(b.line.end_date!));
  const nextRenewal = renewals[0];
  const maxLicenses = Math.max(...report.customers.map((customer) => customer.licenses), 1);

  const customerBars = report.customers
    .filter((customer) => customer.revenue > 0)
    .map((customer, index) => ({
      label: customer.name,
      value: customer.revenue,
      color: VIZ_SERIES[index % VIZ_SERIES.length],
      tip: [
        {
          logo: customer.name,
          name: customer.name,
          sub: `${customer.licenses} licensed seats`,
          value: formatMoney(customer.revenue),
        },
      ] as TipItem[],
    }));
  const customerRecords = report.customers.map((customer) => ({
    id: customer.id,
    label: customer.name,
    meta: `${customer.licenses} licensed seats`,
    value: formatMoney(customer.revenue),
    href: `/customers/${customer.id}?tab=offerings`,
    logo: customer.name,
  }));

  const typeSegments = REVENUE_TYPES.map((type, index) => {
    const typeLines = lines.filter(({ line }) => line.revenue_type === type);
    return {
      label: REVENUE_TYPE_META[type].label,
      value: typeLines.reduce((sum, item) => sum + item.line.amount, 0),
      color: VIZ_SERIES[(index + 1) % VIZ_SERIES.length],
      tip: typeLines.map(
        ({ customer, line }): TipItem => ({
          logo: customer,
          name: customer,
          sub: line.description || REVENUE_TYPE_META[type].label,
          value: formatMoney(line.amount),
        })
      ),
    };
  }).filter((segment) => segment.value > 0);

  const monthDates = Array.from(
    { length: 6 },
    (_, index) => new Date(now.getFullYear(), now.getMonth() + index, 1)
  );
  const coverage = monthDates.map((month) =>
    lines
      .filter(({ line }) => isActive(line, month))
      .reduce((sum, item) => sum + item.line.amount, 0)
  );
  const coverageTips = monthDates.map((month) =>
    lines
      .filter(({ line }) => isActive(line, month))
      .map(
        ({ customer, line }): TipItem => ({
          logo: customer,
          name: customer,
          sub: REVENUE_TYPE_META[line.revenue_type].label,
          value: formatMoney(line.amount),
        })
      )
  );
  const monthLabels = monthDates.map((month) =>
    month.toLocaleDateString("en-US", { month: "short" })
  );

  return (
    <div className="mt-6 space-y-4">
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile icon={Users} label="Customers" value={String(report.customerCount)} sub="currently using it" />
        <StatTile icon={DollarSign} label="Total revenue" value={formatMoney(report.totalRevenue)} sub="booked across customers" />
        <StatTile icon={KeyRound} label="Licensed users" value={String(report.totalLicenses)} sub="seats under contract" />
        <StatTile icon={ReceiptText} label="Active contracts" value={String(activeLines.length)} sub={`${formatMoney(activeRevenue)} covered`} />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-[1.25fr_.75fr] gap-4 items-stretch">
        <ChartInspector
          title="Revenue by customer"
          description="Booked value by account, ranked highest first."
          records={customerRecords}
          searchPlaceholder="Find a customer..."
          className="h-full"
          bodyClassName="flex items-end"
          expandedChildren={<BarChart data={customerBars.slice(0, 12)} height={320} format="money" />}
        >
          <BarChart data={customerBars.slice(0, 6)} height={165} format="money" />
        </ChartInspector>

        <Card className="h-full flex flex-col">
          <div>
            <h2 className="text-[15px] font-semibold text-text-primary">Revenue mix</h2>
            <p className="mt-0.5 text-[12px] text-text-tertiary">How this offering earns revenue.</p>
          </div>
          <div className="mt-3 flex flex-1 items-center gap-4">
            <DonutChart
              segments={typeSegments}
              size={126}
              thickness={14}
              centerLabel={formatMoney(report.totalRevenue)}
              centerSub="total"
            />
            <DonutLegend
              items={typeSegments.map((segment) => ({
                label: segment.label,
                color: segment.color,
                value: segment.value,
              }))}
              format="money"
            />
          </div>
        </Card>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
        <Card className="h-full">
          <h2 className="text-[15px] font-semibold text-text-primary">Licensed seats by customer</h2>
          <p className="mt-0.5 text-[12px] text-text-tertiary">Seat distribution across active customer accounts.</p>
          <div className="mt-4 divide-y divide-border-light">
            {report.customers.filter((customer) => customer.licenses > 0).map((customer, index) => (
              <Link key={customer.id} href={`/customers/${customer.id}?tab=offerings`} className="group flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <CompanyLogo name={customer.name} className="h-8 w-8 shrink-0 text-[8px]" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-[12px] font-semibold text-text-primary group-hover:text-blue-primary">{customer.name}</span>
                    <span className="shrink-0 text-[12px] font-bold text-text-primary tnum">{customer.licenses} seats</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface">
                    <div className="h-full rounded-full" style={{ width: `${(customer.licenses / maxLicenses) * 100}%`, background: VIZ_SERIES[(index + 1) % VIZ_SERIES.length] }} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </Card>

        <Card className="h-full flex flex-col">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[15px] font-semibold text-text-primary">Contracted revenue outlook</h2>
              <p className="mt-0.5 text-[12px] text-text-tertiary">Value still under contract over the next six months.</p>
            </div>
            <CalendarRange size={17} strokeWidth={1.8} className="shrink-0 text-blue-primary" />
          </div>
          <div className="mt-4 flex-1">
            <AreaChart
              data={coverage}
              height={145}
              id={`offering-coverage-${offeringName.replace(/[^a-z0-9]/gi, "-")}`}
              color={VIZ.teal}
              format="money"
              xLabels={monthLabels}
              pointTips={coverageTips}
            />
          </div>
        </Card>
      </section>

      <Card className="p-0 overflow-hidden">
        <div className="grid grid-cols-2 lg:grid-cols-5 divide-x divide-border-light">
          {[
            ["Avg. per customer", formatMoney(Math.round(report.totalRevenue / Math.max(report.customerCount, 1)))],
            ["Revenue per seat", report.totalLicenses ? formatMoney(Math.round(report.totalRevenue / report.totalLicenses)) : "—"],
            ["Recurring share", `${recurringShare}%`],
            ["Top-account share", `${topCustomerShare}%`],
            ["Next renewal", nextRenewal?.line.end_date ? formatDate(nextRenewal.line.end_date) : "No date"],
          ].map(([label, value]) => (
            <div key={label} className="min-w-0 px-4 py-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">{label}</p>
              <p className="mt-1 truncate text-[16px] font-bold text-text-primary tnum">{value}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="px-5 pt-4 pb-3 border-b border-border-light">
          <h2 className="text-[15px] font-semibold text-text-primary">Revenue detail</h2>
          <p className="text-[12px] text-text-tertiary">Every commercial line, contract period, and renewal status.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-surface border-b border-border-light">
                {["Customer", "Type", "Revenue", "Licenses", "Coverage", "Status", "Notes"].map((heading) => (
                  <th key={heading} className="px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-text-tertiary whitespace-nowrap">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light">
              {report.customers.flatMap((customer) =>
                (customer.lines.length ? customer.lines : [null]).map((line, index) => {
                  const status = line ? lineStatus(line, now) : null;
                  return (
                    <tr key={`${customer.id}-${line?.id ?? index}`} className="hover:bg-surface/45 transition-colors">
                      <td className="px-4 py-3 text-[13px] whitespace-nowrap">
                        {index === 0 ? (
                          <Link href={`/customers/${customer.id}?tab=offerings`} className="inline-flex items-center gap-2.5 font-semibold text-text-primary hover:text-blue-primary">
                            <CompanyLogo name={customer.name} className="w-7 h-7 text-[10px]" />
                            {customer.name}
                          </Link>
                        ) : (
                          <Link href={`/customers/${customer.id}?tab=offerings`} className="inline-flex items-center gap-2.5 font-semibold text-text-primary hover:text-blue-primary">
                            <CompanyLogo name={customer.name} className="w-7 h-7 text-[10px]" />
                            {customer.name}
                          </Link>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {line ? (
                          <span className="rounded-md bg-blue-light px-2 py-1 text-[10.5px] font-semibold text-blue-primary">
                            {REVENUE_TYPE_META[line.revenue_type].short}
                          </span>
                        ) : (
                          <span className="text-[12px] text-text-tertiary">In use</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[13px] font-semibold text-text-primary tnum whitespace-nowrap">{line ? formatMoney(line.amount) : "—"}</td>
                      <td className="px-4 py-3 text-[12.5px] text-text-secondary tnum whitespace-nowrap">{line?.revenue_type === "license" && line.num_licenses ? line.num_licenses : "—"}</td>
                      <td className="px-4 py-3 text-[11.5px] text-text-secondary whitespace-nowrap">
                        {line && (line.start_date || line.end_date)
                          ? `${formatDate(line.start_date)} – ${formatDate(line.end_date)}`
                          : "—"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {status ? <span className={cn("rounded-md px-2 py-1 text-[10.5px] font-semibold", status.className)}>{status.label}</span> : "—"}
                      </td>
                      <td className="max-w-[260px] truncate px-4 py-3 text-[12px] text-text-secondary">{line?.description || "—"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
