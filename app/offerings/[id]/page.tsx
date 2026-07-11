import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Video,
  Presentation,
  FileText,
  DollarSign,
  ExternalLink,
  Sparkles,
  Pencil,
  Plus,
  ChevronRight,
  UserRound,
  Swords,
  BookOpen,
  Quote,
  Layers,
  Building2,
  AlignLeft,
  BarChart3,
  FolderOpen,
  Globe,
  File,
  Table2,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { AvailabilityPill } from "@/components/ui/AvailabilityPill";
import { SectionCard } from "@/components/ui/SectionCard";
import { Tooltip } from "@/components/ui/Tooltip";
import { Avatar } from "@/components/ui/Avatar";
import { RecordView } from "@/components/RecordView";
import { DuplicateButton } from "@/components/offerings/DuplicateButton";
import { OfferingReports } from "@/components/offerings/OfferingReports";
import { OfferingActions } from "@/components/offerings/OfferingActions";
import { CollapsibleDescription } from "@/components/offerings/CollapsibleDescription";
import { DonutChart, BarChart, VIZ_SERIES } from "@/components/charts/Charts";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { OfferingIcon } from "@/components/ui/OfferingIcon";
import { AddMaterialButton } from "@/components/offerings/AddMaterialButton";
import { isAdmin } from "@/lib/role";
import { getDb } from "@/lib/db";
import { reportForOffering } from "@/lib/revenue";
import { formatMoney } from "@/lib/pipeline";
import { cn } from "@/lib/utils";
import {
  getOffering,
  hydrateOffering,
  listOfferings,
  MATERIAL_META,
  type MaterialKind,
} from "@/lib/offerings";

export const dynamic = "force-dynamic";

export function generateMetadata({ params }: { params: { id: string } }) {
  const o = getOffering(params.id);
  return { title: o ? `${o.offering_name} · Offerings` : "Offering" };
}

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
const CT_FAMILIES = ["Pharmaceutical", "Biologics", "Bio Pharmaceutical"];

export default async function OfferingDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { tab?: string };
}) {
  const raw = getOffering(params.id);
  if (!raw) notFound();
  const o = hydrateOffering(raw);

  const tab = searchParams?.tab === "reports" ? "reports" : "overview";
  const allCustomers = await getDb().customers.list();
  const report = reportForOffering(allCustomers, o.id);
  const customerPickList = allCustomers.map((c) => ({
    id: c.id,
    name: c.company_name,
  }));

  // Sibling offerings of the same type — Suren's catalog is variant-heavy, so a
  // quick way to compare the family (e.g. the Freya Register stack) is useful.
  const related = raw.offering_type
    ? listOfferings().filter(
        (x) => x.id !== raw.id && x.offering_type === raw.offering_type
      )
    : [];

  const isMapped =
    o.customerTypes.length > 0 || o.markets.length > 0 || o.materials.length > 0;
  const admin = isAdmin();

  // The internal person accountable for this offering — the category owner if
  // set, else the delivery POC. Only render the owner card when one is real.
  const ownerName = o.offeringCategory?.owner || o.poc || "";
  const ownerRole = o.offeringCategory?.owner
    ? `${o.offeringCategory.name} owner`
    : o.poc
    ? "Delivery contact"
    : "";

  // Each market + size band reads as its own color so they scan at a glance
  // (Anir: "USA, Europe, Japan, China, Korea each a different color; same for
  // small, mid, large"). Keyed loosely so labels like "United States" match.
  const marketStyle = (name: string): { bg: string; color: string } => {
    const n = name.toLowerCase();
    if (n.includes("usa") || n.includes("united states") || n.includes("us"))
      return { bg: "rgba(0,113,227,0.10)", color: "#0071E3" };
    if (n.includes("europe") || n.includes("eu"))
      return { bg: "rgba(94,92,230,0.12)", color: "#5E5CE6" };
    if (n.includes("japan")) return { bg: "rgba(219,39,119,0.10)", color: "#C81E67" };
    if (n.includes("china")) return { bg: "rgba(255,59,48,0.10)", color: "#C0362C" };
    if (n.includes("korea")) return { bg: "rgba(15,158,142,0.12)", color: "#0F9E8E" };
    return { bg: "rgba(142,152,168,0.14)", color: "#5B6472" };
  };
  // Country flag per market (Suren: "put some flags here").
  const marketFlag = (name: string): string => {
    const n = name.toLowerCase();
    if (n.includes("usa") || n.includes("united states") || n === "us") return "🇺🇸";
    if (n.includes("europe") || n.includes("eu")) return "🇪🇺";
    if (n.includes("japan")) return "🇯🇵";
    if (n.includes("china")) return "🇨🇳";
    if (n.includes("korea")) return "🇰🇷";
    if (n.includes("canada")) return "🇨🇦";
    if (n.includes("united kingdom") || n.includes("uk") || n.includes("britain")) return "🇬🇧";
    if (n.includes("india")) return "🇮🇳";
    if (n.includes("brazil")) return "🇧🇷";
    if (n.includes("australia")) return "🇦🇺";
    if (n.includes("switzerland")) return "🇨🇭";
    if (n.includes("germany")) return "🇩🇪";
    return "🌐";
  };
  // Two colour dimensions on Target segments (Suren): the FAMILY (blue / rose /
  // violet) and the SIZE (slate / amber / green) — distinct hues so they never
  // clash when shown together.
  const familyStyle = (fam: string): string => {
    const f = fam.toLowerCase();
    if (f.includes("bio pharma") || f.includes("biopharma")) return "#7C3AED"; // violet
    if (f.includes("biologic")) return "#E11D48"; // rose
    if (f.includes("pharma")) return "#0071E3"; // blue
    return "#8E98A8";
  };
  const sizeStyle = (size: string): { bg: string; color: string } => {
    const s = size.toLowerCase();
    if (s.includes("small")) return { bg: "rgba(2,132,199,0.12)", color: "#0369A1" }; // sky
    if (s.includes("large")) return { bg: "rgba(5,150,105,0.14)", color: "#047857" }; // emerald
    return { bg: "rgba(217,119,6,0.15)", color: "#B45309" }; // mid — amber
  };

  // Commercials bars (revenue by customer) for the inline summary.
  const commercialsBars = report.customers
    .filter((c) => c.revenue > 0)
    .map((c, i) => ({
      label: c.name,
      value: c.revenue,
      color: VIZ_SERIES[i % VIZ_SERIES.length],
      tip: [{ logo: c.name, name: c.name, value: formatMoney(c.revenue) }],
    }));
  const licenseBars = report.customers
    .filter((c) => c.licenses > 0)
    .map((c, i) => ({
      label: c.name,
      value: c.licenses,
      color: VIZ_SERIES[i % VIZ_SERIES.length],
      tip: [{ logo: c.name, name: c.name, value: `${c.licenses} seats` }],
    }));

  return (
    <div>
      <RecordView
        type="Offering"
        label={o.offering_name}
        sublabel={o.offering_type || ""}
        href={`/offerings/${o.id}`}
      />
      <Link
        href="/offerings"
        className="inline-flex items-center gap-1.5 text-[13px] text-text-secondary hover:text-blue-primary mb-4"
      >
        <ArrowLeft size={15} strokeWidth={1.8} /> All offerings
      </Link>

      {/* Header: identity on the left, primary actions on the right */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
        <div className="min-w-0">
          <h1 className="flex items-center gap-3 text-[30px] font-semibold tracking-[-0.02em] text-text-primary leading-tight">
            <OfferingIcon name={o.offering_name} className="w-11 h-11 shrink-0" />
            {o.offering_name}
          </h1>
          {/* All tags on one line (Anir: single line to save space) */}
          <div className="flex flex-wrap items-center gap-2 mt-2.5">
            {o.offering_category && (
              <Link
                href={`/offerings?cat=${o.offeringCategory?.id ?? ""}`}
                className="inline-flex items-center gap-1 text-[12px] font-medium text-blue-primary bg-blue-light rounded-full px-2.5 py-1 hover:bg-blue-subtle/60 transition-colors"
              >
                <Layers size={12} strokeWidth={1.9} />
                {o.offering_category}
              </Link>
            )}
            {o.offering_type && (
              <span className="inline-flex items-center gap-1 text-[12px] font-medium text-text-secondary bg-surface border border-border-light rounded-full px-2.5 py-1">
                {o.offering_type}
              </span>
            )}
            <AvailabilityPill value={o.current_availability} />
            {!isMapped && (
              <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-text-tertiary bg-surface border border-border-light rounded-full px-2.5 py-1">
                <span className="w-1.5 h-1.5 rounded-full border border-text-tertiary" />
                Awaiting details
              </span>
            )}
          </div>
        </div>

        {/* All actions on one line (Anir: single line to save space) —
            OfferingActions keeps its two + the admin buttons as `extra`. */}
        <div className="shrink-0">
          <OfferingActions
            offeringId={o.id}
            offeringName={o.offering_name}
            customers={customerPickList}
            extra={
              admin ? (
                <>
                  <DuplicateButton
                    offering={{
                      offering_type: o.offering_type,
                      offering_category: o.offering_category,
                      offering_name: o.offering_name,
                      offering_description: o.offering_description,
                      current_availability: o.current_availability,
                      future_availability: o.future_availability,
                      poc: o.poc,
                      customer_type_ids: raw.customer_type_ids,
                      market_ids: raw.market_ids,
                      materials: raw.materials.map((m) => ({
                        kind: m.kind,
                        label: m.label,
                        url: m.url,
                      })),
                    }}
                  />
                  <Link
                    href={`/offerings/${o.id}/edit`}
                    className="inline-flex items-center gap-1.5 text-[13px] font-medium rounded-md px-3 py-2 bg-white border border-border-light text-text-primary hover:bg-surface hover:border-blue-subtle transition-colors"
                  >
                    <Pencil size={14} strokeWidth={1.8} /> Edit offering
                  </Link>
                </>
              ) : null
            }
          />
        </div>
      </div>

      {/* Overview | Reports (Suren's "I need a reports tab in offering") */}
      <div
        role="tablist"
        aria-label="Offering sections"
        className="flex gap-8 border-b border-border-light mt-6"
      >
        {[
          { key: "overview", label: "Overview", href: `/offerings/${o.id}` },
          {
            key: "reports",
            label:
              report.customerCount > 0
                ? `Reports (${report.customerCount})`
                : "Reports",
            href: `/offerings/${o.id}?tab=reports`,
          },
        ].map((t) => (
          <Link
            key={t.key}
            href={t.href}
            role="tab"
            aria-selected={tab === t.key}
            className={cn(
              "pb-3 -mb-px border-b-2 text-[14px] transition-colors",
              tab === t.key
                ? "border-blue-primary text-blue-primary font-semibold"
                : "border-transparent text-text-secondary hover:text-text-primary font-medium"
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "reports" ? (
        <OfferingReports report={report} offeringName={o.offering_name} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6 mt-6 items-start">
          {/* ---------------------------------------------------- MAIN column */}
          <div className="space-y-5">
            {/* Summary / About — labelled "About {type}" when the offering has
                no description of its own (falls back to the type's). */}
            <SectionCard
              title={o.offering_description ? "Summary" : o.offeringType?.description ? `About ${o.offering_type}` : "Summary"}
              icon={AlignLeft}
            >
              {o.offering_description ? (
                <CollapsibleDescription text={o.offering_description} />
              ) : o.offeringType?.description ? (
                <CollapsibleDescription text={o.offeringType.description} />
              ) : (
                <p className="text-[13px] text-text-tertiary">
                  No description yet — it comes from this offering&apos;s sales
                  materials.
                </p>
              )}
              {o.future_availability && (
                <p className="text-[12.5px] text-text-secondary leading-relaxed mt-3 pt-3 border-t border-border-light">
                  <span className="font-medium text-text-tertiary">
                    Availability —{" "}
                  </span>
                  {o.future_availability}
                </p>
              )}
            </SectionCard>

            {/* Commercials — inline summary, deep dive on the Reports tab */}
            <SectionCard
              title="Commercials"
              icon={BarChart3}
              action={
                report.customerCount > 0 ? (
                  <Link
                    href={`/offerings/${o.id}?tab=reports`}
                    className="inline-flex items-center gap-1 text-[12px] font-semibold text-blue-primary hover:underline"
                  >
                    View full report
                    <ChevronRight size={13} strokeWidth={2} />
                  </Link>
                ) : null
              }
            >
              {report.customerCount === 0 ? (
                <p className="text-[13px] text-text-tertiary">
                  No revenue logged yet — add it on a customer&apos;s Offerings
                  tab and it rolls up here.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Card 1 — Revenue: donut is the ONLY place the total shows
                      (no repeated stat), legend stacked one-per-row to save
                      space (Suren). */}
                  <div className="rounded-xl border border-border-light p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-2">
                      Revenue
                    </p>
                    <div className="flex items-center gap-3">
                      <DonutChart
                        segments={commercialsBars}
                        size={96}
                        thickness={12}
                        centerLabel={formatMoney(report.totalRevenue)}
                        centerSub="total"
                      />
                      <div className="min-w-0 flex-1 space-y-1.5">
                        {commercialsBars.map((b) => (
                          <div key={b.label} className="flex items-center gap-1.5 text-[12px]">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: b.color }} />
                            <span className="truncate text-text-secondary">{b.label}</span>
                            <span className="ml-auto font-semibold text-text-primary tnum">
                              {formatMoney(b.value)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Card 2 — Licensed seats + a per-customer bar (the extra graph). */}
                  <div className="rounded-xl border border-border-light p-4 flex flex-col">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                      Licensed seats
                    </p>
                    <p className="text-[26px] font-bold text-text-primary tnum leading-none mt-1">
                      {report.totalLicenses}
                    </p>
                    <p className="text-[12px] text-text-tertiary mt-1">
                      across {report.customerCount} customer{report.customerCount === 1 ? "" : "s"}
                    </p>
                    {licenseBars.length > 0 && (
                      <div className="mt-3 flex-1 flex items-end">
                        <BarChart data={licenseBars} height={72} format="number" unit="seats" />
                      </div>
                    )}
                  </div>

                  {/* Card 3 — Contracts + derived economics (no repeated numbers). */}
                  <div className="rounded-xl border border-border-light p-4 flex flex-col justify-between">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                        Contracts
                      </p>
                      <p className="text-[26px] font-bold text-text-primary tnum leading-none mt-1">
                        {report.lineCount}
                      </p>
                      <p className="text-[12px] text-text-tertiary mt-1">
                        revenue lines across {report.customerCount} customer
                        {report.customerCount === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div className="rounded-lg bg-surface px-2.5 py-2">
                        <p className="text-[9.5px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
                          Avg / customer
                        </p>
                        <p className="text-[14px] font-bold text-text-primary tnum leading-none mt-0.5">
                          {formatMoney(Math.round(report.totalRevenue / Math.max(report.customerCount, 1)))}
                        </p>
                      </div>
                      <div className="rounded-lg bg-surface px-2.5 py-2">
                        <p className="text-[9.5px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
                          Avg / seat
                        </p>
                        <p className="text-[14px] font-bold text-text-primary tnum leading-none mt-0.5">
                          {report.totalLicenses ? formatMoney(Math.round(report.totalRevenue / report.totalLicenses)) : "—"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </SectionCard>

            {/* Sales materials */}
            <SectionCard title={`Sales materials (${o.materials.length})`} icon={FolderOpen}>
              {o.materials.length === 0 ? (
                admin ? (
                  <AddMaterialButton offeringId={o.id} materials={o.materials} />
                ) : (
                  <p className="text-[13px] text-text-tertiary">No materials yet</p>
                )
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {KIND_ORDER.flatMap((kind) =>
                    o.materials
                      .filter((m) => m.kind === kind)
                      .map((m) => {
                        const Icon = MATERIAL_ICON[kind];
                        return (
                          <a
                            key={m.id}
                            href={m.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group flex items-center gap-3 p-3 rounded-lg border border-border-light hover:border-blue-subtle hover:bg-blue-light/40 transition-colors"
                          >
                            <span className="w-9 h-9 rounded-md bg-blue-light text-blue-primary flex items-center justify-center shrink-0">
                              <Icon size={16} strokeWidth={1.8} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-[13.5px] font-medium text-text-primary truncate group-hover:text-blue-primary">
                                {m.label}
                              </span>
                              <span className="block text-[11px] text-text-tertiary">
                                {MATERIAL_META[kind].label}
                              </span>
                            </span>
                            <ExternalLink
                              size={14}
                              strokeWidth={1.7}
                              className="text-text-tertiary group-hover:text-blue-primary shrink-0"
                            />
                          </a>
                        );
                      })
                  )}
                </div>
              )}
              {admin && o.materials.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border-light">
                  <AddMaterialButton offeringId={o.id} materials={o.materials} />
                </div>
              )}
            </SectionCard>

            {/* Cross-sell — related offerings in the same family */}
            {related.length > 0 && (
              <SectionCard
                title={`Cross-sell — more in ${o.offering_type} (${related.length})`}
                icon={Layers}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {related.map((r) => (
                    <Link
                      key={r.id}
                      href={`/offerings/${r.id}`}
                      className="group flex items-center gap-3 p-3 rounded-lg border border-border-light hover:border-blue-subtle hover:bg-blue-light/40 transition-colors"
                    >
                      <OfferingIcon name={r.offering_name} className="w-9 h-9 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] font-medium text-text-primary truncate group-hover:text-blue-primary">
                          {r.offering_name}
                        </span>
                        {r.current_availability && (
                          <span className="mt-1 inline-flex">
                            <AvailabilityPill value={r.current_availability} size="sm" />
                          </span>
                        )}
                      </span>
                      <ChevronRight
                        size={16}
                        strokeWidth={1.6}
                        className="text-text-tertiary group-hover:text-blue-primary shrink-0"
                      />
                    </Link>
                  ))}
                </div>
              </SectionCard>
            )}
          </div>

          {/* ---------------------------------------------------- SIDE rail */}
          <div className="space-y-5">
            {/* Internal owner — only when a real person is on file */}
            {ownerName && (
              <SectionCard title="Internal owner" icon={UserRound}>
                <div className="flex items-center gap-3">
                  <Avatar name={ownerName} className="w-10 h-10 text-[14px]" />
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-text-primary truncate">
                      {ownerName}
                    </p>
                    <p className="text-[12.5px] text-text-secondary truncate">
                      {ownerRole}
                    </p>
                  </div>
                </div>
              </SectionCard>
            )}

            {/* Category — its plain-English description + the family link */}
            {o.offeringCategory && (
              <SectionCard title="Category" icon={Layers}>
                <p className="text-[13.5px] font-semibold text-text-primary">
                  {o.offeringCategory.name}
                </p>
                {o.offeringCategory.description && (
                  <p className="text-[13px] text-text-secondary leading-relaxed mt-1.5">
                    {o.offeringCategory.description}
                  </p>
                )}
                {o.offeringCategory.owner && (
                  <p className="inline-flex items-center gap-1.5 text-[12.5px] text-text-secondary mt-2.5">
                    <UserRound
                      size={13}
                      strokeWidth={1.8}
                      className="text-text-tertiary"
                    />
                    Offering owner: {o.offeringCategory.owner}
                  </p>
                )}
                <Link
                  href={`/offerings?cat=${o.offeringCategory.id}`}
                  className="inline-flex items-center gap-1 text-[12px] font-semibold text-blue-primary hover:underline mt-3"
                >
                  See all in this category
                  <ChevronRight size={13} strokeWidth={2} />
                </Link>
              </SectionCard>
            )}

            {/* Target segments — customer types grouped by family */}
            <SectionCard title="Target segments" icon={Building2}>
              {o.customerTypes.length === 0 ? (
                admin ? (
                  <Link
                    href={`/offerings/${o.id}/edit`}
                    className="inline-flex items-center gap-1 text-[13px] text-blue-primary hover:underline"
                  >
                    <Plus size={13} strokeWidth={2} /> Add customer types
                  </Link>
                ) : (
                  <p className="text-[13px] text-text-tertiary">Not specified yet</p>
                )
              ) : (
                <div className="space-y-2.5">
                  {CT_FAMILIES.map((fam) => {
                    const types = o.customerTypes.filter((c) => c.family === fam);
                    if (types.length === 0) return null; // hide families that don't apply
                    const famColor = familyStyle(fam);
                    return (
                      // Each family is its own tidy block with a colour accent, and
                      // the sizes sit side-by-side — not a tall left-aligned stack
                      // (Suren: "I don't like how they're all stacked on the left").
                      <div
                        key={fam}
                        className="rounded-xl border border-border-light bg-surface/30 p-3"
                        style={{ borderLeft: `3px solid ${famColor}` }}
                      >
                        <p
                          className="text-[11px] font-semibold uppercase tracking-[0.05em] mb-2"
                          style={{ color: famColor }}
                        >
                          {fam}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {types.map((c) => (
                            <Tooltip
                              key={c.id}
                              label={`${c.product_type} · Revenue ${c.revenue} · ${c.employees} employees · ${c.operational_focus}`}
                              side="top"
                              align="left"
                            >
                              <Link
                                href={`/offerings?type=${c.id}`}
                                style={{
                                  background: sizeStyle(c.size).bg,
                                  color: sizeStyle(c.size).color,
                                }}
                                className="inline-flex items-center gap-1.5 text-[12px] font-semibold rounded-md px-2.5 py-1 transition-opacity hover:opacity-80"
                              >
                                <span
                                  className="w-1.5 h-1.5 rounded-full"
                                  style={{ background: sizeStyle(c.size).color }}
                                />
                                {c.size}
                              </Link>
                            </Tooltip>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </SectionCard>

            {/* Markets */}
            <SectionCard title={`Markets (${o.markets.length})`} icon={Globe}>
              {o.markets.length === 0 ? (
                admin ? (
                  <Link
                    href={`/offerings/${o.id}/edit`}
                    className="inline-flex items-center gap-1 text-[13px] text-blue-primary hover:underline"
                  >
                    <Plus size={13} strokeWidth={2} /> Add markets
                  </Link>
                ) : (
                  <p className="text-[13px] text-text-tertiary">Not specified yet</p>
                )
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {o.markets.map((m) => {
                    const st = marketStyle(m.name);
                    return (
                      <Link
                        key={m.id}
                        href={`/offerings?market=${m.id}`}
                        style={{ background: st.bg, color: st.color }}
                        className="inline-flex items-center gap-1.5 text-[12px] font-semibold rounded-md px-2.5 py-1 transition-opacity hover:opacity-80"
                      >
                        <span aria-hidden="true" className="text-[13px] leading-none">{marketFlag(m.name)}</span>
                        {m.name}
                      </Link>
                    );
                  })}
                </div>
              )}
            </SectionCard>

            {/* Current customers — who already uses it (from the revenue book) */}
            {report.customers.length > 0 && (
              <SectionCard
                title={`Current customers (${report.customers.length})`}
                icon={Building2}
              >
                <div className="space-y-2.5">
                  {report.customers.map((c) => (
                    <Link
                      key={c.id}
                      href={`/customers/${c.id}?tab=offerings`}
                      className="group flex items-center gap-2.5"
                    >
                      <CompanyLogo name={c.name} className="w-7 h-7 text-[10px] shrink-0" />
                      <span className="text-[13.5px] font-medium text-text-primary truncate group-hover:text-blue-primary">
                        {c.name}
                      </span>
                    </Link>
                  ))}
                </div>
              </SectionCard>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
