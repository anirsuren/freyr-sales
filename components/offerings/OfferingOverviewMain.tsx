import Link from "next/link";
import {
  BarChart3,
  BookOpen,
  CalendarCheck,
  Check,
  ChevronRight,
  DollarSign,
  FolderOpen,
  KeyRound,
  Layers,
  ReceiptText,
  Building2,
} from "lucide-react";
import { AddMaterialButton } from "@/components/offerings/AddMaterialButton";
import { OfferingCapabilities } from "@/components/offerings/OfferingCapabilities";
import { MaterialsSection } from "@/components/offerings/MaterialsSection";
import { OfferingIcon } from "@/components/ui/OfferingIcon";
import { AvailabilityPill } from "@/components/ui/AvailabilityPill";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { HoverCard } from "@/components/ui/HoverCard";
import { formatMoney } from "@/lib/pipeline";
import { DonutChart, DonutLegend, VIZ_SERIES } from "@/components/charts/Charts";
import { ExpandedChartModal } from "@/components/charts/ExpandedChartModal";
import { type Offering, hydrateOffering } from "@/lib/offerings";
import type { OfferingReport } from "@/lib/revenue";
import { REVENUE_TYPE_META } from "@/lib/revenue";
import { formatDate } from "@/lib/utils";

// The availability comment arrives from Suren's sheet as one middot-joined
// run-on ("Available in various markets via in-house delivery team / FreyrX /
// both · CSV & CSA Validation Services: Provided through FreyrX in all
// markets"). Printed as a single gray sentence next to a pill it read as an
// afterthought (Suren: "the 'Available now' part looks horrible"). Split it
// back into the clauses it was joined from, and lift a short "Label: value"
// prefix out so every line has a subject of its own.
function availabilityNotes(text: string): { label: string | null; body: string }[] {
  return text
    .split(/\s*[·•|;]\s*|\n+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const at = part.indexOf(":");
      // A colon inside a URL ("https://") is punctuation, not a label.
      const isLabel =
        at > 0 && at <= 60 && part.slice(at + 1, at + 3) !== "//" && !!part.slice(at + 1).trim();
      return isLabel
        ? { label: part.slice(0, at).trim(), body: part.slice(at + 1).trim() }
        : { label: null, body: part };
    });
}

function SectionHeading({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: typeof BookOpen;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-light text-blue-primary">
          <Icon size={16} strokeWidth={1.9} />
        </span>
        <div className="min-w-0">
          <h2 className="text-[16px] font-semibold text-text-primary">{title}</h2>
          <p className="mt-0.5 text-[12px] text-text-tertiary">{description}</p>
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function OfferingOverviewMain({
  offering: o,
  report,
  related,
  admin,
}: {
  offering: ReturnType<typeof hydrateOffering>;
  report: OfferingReport;
  related: Offering[];
  admin: boolean;
}) {
  const description =
    o.offering_description ||
    o.offeringType?.description ||
    "No description has been added for this offering yet.";
  const avgRevenue = Math.round(
    report.totalRevenue / Math.max(report.customerCount, 1)
  );
  const revenuePerSeat = report.totalLicenses
    ? Math.round(report.totalRevenue / report.totalLicenses)
    : 0;
  const topCustomerShare = report.totalRevenue
    ? Math.round(((report.customers[0]?.revenue || 0) / report.totalRevenue) * 100)
    : 0;

  // What this section shows must NOT be what the table under it already
  // shows (Anir: "you're showing me exactly that right below it"). The
  // customer split was a redraw of the table's own share column, so it's
  // gone. These two are the facts the table can't tell you: what KIND of
  // revenue this is, and how long it stays contracted.
  // One palette for the whole section. The type donut ran green/purple next
  // to a blue/amber table — two colour systems inches apart (Anir: "match the
  // colors, doesn't really make sense"). Both now walk VIZ_SERIES in order.
  const REV_TYPE_COLOR: Record<string, string> = {
    license: VIZ_SERIES[0],
    project: VIZ_SERIES[1],
    annual: VIZ_SERIES[2],
    annual_service: VIZ_SERIES[3],
  };
  const allLines = report.customers.flatMap((customer) =>
    customer.lines.map((line) => ({ customer: customer.name, line }))
  );
  const typeTotals = new Map<string, number>();
  for (const { line } of allLines)
    typeTotals.set(
      line.revenue_type,
      (typeTotals.get(line.revenue_type) || 0) + line.amount
    );
  const typeSegments = [...typeTotals.entries()]
    .filter(([, value]) => value > 0)
    .map(([type, value]) => ({
      label: REVENUE_TYPE_META[type as keyof typeof REVENUE_TYPE_META]?.short || type,
      value,
      color: REV_TYPE_COLOR[type] || "#0071E3",
      tip: allLines
        .filter((entry) => entry.line.revenue_type === type)
        .map((entry) => ({
          logo: entry.customer,
          name: entry.customer,
          sub: entry.line.description || undefined,
          value: formatMoney(entry.line.amount),
        })),
    }));

  const now = new Date();
  const lineActiveAt = (line: (typeof allLines)[number]["line"], at: Date) => {
    const time = at.getTime();
    const start = line.start_date ? Date.parse(line.start_date) : -Infinity;
    const end = line.end_date ? Date.parse(line.end_date) : Infinity;
    return (Number.isNaN(start) || start <= time) && (Number.isNaN(end) || end >= time);
  };
  const outlook = Array.from({ length: 6 }, (_, index) => {
    const month = new Date(now.getFullYear(), now.getMonth() + index, 1);
    const live = allLines.filter((entry) => lineActiveAt(entry.line, month));
    return {
      label: month.toLocaleDateString("en-US", { month: "short" }),
      longLabel: month.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
      value: live.reduce((sum, entry) => sum + entry.line.amount, 0),
      color: VIZ_SERIES[0],
      entries: live,
    };
  });
  const outlookMax = Math.max(...outlook.map((month) => month.value), 1);
  const upcomingAvailability = o.future_availability
    ? availabilityNotes(o.future_availability)
    : [];
  const currentVersionNote = /(?:available\s+now|currently\s+available)/i.test(
    o.current_availability || ""
  )
    ? upcomingAvailability.find(
        (note) =>
          !note.label && /^version\s+\S+$/i.test(note.body.trim())
      )
    : undefined;
  const currentVersion = currentVersionNote?.body.trim() || null;
  const futureAvailability = currentVersionNote
    ? upcomingAvailability.filter((note) => note !== currentVersionNote)
    : upcomingAvailability;

  return (
    <div className="min-w-0">
      <section className="pb-7 border-b-2 border-border-light">
        <SectionHeading
          icon={BookOpen}
          title="Offering brief"
          description="The positioning a seller needs before taking this to an account."
        />
        <div className="mt-5 max-w-[900px] pl-11">
          {/* The descriptions came out of Suren's sheet as bullet LISTS — each
              bullet a service within the service. They render as real
              capability cards now instead of a pasted block of text; a plain
              prose description still renders as prose. */}
          <OfferingCapabilities
            text={description}
            offeringName={o.offering_name}
            styles={o.service_card_styles}
          />
          {/* Availability reads as a progression: today's status followed by
              each upcoming milestone. It collapses to a vertical timeline on
              narrow screens so labels never compete for horizontal space. */}
          {(o.current_availability || o.future_availability) && (
            <div className="mt-5 overflow-hidden rounded-xl border border-border-light bg-surface shadow-sm">
              <div className="flex items-center gap-2.5 border-b border-border-light bg-surface/50 px-4 py-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-light text-blue-primary">
                  <CalendarCheck size={14} strokeWidth={2} aria-hidden="true" />
                </span>
                <div>
                  <p className="text-[12px] font-semibold text-text-primary">
                    Availability timeline
                  </p>
                  <p className="text-[10.5px] text-text-tertiary">
                    Current status and what comes next
                  </p>
                </div>
              </div>

              <div className="flex flex-col px-4 py-4 md:flex-row md:px-5">
                {o.current_availability && (
                  <div className="relative flex min-w-0 gap-3 pb-5 md:block md:flex-1 md:pb-0 md:pr-5">
                    {futureAvailability.length > 0 && (
                      <span
                        className="absolute bottom-[-4px] left-[15px] top-8 w-px bg-border md:bottom-auto md:left-8 md:right-0 md:top-[15px] md:h-px md:w-auto"
                        aria-hidden="true"
                      />
                    )}
                    <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-4 border-surface bg-success text-white shadow-sm">
                      <Check size={13} strokeWidth={2.6} aria-hidden="true" />
                    </span>
                    <div className="min-w-0 pt-0.5 md:mt-3 md:pt-0">
                      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-text-tertiary">
                        {currentVersion ? "Current release" : "Current status"}
                      </p>
                      {currentVersion ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-[12.5px] font-semibold text-text-primary">
                            {currentVersion}
                          </p>
                          <AvailabilityPill value={o.current_availability} size="sm" />
                        </div>
                      ) : (
                        <AvailabilityPill value={o.current_availability} size="sm" />
                      )}
                    </div>
                  </div>
                )}

                {futureAvailability.map((note, index) => {
                  const isLast = index === futureAvailability.length - 1;
                  return (
                    <div
                      key={`${index}-${note.body}`}
                      className="relative flex min-w-0 gap-3 pb-5 last:pb-0 md:block md:flex-1 md:pb-0 md:pr-5 md:last:pr-0"
                    >
                      {!isLast && (
                        <span
                          className="absolute bottom-[-4px] left-[15px] top-8 w-px bg-border md:bottom-auto md:left-8 md:right-0 md:top-[15px] md:h-px md:w-auto"
                          aria-hidden="true"
                        />
                      )}
                      <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-4 border-surface bg-blue-primary shadow-sm">
                        <span className="h-2 w-2 rounded-full bg-white" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 pt-0.5 md:mt-3 md:pt-0">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-blue-primary">
                          {note.label || (index === 0 ? "Next milestone" : "Upcoming")}
                        </p>
                        <p className="mt-1 text-[12.5px] font-medium leading-relaxed text-text-primary">
                          {note.body}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </section>


      <section className="py-7 border-b border-border-light">
        <SectionHeading
          icon={BarChart3}
          title="Commercial performance"
          description="Account adoption, booked value, and renewal context in one place."
          action={null}
        />
        {report.customerCount === 0 ? (
          <p className="mt-5 pl-11 text-[13px] text-text-tertiary">
            No commercial data yet. Add this offering to a customer to begin tracking adoption and revenue.
          </p>
        ) : (
          <div className="mt-5 pl-11">
            <div className="grid grid-cols-2 divide-x divide-y divide-border-light border-y border-border-light lg:grid-cols-4 lg:divide-y-0">
              {[
                {
                  label: "Booked revenue",
                  value: formatMoney(report.totalRevenue),
                  detail: `${report.customerCount} customer ${report.customerCount === 1 ? "account" : "accounts"}`,
                  icon: DollarSign,
                },
                {
                  label: "Licensed seats",
                  value: String(report.totalLicenses),
                  detail: report.totalLicenses > 0 ? `${formatMoney(revenuePerSeat)} revenue per seat` : "No seat licenses",
                  icon: KeyRound,
                },
                {
                  label: "Commercial lines",
                  value: String(report.lineCount),
                  detail: "Projects, services, and licenses",
                  icon: ReceiptText,
                },
                {
                  label: "Average account",
                  value: formatMoney(avgRevenue),
                  detail: `Top account holds ${topCustomerShare}%`,
                  icon: Building2,
                },
              ].map(({ label, value, detail, icon: Icon }) => (
                <div key={label} className="flex min-w-0 items-center gap-3 px-4 py-3.5 first:pl-0">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-light text-blue-primary">
                    <Icon size={15} strokeWidth={1.9} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[9.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">{label}</span>
                    <span className="mt-0.5 block text-[18px] font-bold leading-none text-text-primary tnum">{value}</span>
                    <span className="mt-1 block text-[9.5px] leading-tight text-text-tertiary">{detail}</span>
                  </span>
                </div>
              ))}
            </div>

            {/* Both panels add something the table below cannot: the KIND of
                revenue, and how far out it stays under contract. */}
            {/* Both panels stretch to one shared height and their contents
                FILL it, the donut used to sit at the top of its box with a
                dead band underneath (Suren: "a lot of empty space below"). */}
            <div className="mt-5 grid grid-cols-1 items-stretch gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
              <div className="flex h-full flex-col rounded-xl border border-border-light px-4 py-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                    What kind of revenue
                  </p>
                  <ExpandedChartModal
                    title="Revenue by type"
                    subtitle={`${o.offering_name} contracted revenue split by commercial model.`}
                    chart={{
                      kind: "donut",
                      segments: typeSegments,
                      centerLabel: String(report.lineCount),
                      centerSub: report.lineCount === 1 ? "line" : "lines",
                      format: "money",
                    }}
                    className="h-8 px-2.5 text-[11px]"
                  />
                </div>
                <div className="flex flex-1 items-center gap-4">
                  <DonutChart
                    syncId="offering-types"
                    segments={typeSegments}
                    size={108}
                    thickness={13}
                    format="money"
                    centerLabel={String(report.lineCount)}
                    centerSub={report.lineCount === 1 ? "line" : "lines"}
                  />
                  {/* `format` has to be stated on the LEGEND too, not just the
                      donut. The legend's own pop-up prints the segment value
                      through the same fmt() the donut uses, so without it the
                      hover card headlined a raw "740000" where the ring beside
                      it said "$740K" — the same number in two different
                      languages, inches apart. It is money on both sides. */}
                  <DonutLegend
                    syncId="offering-types"
                    items={typeSegments}
                    format="money"
                    pill
                    bars={false}
                    showValues={false}
                  />
                </div>
              </div>

              <div className="flex h-full flex-col rounded-xl border border-border-light px-4 py-4">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                    Still under contract
                  </p>
                  <p className="text-[10px] text-text-tertiary">Next six months</p>
                </div>
                {/* Units at rest, so the column reads without hovering. */}
                <p className="mt-0.5 text-[10px] text-text-tertiary">
                  Contracted value per month (USD)
                </p>
                {/* Each month's money label is pinned to the top of ITS OWN
                    column instead of sharing one flat row far above the bars
                    (Suren: "shouldn't the number be right above the bar here?
                    Why is it all in line?"). Same idiom as /forecast's by-stage
                    plot: a stretchy track with the bar pinned to the baseline,
                    percentage heights so the chart fills whatever height the
                    row gives it, never a fixed pixel block with dead space. */}
                <div className="mt-3 flex flex-1 flex-col">
                  <div
                    data-outlook-plot
                    className="relative flex min-h-[136px] flex-1 items-stretch gap-2.5 border-b border-border-light"
                  >
                    {outlook.map((month, index) => {
                      // 78% ceiling leaves headroom for the tallest bar's own
                      // label; every bar keeps a visible stub at zero.
                      const barPct = Math.max(
                        (month.value / outlookMax) * 78,
                        month.value > 0 ? 5 : 2
                      );
                      const hover = (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                            {month.longLabel}
                          </p>
                          <p className="mt-0.5 text-[17px] font-bold text-text-primary tnum">
                            {formatMoney(month.value)}
                          </p>
                          <p className="mt-0.5 text-[11.5px] text-text-secondary">
                            Booked value still under contract that month
                          </p>
                          <div className="mt-2.5 border-t border-border-light pt-2.5">
                            <p className="mb-1.5 text-[9.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                              Accounts under contract
                            </p>
                            {month.entries.length === 0 ? (
                              <p className="text-[11.5px] text-text-tertiary">
                                Nothing under contract this month.
                              </p>
                            ) : (
                              <div className="space-y-1.5">
                                {month.entries.map((entry) => (
                                  <div
                                    key={`${entry.customer}-${entry.line.id}`}
                                    className="flex items-center gap-2 text-[11.5px]"
                                  >
                                    <CompanyLogo
                                      name={entry.customer}
                                      className="h-[18px] w-[18px] shrink-0 text-[7px]"
                                    />
                                    {/* Wraps, never truncates — a full account
                                        name is the point of the breakdown. */}
                                    <span className="min-w-0 flex-1 leading-tight">
                                      <span className="block break-words font-medium text-text-primary">
                                        {entry.customer}
                                      </span>
                                      <span className="block text-[10px] text-text-tertiary">
                                        {REVENUE_TYPE_META[entry.line.revenue_type]?.short}
                                      </span>
                                    </span>
                                    <span className="shrink-0 tnum text-text-secondary">
                                      {formatMoney(entry.line.amount)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                      return (
                        <div
                          key={month.label}
                          // A stretched column with its own floor height: the
                          // bar's %-height then always resolves against a real
                          // box, however tall the row grows.
                          className="group relative min-h-[136px] min-w-0 flex-1"
                        >
                          {/* Bar + value label are ONE object, lifted together
                              6px under the cursor, the exact idiom the shared
                              <BarChart> uses everywhere else in the app
                              (`transition-transform duration-150`, label as a
                              child of the lifted element so they move as one,
                              at one speed). This chart is hand-rolled here and
                              never got the behaviour, so it was the only bar
                              chart in the product that sat dead on hover. The
                              lift is CSS-only (`group-hover`) because this is a
                              server component with no hover state of its own. */}
                          <div
                            className="absolute inset-x-0 bottom-0 flex justify-center transition-transform duration-150 group-hover:-translate-y-1.5 motion-reduce:transition-none"
                            style={{ height: `${barPct}%` }}
                          >
                            <span className="pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap text-center text-[10.5px] font-semibold tnum text-text-primary">
                              {formatMoney(month.value)}
                            </span>
                            <HoverCard
                              side="top"
                              width={266}
                              delayMs={0}
                              content={hover}
                              clearAncestor="[data-outlook-plot]"
                              // 20 + the 6px hover lift: HoverCard measures the
                              // trigger the instant the cursor arrives, before
                              // the bar has risen, so the card has to reserve
                              // the lift itself or it lands on the top of the
                              // value label it is supposed to clear.
                              tightAbove={26}
                              className="h-full w-[70%] max-w-[52px] cursor-pointer"
                            >
                              <div
                                className="chart-bar h-full w-full rounded-t-md transition-[filter] group-hover:brightness-105"
                                style={{
                                  background: month.color,
                                  animationDelay: `${index * 60}ms`,
                                }}
                              />
                            </HoverCard>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-1.5 flex gap-2.5">
                    {outlook.map((month) => (
                      <p
                        key={month.label}
                        className="min-w-0 flex-1 text-center text-[10.5px] text-text-tertiary"
                      >
                        {month.label}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 overflow-hidden border-y border-border-light">
              {/* `bg-[var(--surface)]`, never `bg-surface/65`: an opacity
                  modifier compiles to the class `bg-surface\/65`, which the
                  `.dark .bg-surface` re-skin cannot match, so this header bar
                  kept its light plate and sat as a pale strip across the table
                  in dark mode. The variable is redefined under `.dark`, so it
                  follows the theme on its own. */}
              <div className="grid grid-cols-[minmax(190px,1.45fr)_88px_70px_minmax(118px,.85fr)] gap-3 bg-[var(--surface)] px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                <span>Customer account</span>
                <span>Revenue</span>
                <span>Seats</span>
                <span>Revenue share</span>
              </div>
              <div className="divide-y divide-border-light">
                {report.customers.map((customer, index) => {
                  const color = VIZ_SERIES[index % VIZ_SERIES.length];
                  const share = report.totalRevenue
                    ? Math.round((customer.revenue / report.totalRevenue) * 100)
                    : 0;
                  const nextRenewal = customer.lines
                    .map((line) => line.end_date)
                    .filter((date): date is string => Boolean(date))
                    .sort()[0];
                  const hover = (
                    <div>
                      <div className="flex items-center gap-2.5">
                        <CompanyLogo name={customer.name} className="h-9 w-9 shrink-0 text-[9px]" />
                        <div className="min-w-0">
                          <p className="text-[13.5px] font-semibold text-text-primary">{customer.name}</p>
                          <p className="text-[11px] text-text-tertiary">
                            {formatMoney(customer.revenue)} · {customer.licenses} licensed seats
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 border-t border-border-light pt-2.5">
                        <p className="mb-2 text-[9.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                          Commercial lines
                        </p>
                        {customer.lines.length > 0 ? (
                          <div className="space-y-2">
                            {customer.lines.map((line) => (
                              <div key={line.id} className="flex items-start justify-between gap-3 text-[11.5px]">
                                <span className="min-w-0">
                                  <span className="block font-medium text-text-primary">
                                    {REVENUE_TYPE_META[line.revenue_type].label}
                                  </span>
                                  <span className="block text-[10px] text-text-tertiary">
                                    {line.end_date ? `Through ${formatDate(line.end_date)}` : "Ongoing"}
                                    {line.description ? ` · ${line.description}` : ""}
                                  </span>
                                </span>
                                <span className="shrink-0 font-semibold text-text-primary tnum">
                                  {formatMoney(line.amount)}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[11.5px] text-text-tertiary">Marked in use; commercial terms have not been entered.</p>
                        )}
                      </div>
                    </div>
                  );
                  return (
                    <HoverCard key={customer.id} side="top" width={310} content={hover}>
                      <Link
                        href={`/customers/${customer.id}?tab=offerings`}
                        // Same reason as the header bar above: the row wash has
                        // to be the CSS variable, or hovering a customer row in
                        // dark mode flashes a light plate under light text.
                        className="group grid min-h-[62px] grid-cols-[minmax(190px,1.45fr)_88px_70px_minmax(118px,.85fr)] items-center gap-3 px-3 py-2.5 transition-colors hover:bg-[var(--surface)]"
                      >
                        <span className="flex min-w-0 items-center gap-2.5">
                          <CompanyLogo name={customer.name} className="h-8 w-8 shrink-0 text-[8px]" />
                          <span className="min-w-0">
                            <span className="block text-[12.5px] font-semibold leading-tight text-text-primary group-hover:text-blue-primary">
                              {customer.name}
                            </span>
                            <span className="mt-0.5 block text-[9.5px] leading-tight text-text-tertiary">
                              {customer.lines.length} commercial {customer.lines.length === 1 ? "line" : "lines"}
                              {nextRenewal ? ` · renews ${formatDate(nextRenewal)}` : " · ongoing"}
                            </span>
                          </span>
                        </span>
                        <span className="text-[12.5px] font-semibold text-text-primary tnum">
                          {formatMoney(customer.revenue)}
                        </span>
                        <span className="text-[12px] font-medium text-text-secondary tnum">
                          {customer.licenses || "-"}
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-center justify-between gap-2 text-[9.5px] text-text-tertiary">
                            <span>{share}%</span>
                            <span>{customer.lines.length} {customer.lines.length === 1 ? "line" : "lines"}</span>
                          </span>
                          <span className="mt-1.5 block h-2 overflow-hidden rounded-full bg-surface">
                            <span
                              className="block h-full rounded-full"
                              style={{ width: `${share}%`, background: color }}
                            />
                          </span>
                        </span>
                      </Link>
                    </HoverCard>
                  );
                })}
              </div>
            </div>

          </div>
        )}
      </section>

      {related.length > 0 && (
        <section className="pt-7 border-t-2 border-border-light">
          <SectionHeading
            icon={Layers}
            title="Related offerings"
            description={`Other ${o.offering_type} configurations worth considering for the same account.`}
          />
          {/* Floating pill cards, not hairline rows (Anir, Jul 28: "make it
              look better, like pill-like floating pills"). Each related
              offering is its own rounded card that lifts on hover, the same
              tile language as the offerings browser, so the section reads as
              things you can pick up rather than a table. */}
          <div className="mt-5 ml-11 grid grid-cols-1 gap-3 xl:grid-cols-2">
            {related.map((relatedOffering) => (
              <Link
                key={relatedOffering.id}
                href={`/offerings/${relatedOffering.id}`}
                // Every pill is the SAME height, whatever its name does. The
                // chip row below is always one line (see below), so the only
                // variable left is how many lines the name takes, and the icon
                // beside it is already 36px tall — a two-line name costs the
                // card nothing. min-h pins the rest so a row of pills can never
                // come out ragged.
                className="group flex min-h-[92px] flex-col justify-center gap-2 rounded-2xl border border-border-light bg-white px-4 py-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all duration-150 hover:-translate-y-0.5 hover:border-blue-subtle hover:shadow-[0_6px_18px_rgba(16,24,40,0.08)]"
              >
                <span className="flex items-center gap-3">
                  <OfferingIcon name={relatedOffering.offering_name} className="h-9 w-9 shrink-0" />
                  {/* The full name, always. No truncate, no break-words: the
                      default wrap only breaks at spaces, so
                      "Freya.GRR-PAC (Global Regulatory Requirements for Post
                      Approval Changes)" runs onto a second line intact instead
                      of splitting the product code down the middle. */}
                  <span className="min-w-0 flex-1 text-[13.5px] font-semibold leading-snug text-text-primary group-hover:text-blue-primary">
                    {relatedOffering.offering_name}
                  </span>
                  <ChevronRight size={15} strokeWidth={1.7} className="shrink-0 text-text-tertiary transition-transform group-hover:translate-x-0.5 group-hover:text-blue-primary" />
                </span>
                {/* The facts sit on their own full-width row UNDER the header,
                    not in the narrow column beside the icon. That extra ~75px
                    is what keeps the longest pair ("Submissions and Document
                    Operations" + "Available Oct-26") on a single line, which is
                    what keeps every pill the same height. The category used to
                    print as flat gray text, the one thing a category is never
                    allowed to be: it now wears the same blue + Layers mark as
                    the category chip in this page's own header, so the same
                    fact reads the same on both. */}
                <span className="flex flex-wrap items-center gap-1">
                  {relatedOffering.offering_category && (
                    // Sized to clear the row, not by eye: the widest pair in
                    // this list ("Submissions and Document Operations" +
                    // "Available Oct-26") came to 361px against 360px of row,
                    // and wrapped, which is what made two of the eight pills
                    // taller than the other six.
                    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-blue-light px-1.5 py-0.5 text-[10px] font-semibold text-blue-primary">
                      <Layers size={10} strokeWidth={2.3} aria-hidden="true" />
                      {relatedOffering.offering_category}
                    </span>
                  )}
                  <AvailabilityPill value={relatedOffering.current_availability} size="sm" />
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
