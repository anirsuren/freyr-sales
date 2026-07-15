import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Pencil,
  Plus,
  ChevronRight,
  UserRound,
  Layers,
  Building2,
  Globe,
} from "lucide-react";
import { AvailabilityPill } from "@/components/ui/AvailabilityPill";
import { SectionCard } from "@/components/ui/SectionCard";
import { Tooltip } from "@/components/ui/Tooltip";
import { Avatar } from "@/components/ui/Avatar";
import { RecordView } from "@/components/RecordView";
import { DuplicateButton } from "@/components/offerings/DuplicateButton";
import { OfferingOverviewMain } from "@/components/offerings/OfferingOverviewMain";
import { OfferingReports } from "@/components/offerings/OfferingReports";
import { OfferingActions } from "@/components/offerings/OfferingActions";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { OfferingIcon } from "@/components/ui/OfferingIcon";
import { canManageOfferings } from "@/lib/role";
import { getDataMode } from "@/lib/dataMode";
import { isOfferingsOnly } from "@/lib/release";
import { getDb } from "@/lib/db";
import { reportForOffering } from "@/lib/revenue";
import { cn } from "@/lib/utils";
import { getOffering, hydrateOffering, listOfferings } from "@/lib/offerings";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const o = getOffering((await params).id);
  return { title: o ? `${o.offering_name} · Offerings` : "Offering" };
}

const CT_FAMILIES = ["Pharmaceutical", "Biologics", "Bio Pharmaceutical"];

export default async function OfferingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ tab?: string }>;
}) {
  const query = await searchParams;
  const raw = getOffering((await params).id);
  if (!raw) notFound();
  const o = hydrateOffering(raw);

  const tab = query?.tab === "reports" ? "reports" : "overview";
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
  const admin = await canManageOfferings();
  const commercialActionsEnabled = !isOfferingsOnly(getDataMode());

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
            commercialActionsEnabled={commercialActionsEnabled}
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
          <OfferingOverviewMain
            offering={o}
            report={report}
            related={related}
            admin={admin}
          />
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
                    <Avatar name={o.offeringCategory.owner} className="h-6 w-6 text-[8px]" />
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
