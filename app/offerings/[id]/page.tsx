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
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Tooltip } from "@/components/ui/Tooltip";
import { RecordView } from "@/components/RecordView";
import { DuplicateButton } from "@/components/offerings/DuplicateButton";
import { OfferingReports } from "@/components/offerings/OfferingReports";
import { isAdmin } from "@/lib/role";
import { getDb } from "@/lib/db";
import { reportForOffering } from "@/lib/revenue";
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
};
const KIND_ORDER: MaterialKind[] = [
  "video",
  "presentation",
  "whitepaper",
  "pricing",
  "case_study",
  "reference",
  "competition",
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

  // Reports tab (Suren, Jul 5): revenue for THIS offering cumulated across
  // every customer using it — the offering owner's view.
  const tab = searchParams?.tab === "reports" ? "reports" : "overview";
  const report = reportForOffering(await getDb().customers.list(), o.id);

  // Sibling offerings of the same type — Suren's catalog is variant-heavy, so a
  // quick way to compare the family (e.g. the Freya Register stack) is useful.
  const related = raw.offering_type
    ? listOfferings().filter(
        (x) => x.id !== raw.id && x.offering_type === raw.offering_type
      )
    : [];

  // At-a-glance mapping status, mirroring the list cards so an incomplete
  // offering is obvious the moment you open it (feeds Suren's "still to map"
  // worklist).
  const isMapped =
    o.customerTypes.length > 0 ||
    o.markets.length > 0 ||
    o.materials.length > 0;
  const admin = isAdmin();

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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            {o.offering_category && (
              <Link
                href={`/offerings?cat=${o.offeringCategory?.id ?? ""}`}
                className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-text-secondary bg-surface border border-border-light rounded-md px-2 py-1 hover:border-blue-subtle hover:text-blue-primary transition-colors"
              >
                <Layers size={11} strokeWidth={2} />
                {o.offering_category}
              </Link>
            )}
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-blue-primary bg-blue-light rounded-md px-2 py-1">
              <Sparkles size={11} strokeWidth={2} />
              {o.offering_type || "Offering"}
            </span>
            {!isMapped && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-text-tertiary bg-surface border border-border-light rounded-md px-2 py-1">
                <span className="w-1.5 h-1.5 rounded-full border border-text-tertiary" />
                Awaiting details
              </span>
            )}
          </div>
          <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-text-primary">
            {o.offering_name}
          </h1>
          {o.offering_description ? (
            <p className="text-[14px] text-text-secondary mt-2 max-w-[680px] leading-relaxed whitespace-pre-line">
              {o.offering_description}
            </p>
          ) : o.offeringType?.description ? (
            // Until the per-offering description is written from sales materials,
            // show the offering type's description for context (Suren's sheet).
            // Label it so it reads as the type's shared description, not this
            // offering's own — otherwise the generic text looks offering-specific.
            <div className="mt-2 max-w-[680px]">
              <p className="text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary mb-1">
                About {o.offering_type}
              </p>
              <p className="text-[14px] text-text-secondary leading-relaxed">
                {o.offeringType.description}
              </p>
            </div>
          ) : null}
        </div>
        {admin && (
        <div className="shrink-0 flex items-center gap-2">
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
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold rounded-md px-4 py-2 bg-white border border-border text-text-primary hover:bg-surface transition-colors"
          >
            <Pencil size={14} strokeWidth={1.8} /> Edit offering
          </Link>
        </div>
        )}
      </div>

      {/* Availability + comments */}
      <div className="flex flex-wrap gap-2 mt-4">
        {o.current_availability && (
          <span
            className={`text-[12px] font-medium rounded-md px-2.5 py-1 ${
              /current|now|available/i.test(o.current_availability)
                ? "text-success bg-success/10"
                : "text-warning bg-warning/10"
            }`}
          >
            {o.current_availability}
          </span>
        )}
        {o.future_availability && o.future_availability.length <= 40 && (
          <span className="text-[12px] font-medium text-text-secondary bg-surface border border-border-light rounded-md px-2.5 py-1">
            {o.future_availability}
          </span>
        )}
        {o.poc && (
          <span className="inline-flex items-center gap-1 text-[12px] font-medium text-text-secondary bg-surface border border-border-light rounded-md px-2.5 py-1">
            <UserRound size={12} strokeWidth={1.8} className="text-text-tertiary" />
            POC: {o.poc}
          </span>
        )}
      </div>
      {o.future_availability && o.future_availability.length > 40 && (
        <p className="text-[12px] text-text-secondary mt-2 max-w-[680px] leading-relaxed">
          <span className="font-medium text-text-tertiary">Availability — </span>
          {o.future_availability}
        </p>
      )}

      {/* Overview | Reports (Suren's "I need a reports tab in offering") */}
      <div
        role="tablist"
        aria-label="Offering sections"
        className="flex gap-8 border-b border-border-light mt-6 mb-2"
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
        <>

      {/* Offering category — its plain-English description + the offering owner
          (Suren's Jun 27 grouping). The category is a first-class object: this
          links out to everything in the same category. */}
      {o.offeringCategory &&
        (o.offeringCategory.description || o.offeringCategory.owner) && (
          <Card className="mt-5">
            <div className="flex items-start justify-between gap-3">
              <h2 className="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                <Layers size={13} strokeWidth={2} className="text-blue-primary" />
                {o.offeringCategory.name}
              </h2>
              <Link
                href={`/offerings?cat=${o.offeringCategory.id}`}
                className="inline-flex items-center gap-1 text-[12px] font-semibold text-blue-primary hover:underline shrink-0"
              >
                See all in this category
                <ChevronRight size={13} strokeWidth={2} />
              </Link>
            </div>
            {o.offeringCategory.description && (
              <p className="text-[13.5px] text-text-secondary leading-relaxed max-w-[680px] mt-2">
                {o.offeringCategory.description}
              </p>
            )}
            {o.offeringCategory.owner && (
              <p className="inline-flex items-center gap-1.5 text-[12.5px] text-text-secondary mt-3">
                <UserRound size={13} strokeWidth={1.8} className="text-text-tertiary" />
                Offering owner: {o.offeringCategory.owner}
              </p>
            )}
          </Card>
        )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6 items-start">
        {/* Customer types */}
        <Card>
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-3">
            Applicable customer types ({o.customerTypes.length})
          </h2>
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
            <div className="space-y-3">
              {CT_FAMILIES.map((fam) => {
                const types = o.customerTypes.filter((c) => c.family === fam);
                if (types.length === 0) return null;
                return (
                  <div key={fam}>
                    <p className="text-[10.5px] font-semibold uppercase tracking-[0.04em] text-text-tertiary mb-1.5">
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
                            className="inline-block text-[12px] font-medium text-text-primary bg-surface border border-border-light rounded-md px-2 py-1 transition-colors hover:border-blue-subtle hover:text-blue-primary"
                          >
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
        </Card>

        {/* Markets */}
        <Card>
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-3">
            Applicable markets ({o.markets.length})
          </h2>
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
              {o.markets.map((m) => (
                <Link
                  key={m.id}
                  href={`/offerings?market=${m.id}`}
                  className="inline-block text-[12px] font-medium text-text-primary bg-surface border border-border-light rounded-md px-2 py-1 transition-colors hover:border-blue-subtle hover:text-blue-primary"
                >
                  {m.name}
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Sales materials */}
      <Card className="mt-4">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-3">
          Sales materials ({o.materials.length})
        </h2>
        {o.materials.length === 0 ? (
          admin ? (
            <Link
              href={`/offerings/${o.id}/edit`}
              className="inline-flex items-center gap-1 text-[13px] text-blue-primary hover:underline"
            >
              <Plus size={13} strokeWidth={2} /> Add videos, presentations, white
              papers or pricing
            </Link>
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
      </Card>

      {/* Related offerings (same type) */}
      {related.length > 0 && (
        <Card className="mt-4">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-3">
            More in {o.offering_type} ({related.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {related.map((r) => (
              <Link
                key={r.id}
                href={`/offerings/${r.id}`}
                className="group flex items-center justify-between gap-2 p-3 rounded-lg border border-border-light hover:border-blue-subtle hover:bg-blue-light/40 transition-colors"
              >
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-medium text-text-primary truncate group-hover:text-blue-primary">
                    {r.offering_name}
                  </span>
                  {r.current_availability && (
                    <span className="block text-[11px] text-text-tertiary">
                      {r.current_availability}
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
        </Card>
      )}
        </>
      )}
    </div>
  );
}
