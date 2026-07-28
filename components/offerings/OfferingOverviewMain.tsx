import Link from "next/link";
import {
  BarChart3,
  BookOpen,
  CalendarCheck,
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
          <OfferingCapabilities text={description} offeringName={o.offering_name} />
          {/* AVAILABILITY — a titled block in the app's card language, not a
              pill glued to the front of a run-on sentence. The eyebrow says
              what the block is, the pill says the status, and each caveat from
              the sheet gets its own line. */}
          {(o.current_availability || o.future_availability) && (
            <div className="mt-5 rounded-xl border border-border-light bg-blue-light px-4 py-3.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <CalendarCheck
                  size={13}
                  strokeWidth={2.1}
                  className="shrink-0 text-blue-primary"
                  aria-hidden="true"
                />
                <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-blue-primary">
                  Availability
                </p>
                <AvailabilityPill value={o.current_availability} size="sm" />
              </div>
              {o.future_availability && (
                <ul className="mt-2.5 space-y-1.5 border-t border-border-light pt-2.5">
                  {availabilityNotes(o.future_availability).map((note, index) => (
                    <li
                      key={`${index}-${note.body}`}
                      className="flex items-start gap-2 text-[12.5px] leading-relaxed"
                    >
                      <span
                        className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-blue-primary"
                        aria-hidden="true"
                      />
                      <span className="min-w-0">
                        {note.label && (
                          <span className="font-semibold text-text-primary">
                            {note.label}:{" "}
                          </span>
                        )}
                        <span className="text-text-secondary">{note.body}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="py-7 border-b-2 border-border-light">
        <SectionHeading
          icon={BarChart3}
          title="Commercial performance"
          description="Account adoption, booked value, and renewal context in one place."
          action={
            report.customerCount > 0 ? (
              <Link
                href={`/offerings/${o.id}?tab=reports`}
                className="inline-flex items-center gap-1 text-[12px] font-semibold text-blue-primary hover:underline"
              >
                Open reports <ChevronRight size={13} strokeWidth={2} />
              </Link>
            ) : null
          }
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
                FILL it — the donut used to sit at the top of its box with a
                dead band underneath (Suren: "a lot of empty space below"). */}
            <div className="mt-5 grid grid-cols-1 items-stretch gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
              <div className="flex h-full flex-col rounded-xl border border-border-light px-4 py-4">
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                  What kind of revenue
                </p>
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
                  <DonutLegend
                    syncId="offering-types"
                    items={typeSegments}
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
                    row gives it — never a fixed pixel block with dead space. */}
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
                          <span
                            className="pointer-events-none absolute inset-x-0 text-center text-[10.5px] font-semibold tnum text-text-primary"
                            style={{ bottom: `calc(${barPct}% + 5px)` }}
                          >
                            {formatMoney(month.value)}
                          </span>
                          <div
                            className="absolute inset-x-0 bottom-0 flex justify-center"
                            style={{ height: `${barPct}%` }}
                          >
                            <HoverCard
                              side="top"
                              width={266}
                              delayMs={0}
                              content={hover}
                              clearAncestor="[data-outlook-plot]"
                              tightAbove={20}
                              className="h-full w-[70%] max-w-[52px] cursor-pointer"
                            >
                              <div
                                className="chart-bar h-full w-full rounded-t-md transition-[filter,transform] group-hover:brightness-105"
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
              <div className="grid grid-cols-[minmax(190px,1.45fr)_88px_70px_minmax(118px,.85fr)] gap-3 bg-surface/65 px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
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
                        className="group grid min-h-[62px] grid-cols-[minmax(190px,1.45fr)_88px_70px_minmax(118px,.85fr)] items-center gap-3 px-3 py-2.5 transition-colors hover:bg-surface/55"
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
                          {customer.licenses || "—"}
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

      <section className="py-7 border-b border-border-light">
        <SectionHeading
          icon={FolderOpen}
          title={`Sales materials (${o.materials.length})`}
          description="Seller-ready assets, ordered by the way they are typically used."
          action={
            /* Uploading assets is every member's job — offering owners join as
               "sales" and must not need an admin to add their own materials
               (Jul 27 call). Editing/deleting the offering stays admin-only. */
            o.materials.length === 0 ? (
              <AddMaterialButton offeringId={o.id} materials={o.materials} />
            ) : null
          }
        />
        {o.materials.length === 0 ? (
          <p className="mt-5 pl-11 text-[13px] text-text-tertiary">No sales materials have been added.</p>
        ) : (
          <MaterialsSection
            materials={o.materials}
            action={
              <AddMaterialButton offeringId={o.id} materials={o.materials} compact />
            }
          />
        )}
      </section>

      {related.length > 0 && (
        <section className="pt-7 border-t-2 border-border-light">
          <SectionHeading
            icon={Layers}
            title="Related offerings"
            description={`Other ${o.offering_type} configurations worth considering for the same account.`}
          />
          <div className="mt-5 ml-11 grid grid-cols-2 gap-x-5 border-y border-border-light">
            {related.map((relatedOffering) => (
              <Link
                key={relatedOffering.id}
                href={`/offerings/${relatedOffering.id}`}
                className="group flex min-h-[68px] items-center gap-3 border-b border-border-light px-1 py-3 hover:bg-blue-light/30 transition-colors"
              >
                <OfferingIcon name={relatedOffering.offering_name} className="h-9 w-9 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-semibold leading-snug text-text-primary group-hover:text-blue-primary">{relatedOffering.offering_name}</span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-text-tertiary">{relatedOffering.offering_category}</span>
                </span>
                <AvailabilityPill value={relatedOffering.current_availability} size="sm" />
                <ChevronRight size={15} strokeWidth={1.7} className="shrink-0 text-text-tertiary group-hover:text-blue-primary" />
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
