import Link from "next/link";
import {
  BarChart3,
  BookOpen,
  ChevronRight,
  DollarSign,
  ExternalLink,
  File,
  FileText,
  FolderOpen,
  KeyRound,
  Layers,
  Presentation,
  Quote,
  ReceiptText,
  Swords,
  Table2,
  Video,
} from "lucide-react";
import { AddMaterialButton } from "@/components/offerings/AddMaterialButton";
import { CollapsibleDescription } from "@/components/offerings/CollapsibleDescription";
import { OfferingIcon } from "@/components/ui/OfferingIcon";
import { AvailabilityPill } from "@/components/ui/AvailabilityPill";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { HoverCard } from "@/components/ui/HoverCard";
import { formatMoney } from "@/lib/pipeline";
import { VIZ_SERIES } from "@/components/charts/Charts";
import {
  MATERIAL_META,
  type MaterialKind,
  type Offering,
  hydrateOffering,
} from "@/lib/offerings";
import type { OfferingReport } from "@/lib/revenue";
import { REVENUE_TYPE_META } from "@/lib/revenue";
import { formatDate } from "@/lib/utils";

const MATERIAL_ICON: Record<MaterialKind, typeof Video> = {
  video: Video,
  presentation: Presentation,
  whitepaper: FileText,
  pricing: DollarSign,
  competition: Swords,
  case_study: BookOpen,
  reference: Quote,
  one_pager: File,
  datasheet: Table2,
};

const KIND_ORDER: MaterialKind[] = [
  "video",
  "presentation",
  "whitepaper",
  "pricing",
  "case_study",
  "reference",
  "competition",
  "one_pager",
  "datasheet",
];

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

  return (
    <div className="min-w-0">
      <section className="pb-7 border-b-2 border-border-light">
        <SectionHeading
          icon={BookOpen}
          title="Offering brief"
          description="The positioning a seller needs before taking this to an account."
        />
        <div className="mt-5 max-w-[900px] pl-11">
          <CollapsibleDescription text={description} threshold={520} />
          {o.future_availability && (
            <div className="mt-5 flex items-start gap-3 border-l-2 border-blue-primary bg-blue-light/45 px-4 py-3">
              <AvailabilityPill value={o.current_availability} size="sm" />
              <p className="text-[12.5px] leading-relaxed text-text-secondary">
                {o.future_availability}
              </p>
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
            <div className="grid grid-cols-3 divide-x divide-border-light border-y border-border-light">
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

            <div className="grid grid-cols-3 divide-x divide-border-light border-b border-border-light">
              {[
                ["Average account", formatMoney(avgRevenue)],
                ["Revenue per seat", report.totalLicenses ? formatMoney(revenuePerSeat) : "—"],
                ["Top-account share", `${topCustomerShare}%`],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0 px-3 py-3 first:pl-0">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">{label}</p>
                  <p className="mt-0.5 text-[13.5px] font-bold text-text-primary tnum">{value}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="py-7 border-b border-border-light">
        <SectionHeading
          icon={FolderOpen}
          title={`Sales materials (${o.materials.length})`}
          description="Seller-ready assets, ordered by the way they are typically used."
          action={admin ? <AddMaterialButton offeringId={o.id} materials={o.materials} /> : null}
        />
        {o.materials.length === 0 ? (
          <p className="mt-5 pl-11 text-[13px] text-text-tertiary">No sales materials have been added.</p>
        ) : (
          <div className="mt-5 ml-11 border-y border-border-light divide-y divide-border-light">
            {KIND_ORDER.flatMap((kind) =>
              o.materials
                .filter((material) => material.kind === kind)
                .map((material) => {
                  const Icon = MATERIAL_ICON[kind];
                  return (
                    <a
                      key={material.id}
                      href={material.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex min-h-[64px] items-center gap-3 px-1 py-3 hover:bg-blue-light/30 transition-colors"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-light text-blue-primary">
                        <Icon size={16} strokeWidth={1.8} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-semibold text-text-primary group-hover:text-blue-primary">{material.label}</span>
                        <span className="mt-0.5 block text-[11px] text-text-tertiary">{MATERIAL_META[kind].label}</span>
                      </span>
                      <span className="hidden shrink-0 text-[11px] font-medium text-text-tertiary lg:block">Open asset</span>
                      <ExternalLink size={14} strokeWidth={1.7} className="shrink-0 text-text-tertiary group-hover:text-blue-primary" />
                    </a>
                  );
                })
            )}
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
          <div className="mt-5 ml-11 grid grid-cols-2 gap-x-5 border-y border-border-light">
            {related.map((relatedOffering) => (
              <Link
                key={relatedOffering.id}
                href={`/offerings/${relatedOffering.id}`}
                className="group flex min-h-[68px] items-center gap-3 border-b border-border-light px-1 py-3 hover:bg-blue-light/30 transition-colors"
              >
                <OfferingIcon name={relatedOffering.offering_name} className="h-9 w-9 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold text-text-primary group-hover:text-blue-primary">{relatedOffering.offering_name}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-text-tertiary">{relatedOffering.offering_category}</span>
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
