import Link from "next/link";
import {
  AlarmClock,
  Briefcase,
  CalendarClock,
  CalendarRange,
  ChevronRight,
  CircleCheck,
  CircleSlash,
  Crown,
  DollarSign,
  KeyRound,
  Layers,
  ReceiptText,
  Repeat,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { HoverCard } from "@/components/ui/HoverCard";
import {
  AreaChart,
  BarChart,
  DonutChart,
  DonutLegend,
  VIZ,
  VIZ_SERIES,
  type TipItem,
} from "@/components/charts/Charts";
import { ExpandedChartModal } from "@/components/charts/ExpandedChartModal";
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

// Colour AND icon on every status chip (standing rule) — plus the bar colour
// that matches the chip, so a countdown rail and its label are never two
// different warnings.
function lineStatus(
  line: OfferingRevenueLine,
  now: Date
): { label: string; className: string; icon: LucideIcon; bar: string } {
  if (!line.end_date)
    return {
      label: "Ongoing",
      className: "bg-blue-light text-blue-primary",
      icon: Repeat,
      bar: "var(--ink-bright-blue)",
    };
  const days = Math.ceil((Date.parse(line.end_date) - now.getTime()) / 86_400_000);
  if (days < 0)
    return {
      label: "Expired",
      className: "bg-red-50 text-red-700",
      icon: CircleSlash,
      bar: "#EF4444",
    };
  // orange-700 not amber-700: amber-700 is the brown-mustard Suren banned.
  if (days <= 90)
    return {
      label: `${days}d left`,
      className: "bg-orange-50 text-orange-700",
      icon: AlarmClock,
      bar: "var(--ink-orange)",
    };
  return {
    label: "Active",
    className: "bg-green-50 text-green-700",
    icon: CircleCheck,
    bar: "#16A34A",
  };
}

// Every revenue type gets its own colour + icon (Suren: "different types need
// different colors and different tags") — used on the detail table, renewal
// rows, and the header roll-up chips so a type reads the same everywhere.
const REVENUE_TYPE_STYLE: Record<
  OfferingRevenueLine["revenue_type"],
  { color: string; bg: string; icon: LucideIcon }
> = {
  annual: { color: "var(--ink-bright-blue)", bg: "rgba(0,113,227,0.10)", icon: Repeat },
  project: { color: "var(--ink-violet-soft)", bg: "rgba(124,58,237,0.10)", icon: Briefcase },
  annual_service: { color: "var(--ink-teal-deep)", bg: "rgba(15,118,110,0.10)", icon: Wrench },
  license: { color: "#0891B2", bg: "rgba(8,145,178,0.12)", icon: KeyRound },
};

function TypePill({
  type,
  short,
}: {
  type: OfferingRevenueLine["revenue_type"];
  short?: boolean;
}) {
  const style = REVENUE_TYPE_STYLE[type];
  const Icon = style.icon;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10.5px] font-semibold"
      style={{ color: style.color, background: style.bg }}
    >
      <Icon size={11} strokeWidth={2.1} />
      {short ? REVENUE_TYPE_META[type].short : REVENUE_TYPE_META[type].label}
    </span>
  );
}

// How much of a contract's term is left, as a fraction for the countdown bar.
// No dates → ongoing (full bar); expired → empty.
function renewalRunway(line: OfferingRevenueLine, now: Date): number {
  if (!line.end_date) return 1;
  const end = Date.parse(line.end_date);
  const start = line.start_date
    ? Date.parse(line.start_date)
    : end - 365 * 86_400_000;
  if (end <= now.getTime()) return 0;
  return Math.max(0.04, Math.min(1, (end - now.getTime()) / Math.max(end - start, 1)));
}

export function OfferingReports({
  report,
  offeringName,
}: {
  report: OfferingReport;
  offeringName: string;
  /** In-progress (mock) mode only: show a labelled sample report when empty. */
}) {
  // No early "empty" card, and no banner either (Anir: "remove the thing that
  // says 'this is a live…'"). The report renders its FULL structure at zero —
  // real tiles, chart frames and table headers with honest zeros; the tables'
  // own empty rows carry the one-line explanations. Every computation below is
  // zero-safe: reduces over empty arrays and share divisions are all guarded.
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
  const customerSummaries = report.customers.map((customer, index) => {
    const customerActiveLines = customer.lines.filter((line) => isActive(line, now));
    const nextCustomerRenewal = customer.lines
      .filter((line) => line.end_date && Date.parse(line.end_date) >= now.getTime())
      .sort((a, b) => Date.parse(a.end_date!) - Date.parse(b.end_date!))[0];
    // How this one account's booked money splits across the revenue types it
    // actually carries — the header chips give the totals, this gives who is
    // behind them. Built straight off `line.revenue_type` + `line.amount`.
    const typeMix = REVENUE_TYPES.map((type) => {
      const value = customer.lines
        .filter((line) => line.revenue_type === type)
        .reduce((sum, line) => sum + line.amount, 0);
      return {
        type,
        value,
        pct: customer.revenue ? (value / customer.revenue) * 100 : 0,
      };
    }).filter((segment) => segment.value > 0);
    // Seats only exist on license revenue, so the seat chart and its hover are
    // built from the license lines and nothing else.
    const licenseLines = customer.lines.filter(
      (line) => line.revenue_type === "license" && (line.num_licenses || 0) > 0
    );
    return {
      ...customer,
      // One colour per account, everywhere: the pie slice, the legend pill,
      // the seat bar and the table's share bar all agree.
      color: VIZ_SERIES[index % VIZ_SERIES.length],
      activeContracts: customerActiveLines.length,
      nextRenewal: nextCustomerRenewal,
      typeMix,
      licenseLines,
      licenseRevenue: licenseLines.reduce((sum, line) => sum + line.amount, 0),
      share: report.totalRevenue
        ? Math.round((customer.revenue / report.totalRevenue) * 100)
        : 0,
      seatShare: report.totalLicenses
        ? Math.round((customer.licenses / report.totalLicenses) * 100)
        : 0,
    };
  });
  // Seats as a pie, mirroring the revenue donut on the left. The old
  // progress-bar rows scaled every bar to the BIGGEST account, so the top
  // account always drew a full bar while its label said "65% of all seats"
  // (Anir, Jul 28: "why is it saying 65% but shows a 100% bar? You'd just
  // want a pie chart there"). A donut IS the share, so number and picture
  // can never disagree.
  const seatSegments = customerSummaries
    .filter((customer) => customer.licenses > 0)
    .map((customer) => ({
      label: customer.name,
      value: customer.licenses,
      color: customer.color,
      tip: customer.licenseLines.map((line) => ({
        logo: customer.name,
        name: line.description || "License",
        sub: `${formatDate(line.start_date)} to ${formatDate(line.end_date)}`,
        value: `${line.num_licenses} seats · ${formatMoney(line.amount)}`,
      })),
    }));
  const noSeatAccounts = customerSummaries.filter((c) => c.licenses === 0);

  // Renewal exposure, by month: how much contracted value reaches its end
  // date in each of the next 12 months. The renewals table lower down lists
  // each contract; this is the shape of that list, and the page's proper
  // bar chart (Anir, Jul 28: "I would want a proper bar chart here").
  const monthKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}`;
  const renewalMonths = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    return {
      key: monthKey(d),
      label: d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }).replace(" ", " '"),
      value: 0,
      color: VIZ.blue,
      tip: [] as TipItem[],
    };
  });
  const renewalByKey = new Map(renewalMonths.map((m) => [m.key, m]));
  for (const { customer, line } of lines) {
    if (!line.end_date) continue;
    const end = new Date(line.end_date);
    if (Number.isNaN(end.getTime())) continue;
    const bucket = renewalByKey.get(monthKey(end));
    if (!bucket) continue;
    bucket.value += line.amount;
    bucket.tip.push({
      logo: customer,
      name: customer,
      sub: `${REVENUE_TYPE_META[line.revenue_type]?.short || line.revenue_type} · ends ${formatDate(line.end_date)}`,
      value: formatMoney(line.amount),
    });
  }
  const renewalTotal = renewalMonths.reduce((s, m) => s + m.value, 0);

  const typeSegments = REVENUE_TYPES.map((type) => {
    const typeLines = lines.filter(({ line }) => line.revenue_type === type);
    return {
      label: REVENUE_TYPE_META[type].label,
      value: typeLines.reduce((sum, item) => sum + item.line.amount, 0),
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

  // Revenue split as a donut (Suren: a table alone isn't a picture) — one
  // slice per customer, hover shows the account's seats + commercial lines.
  const revenueSegments = customerSummaries.map((customer) => ({
    label: customer.name,
    value: customer.revenue,
    color: customer.color,
    tip: [
      {
        logo: customer.name,
        name: customer.name,
        sub: `${customer.licenses || 0} seats · ${customer.lines.length} ${
          customer.lines.length === 1 ? "line" : "lines"
        }`,
        value: formatMoney(customer.revenue),
      },
    ] as TipItem[],
  }));

  return (
    <div className="mt-6 space-y-4">
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile icon={Users} label="Customers" value={String(report.customerCount)} sub="currently using it" />
        <StatTile icon={DollarSign} label="Total revenue" value={formatMoney(report.totalRevenue)} sub="booked across customers" />
        <StatTile icon={KeyRound} label="Licensed users" value={String(report.totalLicenses)} sub="seats under contract" />
        <StatTile icon={ReceiptText} label="Active contracts" value={String(activeLines.length)} sub={`${formatMoney(activeRevenue)} covered`} />
      </section>

      <Card data-testid="offering-revenue-breakdown" className="p-0 overflow-hidden">
        <div className="flex items-start justify-between gap-5 border-b border-border-light px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-text-primary">Revenue by customer</h2>
            <p className="mt-0.5 text-[12px] text-text-tertiary">
              Revenue, licenses, contracts, and renewals in one compact view.
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-1.5">
            {typeSegments.map((segment) => {
              const styled = REVENUE_TYPES.find(
                (t) => REVENUE_TYPE_META[t].label === segment.label
              );
              const style = styled ? REVENUE_TYPE_STYLE[styled] : null;
              const Icon = style?.icon;
              return (
                <span
                  key={segment.label}
                  className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[10.5px] font-semibold"
                  style={
                    style
                      ? { color: style.color, background: style.bg }
                      : undefined
                  }
                >
                  {Icon && <Icon size={11} strokeWidth={2.1} />}
                  {segment.label.replace(" revenue", "")}{" "}
                  <strong className="font-semibold tnum">{formatMoney(segment.value)}</strong>
                </span>
              );
            })}
          </div>
        </div>
        {/* Band A — two pictures side by side. The detail table used to live in
            the right half; it moved down to its own full-width band (Suren:
            "move that table to the next row… then maybe add something else to
            the right of the pie chart"). The left track is `max-content` with a
            440px floor so a long account name in the legend widens the panel
            instead of ever being clipped by the card's overflow-hidden. */}
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(440px,max-content)_minmax(0,1fr)]">
        {/* LEFT — the split as a picture: donut with its legend BESIDE it
            (Suren: labels to the right of the pie). */}
        <div className="flex h-full flex-col border-b xl:border-b-0 xl:border-r border-border-light px-5 py-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
              Revenue split
            </p>
            <div className="flex items-center gap-2">
              <p className="text-[11px] text-text-tertiary tnum">
                {formatMoney(report.totalRevenue)} booked
              </p>
              <ExpandedChartModal
                title="Revenue by customer"
                subtitle={`${offeringName} revenue split across customer accounts.`}
                chart={{
                  kind: "donut",
                  segments:
                    revenueSegments.length > 0
                      ? revenueSegments
                      : [{ label: "No revenue yet", value: 1, color: "#D2D2D7" }],
                  centerLabel: formatMoney(report.totalRevenue),
                  centerSub: "booked",
                  format: "money",
                }}
                className="h-8 px-2.5 text-[11px]"
              />
            </div>
          </div>
          {/* `flex-1` + centred: the donut centres in whatever height the panel
              beside it sets, instead of sitting at the top with a dead band
              underneath (Suren: "a lot of empty space below"). At zero the ring
              still draws — one neutral segment — so the frame of the report is
              visible before the first dollar lands. */}
          <div className="flex flex-1 items-center gap-2.5">
            <DonutChart
              syncId="offering-revenue"
              segments={
                revenueSegments.length > 0
                  ? revenueSegments
                  : [{ label: "No revenue yet", value: 1, color: "var(--border-light)" }]
              }
              size={132}
              thickness={10}
              format="money"
              centerLabel={formatMoney(report.totalRevenue)}
              centerSub="booked"
            />
            <div className="flex-1 min-w-0">
              {/* The company tag stays (Anir: "the tag that has the company
                  name"), but its label span ships `break-normal`, which still
                  lets a two-word name break BETWEEN the words, that is how
                  "Meridian Pharmaceuticals" ended up two lines tall while
                  "Helix Biologics" stayed one, and the rows read as broken.
                  `whitespace-nowrap` on the legend's spans forbids the break,
                  so the name always occupies exactly one line and is never
                  truncated; the `auto` label track then sizes to the whole
                  name and the panel above widens to hold it. */}
              <DonutLegend
                items={revenueSegments}
                format="money"
                syncId="offering-revenue"
                pill
                bars={false}
                className="[&_span]:whitespace-nowrap"
              />
            </div>
          </div>
        </div>

        {/* RIGHT — the second picture, in the space the table left behind.
            Seats, not dollars: the donut beside it already answers "who pays
            us the most", so restating money here would be the same chart
            twice. This answers the other half a seller needs, how many people
            are actually on it per account, i.e. where the room to grow is.
            Every number comes from the license lines' own `num_licenses`. */}
        <div className="flex h-full flex-col px-5 py-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
              Seats by account
            </p>
            <div className="flex items-center gap-2">
              <p className="text-[11px] text-text-tertiary tnum">
                {report.totalLicenses} seats in total
              </p>
              {report.totalLicenses > 0 && (
                <ExpandedChartModal
                  title="Seats by account"
                  subtitle={`${offeringName} licensed seats across customer accounts.`}
                  chart={{
                    kind: "donut",
                    segments: seatSegments,
                    centerLabel: String(report.totalLicenses),
                    centerSub: "seats",
                  }}
                  className="h-8 px-2.5 text-[11px]"
                />
              )}
            </div>
          </div>
          {/* A donut, mirroring the revenue split on the left: the share IS
              the picture, so "65% of all seats" can never sit beside a
              full-width bar again. Hovering a slice or its legend pill opens
              the license contracts behind those seats. */}
          {report.totalLicenses === 0 ? (
            <div className="flex flex-1 items-center">
              <p className="text-[12px] leading-relaxed text-text-secondary">
                No licensed seats on this offering yet. Every account below is
                on project or service revenue, so there is nothing to count.
              </p>
            </div>
          ) : (
            <div className="flex flex-1 items-center gap-2.5">
              <DonutChart
                syncId="offering-seats"
                segments={seatSegments}
                size={132}
                thickness={10}
                centerLabel={String(report.totalLicenses)}
                centerSub="seats"
              />
              <div className="min-w-0 flex-1">
                <DonutLegend
                  items={seatSegments}
                  syncId="offering-seats"
                  pill
                  bars={false}
                  className="[&_span]:whitespace-nowrap"
                />
                {noSeatAccounts.length > 0 && (
                  <p className="mt-2 text-[10.5px] leading-snug text-text-tertiary">
                    No seats: {noSeatAccounts.map((c) => c.name).join(", ")} (project/service revenue only).
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        </div>
      </Card>

      {/* Band A½ — renewal exposure as a real, full-width bar chart: the
          contracted value reaching its end date in each of the next twelve
          months. The renewals table further down lists every contract; this
          is that list's shape, so a heavy quarter is visible from across the
          room. It used to hide itself entirely at zero; now the 12-month axis
          stays on screen so the report's full shape is visible before the
          first contract lands (Anir: "show the bare bones"). */}
      <Card data-testid="offering-renewal-chart">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold text-text-primary">
              Renewal exposure, month by month
            </h2>
            <p className="mt-0.5 text-[12px] text-text-tertiary">
              Contracted value reaching its end date, next 12 months. Hover a
              bar for the contracts behind it.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <p className="text-[12px] text-text-tertiary tnum">
              {renewalTotal > 0
                ? `${formatMoney(renewalTotal)} comes up for renewal in this window`
                : "No contracts end in this window yet"}
            </p>
            <ExpandedChartModal
              title="Renewal exposure, month by month"
              subtitle="Contracted value reaching its end date over the next 12 months."
              chart={{
                kind: "bar",
                data: renewalMonths,
                format: "money",
                tipRecordsLabel: "Contracts ending this month",
              }}
              className="h-8 px-2.5 text-[11px]"
            />
          </div>
        </div>
        <BarChart
          data={renewalMonths}
          height={190}
          format="money"
          tipRecordsLabel="Contracts ending this month"
        />
      </Card>

      {/* Band B — the account table, now the full width of the page so it can
          carry the columns the 440px sliver never had room for (Suren: "the
          table takes the entire width so you can have a much more detailed
          table… you already have a detailed table on the team page"). Same
          idioms as the team roster: a real <thead> with column floors, a logo
          in the identity cell, per-row proportional bars, colour + icon chips
          for anything categorical, tnum numbers, and a row hover. */}
      <Card data-testid="offering-customer-table" className="p-0 overflow-hidden">
        <div className="flex items-start justify-between gap-4 border-b border-border-light px-5 pt-4 pb-3">
          <div>
            <h2 className="text-[15px] font-semibold text-text-primary">
              Every account, in detail{" "}
              <span className="font-normal text-text-tertiary tnum">
                ({report.customerCount})
              </span>
            </h2>
            <p className="mt-0.5 text-[12px] text-text-tertiary">
              What each account pays and what kind of revenue it is. Plus their seats, their live contracts, and when the next one is up. Click a row to open the account.
            </p>
          </div>
          <Layers size={17} strokeWidth={1.8} className="shrink-0 text-blue-primary" />
        </div>
        <div className="overflow-x-auto">
          {/* min-w + per-column floors: nothing collapses, and a long account
              name widens the table and scrolls rather than being cut off. */}
          <table className="w-full min-w-[1080px] border-collapse text-left">
            <thead>
              <tr className="border-b border-border-light bg-surface text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary [&>th]:whitespace-nowrap [&>th]:px-4 [&>th]:py-2.5">
                <th className="min-w-[250px]">Account</th>
                <th className="w-[210px]">Booked revenue</th>
                <th className="min-w-[270px]">What they pay for</th>
                <th className="w-[92px]">Seats</th>
                <th className="w-[118px]">Contracts</th>
                <th className="w-[230px]">Next renewal</th>
                <th className="w-[52px]" aria-hidden="true" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light">
              {customerSummaries.length === 0 && (
                <tr>
                  <td colSpan={99} className="px-5 py-8 text-center text-[12.5px] text-text-tertiary">
                    No accounts use {offeringName} yet. The first customer marked
                    as in use starts this table.
                  </td>
                </tr>
              )}
              {customerSummaries.map((customer) => {
                const renewalStatus = customer.nextRenewal
                  ? lineStatus(customer.nextRenewal, now)
                  : null;
                const RenewalIcon = renewalStatus?.icon;
                return (
                  <tr
                    key={customer.id}
                    data-testid="offering-customer-table-row"
                    className="group transition-colors hover:bg-[var(--surface)]"
                  >
                    <td className="px-4 py-3.5">
                      <Link
                        href={`/customers/${customer.id}?tab=offerings`}
                        className="flex items-center gap-3"
                      >
                        <CompanyLogo name={customer.name} className="h-9 w-9 shrink-0 text-[10px]" />
                        <span className="min-w-0">
                          {/* One line, never truncated — the column floor and
                              the table's own horizontal scroll carry it. */}
                          <span className="block whitespace-nowrap text-[13.5px] font-semibold text-text-primary group-hover:text-blue-primary">
                            {customer.name}
                          </span>
                          <span className="block text-[11px] text-text-tertiary tnum">
                            {customer.lines.length} revenue{" "}
                            {customer.lines.length === 1 ? "line" : "lines"}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="flex items-baseline gap-2">
                        <strong className="text-[14px] font-semibold text-text-primary tnum">
                          {formatMoney(customer.revenue)}
                        </strong>
                        <span className="whitespace-nowrap text-[11px] text-text-tertiary tnum">
                          {customer.share}% of total
                        </span>
                      </span>
                      {/* Same colour as this account's pie slice and seat bar. */}
                      <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-border-light">
                        <span
                          className="block h-full rounded-full"
                          style={{
                            width: `${Math.max(customer.share, 2)}%`,
                            background: customer.color,
                          }}
                        />
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      {customer.typeMix.length === 0 ? (
                        <span className="text-[12px] text-text-tertiary">
                          In use, nothing booked yet
                        </span>
                      ) : (
                        <>
                          <span className="flex h-2 overflow-hidden rounded-full bg-border-light">
                            {customer.typeMix.map((segment) => (
                              <span
                                key={segment.type}
                                style={{
                                  width: `${segment.pct}%`,
                                  background: REVENUE_TYPE_STYLE[segment.type].color,
                                }}
                              />
                            ))}
                          </span>
                          <span className="mt-2 flex flex-wrap gap-1.5">
                            {customer.typeMix.map((segment) => {
                              const style = REVENUE_TYPE_STYLE[segment.type];
                              const Icon = style.icon;
                              return (
                                <span
                                  key={segment.type}
                                  className="inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-[10.5px] font-semibold"
                                  style={{ color: style.color, background: style.bg }}
                                >
                                  <Icon size={11} strokeWidth={2.1} />
                                  {REVENUE_TYPE_META[segment.type].short}{" "}
                                  <strong className="font-semibold tnum">
                                    {formatMoney(segment.value)}
                                  </strong>
                                </span>
                              );
                            })}
                          </span>
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="block text-[14px] font-semibold text-text-primary tnum">
                        {customer.licenses || "-"}
                      </span>
                      <span className="block whitespace-nowrap text-[10.5px] text-text-tertiary">
                        {customer.licenses ? "licensed" : "none licensed"}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="block whitespace-nowrap text-[13px] font-semibold text-text-primary tnum">
                        {customer.activeContracts} active
                      </span>
                      <span className="block whitespace-nowrap text-[10.5px] text-text-tertiary tnum">
                        of {customer.lines.length} total
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      {customer.nextRenewal?.end_date && renewalStatus ? (
                        <>
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="whitespace-nowrap text-[12.5px] font-semibold text-text-primary tnum">
                              {formatDate(customer.nextRenewal.end_date)}
                            </span>
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
                                renewalStatus.className
                              )}
                            >
                              {RenewalIcon && <RenewalIcon size={11} strokeWidth={2.1} />}
                              {renewalStatus.label}
                            </span>
                          </span>
                          {/* How much of the term is left, as a rail — Suren
                              has to SEE the runway, not read a number. */}
                          <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-border-light">
                            <span
                              className="block h-full rounded-full"
                              style={{
                                width: `${Math.round(renewalRunway(customer.nextRenewal, now) * 100)}%`,
                                background: renewalStatus.bar,
                              }}
                            />
                          </span>
                        </>
                      ) : (
                        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-blue-light px-2 py-1 text-[10.5px] font-semibold text-blue-primary">
                          <Repeat size={11} strokeWidth={2.1} />
                          Ongoing, no end date
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <Link
                        href={`/customers/${customer.id}?tab=offerings`}
                        aria-label={`Open ${customer.name}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-blue-light group-hover:text-blue-primary"
                      >
                        <ChevronRight size={16} strokeWidth={1.9} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <section className="grid grid-cols-1 lg:grid-cols-[1.35fr_.65fr] gap-4 items-stretch">
        <Card className="h-full flex flex-col">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[15px] font-semibold text-text-primary">Contracted revenue outlook</h2>
              <p className="mt-0.5 text-[12px] text-text-tertiary">Value still under contract over the next six months.</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <ExpandedChartModal
                title="Contracted revenue outlook"
                subtitle={`${offeringName} value still under contract over the next six months.`}
                chart={{
                  kind: "area",
                  label: "Contracted revenue",
                  color: VIZ.teal,
                  data: coverage,
                  format: "money",
                  unit: "USD",
                  xLabels: monthLabels,
                  pointTips: coverageTips,
                }}
                className="h-8 px-2.5 text-[11px]"
              />
              <CalendarRange size={17} strokeWidth={1.8} className="text-blue-primary" />
            </div>
          </div>
          {/* No `pb-5` reserve any more — the padding under the plot was dead
              space the card could not use, and the chart now runs taller so it
              fills the height the Renewal-watch card beside it sets (Suren:
              "there's a lot of empty space below"). */}
          <div className="mt-4 flex flex-1 flex-col justify-center">
            <AreaChart
              data={coverage}
              height={248}
              id={`offering-coverage-${offeringName.replace(/[^a-z0-9]/gi, "-")}`}
              color={VIZ.teal}
              format="money"
              unit="USD"
              xLabels={monthLabels}
              pointTips={coverageTips}
            />
          </div>
        </Card>

        <Card className="flex h-full flex-col p-0 overflow-hidden">
          <div className="flex items-start justify-between gap-4 border-b border-border-light px-4 py-3.5">
            <div>
              <h2 className="text-[15px] font-semibold text-text-primary">Renewal watch</h2>
              <p className="mt-0.5 text-[12px] text-text-tertiary">Nearest contract decisions.</p>
            </div>
            <CalendarClock size={17} strokeWidth={1.8} className="shrink-0 text-blue-primary" />
          </div>
          <div className="flex-1 divide-y divide-border-light">
            {/* Never a hollow box: with nothing expiring the card says so
                instead of leaving an empty panel beside a full-height chart. */}
            {renewals.length === 0 && (
              <p className="px-4 py-5 text-[12.5px] leading-relaxed text-text-secondary">
                Nothing is up for renewal, every contract on this offering is
                ongoing or already past its end date.
              </p>
            )}
            {renewals.slice(0, 4).map((item) => {
              const status = lineStatus(item.line, now);
              const StatusIcon = status.icon;
              return (
                <Link
                  key={`${item.customerId}-${item.line.id}`}
                  href={`/customers/${item.customerId}?tab=offerings`}
                  className="group flex items-center gap-2.5 px-4 py-3 transition-colors hover:bg-[var(--surface)]"
                >
                  <CompanyLogo name={item.customer} className="h-7 w-7 shrink-0 text-[8px]" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-3">
                      <span className="min-w-0 break-words text-[11.5px] font-semibold leading-tight text-text-primary group-hover:text-blue-primary">
                        {item.customer}
                      </span>
                      <span className="shrink-0 text-[11px] font-semibold text-text-primary tnum">
                        {formatMoney(item.line.amount)}
                      </span>
                    </span>
                    <span className="mt-0.5 flex items-center justify-between gap-3">
                      <TypePill type={item.line.revenue_type} short />
                      <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-semibold", status.className)}>
                        <StatusIcon size={10} strokeWidth={2.2} />
                        {status.label}
                      </span>
                    </span>
                    {/* Countdown bar — how much contract runway is left, at a
                        glance (Suren: "I have to visually SEE the 38 days").
                        `status.bar` matches the pill directly above it, so the
                        bar and its label are never two different warnings. */}
                    <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-border-light">
                      <span
                        className="block h-full rounded-full transition-all"
                        style={{
                          width: `${Math.round(renewalRunway(item.line, now) * 100)}%`,
                          background: status.bar,
                        }}
                      />
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        </Card>
      </section>

      <Card className="p-0 overflow-hidden">
        <div className="grid grid-cols-2 lg:grid-cols-5 divide-x divide-border-light">
          {(
            [
              [Users, "Avg. per customer", formatMoney(Math.round(report.totalRevenue / Math.max(report.customerCount, 1))), "booked value per account"],
              [KeyRound, "Revenue per seat", report.totalLicenses ? formatMoney(Math.round(report.totalRevenue / report.totalLicenses)) : "-", "booked ÷ licensed seats"],
              [Repeat, "Recurring share", `${recurringShare}%`, "on repeating contracts"],
              [Crown, "Top-account share", `${topCustomerShare}%`, "held by the biggest account"],
              [CalendarClock, "Next renewal", nextRenewal?.line.end_date ? formatDate(nextRenewal.line.end_date) : "No date", "the next contract decision"],
            ] as [LucideIcon, string, string, string][]
          ).map(([Icon, label, value, sub]) => (
            <div key={label} className="min-w-0 px-4 py-4">
              <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-blue-light text-blue-primary">
                  <Icon size={11} strokeWidth={2} />
                </span>
                {label}
              </p>
              <p className="mt-1.5 break-words text-[16px] font-bold text-text-primary tnum">{value}</p>
              <p className="mt-0.5 break-words text-[10.5px] text-text-tertiary">{sub}</p>
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
              {report.customers.length === 0 && (
                <tr>
                  <td colSpan={99} className="px-5 py-8 text-center text-[12.5px] text-text-tertiary">
                    Nothing has been recorded yet. Every contract, license and
                    service agreement shows up here as it is added.
                  </td>
                </tr>
              )}
              {report.customers.flatMap((customer) =>
                (customer.lines.length ? customer.lines : [null]).map((line, index) => {
                  const status = line ? lineStatus(line, now) : null;
                  return (
                    <tr key={`${customer.id}-${line?.id ?? index}`} className="transition-colors hover:bg-[var(--surface)]">
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
                          <TypePill type={line.revenue_type} short />
                        ) : (
                          <span className="text-[12px] text-text-tertiary">In use</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[13px] font-semibold text-text-primary tnum whitespace-nowrap">{line ? formatMoney(line.amount) : "-"}</td>
                      <td className="px-4 py-3 text-[12.5px] text-text-secondary tnum whitespace-nowrap">{line?.revenue_type === "license" && line.num_licenses ? line.num_licenses : "-"}</td>
                      <td className="px-4 py-3 text-[11.5px] text-text-secondary whitespace-nowrap">
                        {line && (line.start_date || line.end_date)
                          ? `${formatDate(line.start_date)}. ${formatDate(line.end_date)}`
                          : "-"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {status ? <span className={cn("rounded-md px-2 py-1 text-[10.5px] font-semibold", status.className)}>{status.label}</span> : "-"}
                      </td>
                      <td className="max-w-[260px] whitespace-normal break-words px-4 py-3 text-[12px] text-text-secondary">{line?.description || "-"}</td>
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
