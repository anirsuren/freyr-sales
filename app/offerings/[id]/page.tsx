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
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Tooltip } from "@/components/ui/Tooltip";
import {
  getOffering,
  hydrateOffering,
  listOfferings,
  MATERIAL_META,
  type MaterialKind,
} from "@/lib/offerings";

export const dynamic = "force-dynamic";

const MATERIAL_ICON: Record<MaterialKind, typeof Video> = {
  video: Video,
  presentation: Presentation,
  whitepaper: FileText,
  pricing: DollarSign,
};
const KIND_ORDER: MaterialKind[] = ["video", "presentation", "whitepaper", "pricing"];

export default function OfferingDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const raw = getOffering(params.id);
  if (!raw) notFound();
  const o = hydrateOffering(raw);

  // Sibling offerings of the same type — Suren's catalog is variant-heavy, so a
  // quick way to compare the family (e.g. the Freya Register stack) is useful.
  const related = raw.offering_type
    ? listOfferings().filter(
        (x) => x.id !== raw.id && x.offering_type === raw.offering_type
      )
    : [];

  return (
    <div className="max-w-[900px]">
      <Link
        href="/offerings"
        className="inline-flex items-center gap-1.5 text-[13px] text-text-secondary hover:text-blue-primary mb-4"
      >
        <ArrowLeft size={15} strokeWidth={1.8} /> All offerings
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-blue-primary bg-blue-light rounded-md px-2 py-1">
              <Sparkles size={11} strokeWidth={2} />
              {o.offering_type || "Offering"}
            </span>
          </div>
          <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-text-primary">
            {o.offering_name}
          </h1>
          {o.offering_description && (
            <p className="text-[14px] text-text-secondary mt-2 max-w-[680px] leading-relaxed">
              {o.offering_description}
            </p>
          )}
        </div>
        <Link
          href={`/offerings/${o.id}/edit`}
          className="shrink-0 inline-flex items-center gap-1.5 text-[13px] font-semibold rounded-md px-4 py-2 bg-white border border-border text-text-primary hover:bg-surface transition-colors"
        >
          <Pencil size={14} strokeWidth={1.8} /> Edit offering
        </Link>
      </div>

      {/* Availability */}
      <div className="flex flex-wrap gap-2 mt-4">
        {o.current_availability && (
          <span className="text-[12px] font-medium text-success bg-success/10 rounded-md px-2.5 py-1">
            Now: {o.current_availability}
          </span>
        )}
        {o.future_availability && (
          <span className="text-[12px] font-medium text-warning bg-warning/10 rounded-md px-2.5 py-1">
            Future: {o.future_availability}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        {/* Customer types */}
        <Card>
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-3">
            Applicable customer types ({o.customerTypes.length})
          </h2>
          {o.customerTypes.length === 0 ? (
            <Link
              href={`/offerings/${o.id}/edit`}
              className="inline-flex items-center gap-1 text-[13px] text-blue-primary hover:underline"
            >
              <Plus size={13} strokeWidth={2} /> Add customer types
            </Link>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {o.customerTypes.map((c) => (
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
                    {c.name}
                  </Link>
                </Tooltip>
              ))}
            </div>
          )}
        </Card>

        {/* Markets */}
        <Card>
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-3">
            Applicable markets ({o.markets.length})
          </h2>
          {o.markets.length === 0 ? (
            <Link
              href={`/offerings/${o.id}/edit`}
              className="inline-flex items-center gap-1 text-[13px] text-blue-primary hover:underline"
            >
              <Plus size={13} strokeWidth={2} /> Add markets
            </Link>
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
          <Link
            href={`/offerings/${o.id}/edit`}
            className="inline-flex items-center gap-1 text-[13px] text-blue-primary hover:underline"
          >
            <Plus size={13} strokeWidth={2} /> Add videos, presentations, white
            papers or pricing
          </Link>
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
    </div>
  );
}
