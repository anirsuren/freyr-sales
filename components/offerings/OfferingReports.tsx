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
  Hammer,
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
      bar: "#0071E3",
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
      bar: "#C2410C",
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
  annual: { color: "#0071E3", bg: "rgba(0,113,227,0.10)", icon: Repeat },
  project: { color: "#7C3AED", bg: "rgba(124,58,237,0.10)", icon: Briefcase },
  annual_service: { color: "#0F766E", bg: "rgba(15,118,110,0.10)", icon: Wrench },
  license: { color: "#059669", bg: "rgba(5,150,105,0.12)", icon: KeyRound },
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
  showExample = false,
}: {
  report: OfferingReport;
  offeringName: string;
  /** In-progress (mock) mode only: show a labelled sample report when empty. */
  showExample?: boolean;
}) {
  if (report.customerCount === 0) {
    return (
      <>
        <Card className="mt-6">
          <h2 className="text-[15px] font-semibold text-text-primary mb-1">No revenue yet</h2>
          <p className="text-[13px] text-text-secondary leading-relaxed max-w-[620px]">
            Once a customer marks {offeringName} as in use and adds commercial terms,
            customer revenue, licenses, contract coverage, and renewals will appear here.
          </p>
        </Card>
        {/* In-progress mode only (Suren: "show revenue so that people know what
            it would look like") — a clearly-labelled sample of the report this
            tab becomes once accounts use the offering. Never rendered in live
            mode, and the empty branch means it never sits next to real data. */}
        {showExample && (
          <div className="mt-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10.5px] font-semibold"
                style={{ color: "#7C3AED", background: "rgba(124,58,237,0.10)" }}
              >
                <Hammer size={11} strokeWidth={2.1} />
                Example preview
              </span>
              <p className="text-[11px] text-text-tertiary">
                Sample numbers so you can see what this report will look like — not your data.
              </p>
            </div>
            <div className="rounded-xl border-2 border-dashed border-[#7C3AED]/30 p-4">
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ["Annual revenue", "$340K"],
                    ["Customers", "3"],
                    ["Licensed seats", "45"],
                  ] as [string, string][]
                ).map(([label, value]) => (
                  <div key={label} className="rounded-lg bg-surface px-2.5 py-2">
                    <p className="text-[9.5px] font-semibold uppercase tracking-[0.06em] text-text-tertiary">
                      {label}
                    </p>
                    <p className="mt-0.5 text-[14px] font-semibold text-text-primary tnum">{value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 space-y-1.5">
                {(
                  [
                    ["Acme Biotech", "$180K"],
                    ["Northstar Pharma", "$95K"],
                    ["Helix Labs", "$65K"],
                  ] as [string, string][]
                ).map(([name, value]) => (
                  <div key={name} className="flex items-center gap-2 text-[12px]">
                    <CompanyLogo name={name} className="w-[18px] h-[18px] text-[7px] shrink-0" />
                    <span className="min-w-0 flex-1 break-words font-medium text-text-primary">{name}</span>
                    <span className="tnum text-text-secondary">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </>
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
  // The tallest seat bar sets the scale, so the biggest account fills the
  // track and the rest read against it.
  const maxSeats = Math.max(...customerSummaries.map((c) => c.licenses), 1);

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
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
              Revenue split
            </p>
            <p className="text-[11px] text-text-tertiary tnum">
              {formatMoney(report.totalRevenue)} booked
            </p>
          </div>
          {/* `flex-1` + centred: the donut centres in whatever height the panel
              beside it sets, instead of sitting at the top with a dead band
              underneath (Suren: "a lot of empty space below"). */}
          <div className="flex flex-1 items-center gap-2.5">
            <DonutChart
              syncId="offering-revenue"
              segments={revenueSegments}
              size={132}
              thickness={10}
              format="money"
              centerLabel={formatMoney(report.totalRevenue)}
              centerSub="booked"
            />
            <div className="flex-1 min-w-0">
              {/* The company tag stays (Anir: "the tag that has the company
                  name"), but its label span ships `break-normal`, which still
                  lets a two-word name break BETWEEN the words — that is how
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
            twice. This answers the other half a seller needs — how many people
            are actually on it per account, i.e. where the room to grow is.
            Every number comes from the license lines' own `num_licenses`. */}
        <div className="flex h-full flex-col px-5 py-4">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
              Seats by account
            </p>
            <p className="text-[11px] text-text-tertiary tnum">
              {report.totalLicenses} seats in total
            </p>
          </div>
          {/* Centred when the list is short (so the panel never opens with a
              dead band under it), capped and scrolled when it is long — the
              same cap the table used to carry on this side, so a long customer
              list can never stretch this compact card. `justify-center` lives
              on the OUTER box and the scroll on the inner one: a centred flex
              container that overflows makes its first rows unreachable. */}
          <div className="flex flex-1 flex-col justify-center">
          <div className="flex max-h-[204px] flex-col gap-3.5 overflow-y-auto">
            {report.totalLicenses === 0 && (
              <p className="text-[12px] leading-relaxed text-text-secondary">
                No licensed seats on this offering yet — every account below is
                on project or service revenue, so there are no seats to count.
              </p>
            )}
            {customerSummaries.map((customer) => {
              const fill = Math.round((customer.licenses / maxSeats) * 100);
              const typeNames = customer.typeMix
                .map((segment) => REVENUE_TYPE_META[segment.type].short)
                .join(" + ");
              const hover = (
                <div>
                  <div className="flex items-center gap-2.5 border-b border-border-light pb-2.5">
                    <CompanyLogo name={customer.name} className="h-8 w-8 shrink-0 text-[10px]" />
                    <div className="min-w-0">
                      {/* Wraps, never truncates — the full account name is the
                          point of the breakdown. */}
                      <p className="break-words text-[13px] font-semibold leading-tight text-text-primary">
                        {customer.name}
                      </p>
                      <p className="mt-0.5 text-[10.5px] text-text-tertiary tnum">
                        {customer.licenses} of {report.totalLicenses} seats · {customer.seatShare}%
                      </p>
                    </div>
                  </div>
                  <p className="mb-1.5 mt-2.5 text-[9.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                    License contracts behind these seats
                  </p>
                  {customer.licenseLines.length === 0 ? (
                    <p className="text-[11.5px] leading-relaxed text-text-secondary">
                      No licensed seats — this account is on {typeNames || "no booked"}{" "}
                      revenue only.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {customer.licenseLines.map((line) => (
                        <div key={line.id} className="rounded-md bg-surface px-2 py-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <TypePill type={line.revenue_type} short />
                            <span className="shrink-0 text-[11px] font-semibold text-text-primary tnum">
                              {line.num_licenses} seats · {formatMoney(line.amount)}
                            </span>
                          </div>
                          <p className="mt-1 break-words text-[11px] leading-snug text-text-secondary">
                            {line.description || "No description on this line."}
                          </p>
                          <p className="mt-0.5 text-[10px] text-text-tertiary tnum">
                            {formatDate(line.start_date)} – {formatDate(line.end_date)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
              return (
                <HoverCard
                  key={customer.id}
                  side="top"
                  width={300}
                  delayMs={0}
                  content={hover}
                  className="cursor-pointer rounded-lg px-1.5 py-1 transition-colors hover:bg-[var(--surface)]"
                >
                  <div data-testid="offering-customer-commercial-row">
                    <div className="flex items-center gap-2">
                      <CompanyLogo name={customer.name} className="h-6 w-6 shrink-0 text-[7.5px]" />
                      {/* One line, always — and the seat count sits right next
                          to the name it belongs to, not flung to the far edge. */}
                      <span className="whitespace-nowrap text-[12.5px] font-semibold text-text-primary">
                        {customer.name}
                      </span>
                      <span className="whitespace-nowrap text-[11.5px] font-semibold text-text-primary tnum">
                        {customer.licenses} seats
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-border-light">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${fill}%`, background: customer.color }}
                      />
                    </div>
                    <p className="mt-1 text-[10.5px] text-text-tertiary tnum">
                      {customer.licenses > 0
                        ? `${customer.seatShare}% of all seats · ${formatMoney(customer.licenseRevenue)} licensed`
                        : `No licensed seats · on ${typeNames || "no booked"} revenue`}
                    </p>
                  </div>
                </HoverCard>
              );
            })}
          </div>
          </div>
        </div>

        </div>
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
              What each account pays, what kind of revenue it is, how many seats
              they hold, how many contracts are live, and when the next one is up.
              Click a row to open the account.
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
                        {customer.licenses || "—"}
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
                          Ongoing — no end date
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
            <CalendarRange size={17} strokeWidth={1.8} className="shrink-0 text-blue-primary" />
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
                Nothing is up for renewal — every contract on this offering is
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
              [KeyRound, "Revenue per seat", report.totalLicenses ? formatMoney(Math.round(report.totalRevenue / report.totalLicenses)) : "—", "booked ÷ licensed seats"],
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
                      <td className="max-w-[260px] whitespace-normal break-words px-4 py-3 text-[12px] text-text-secondary">{line?.description || "—"}</td>
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
