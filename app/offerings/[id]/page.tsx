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
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Tooltip } from "@/components/ui/Tooltip";
import {
  getOffering,
  hydrateOffering,
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

  return (
    <div className="max-w-[900px]">
      <Link
        href="/offerings"
        className="inline-flex items-center gap-1.5 text-[13px] text-text-secondary hover:text-blue-primary mb-4"
      >
        <ArrowLeft size={15} strokeWidth={1.8} /> All offerings
      </Link>

      <div className="flex items-center gap-2 mb-1">
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.05em] text-blue-primary bg-blue-light rounded px-1.5 py-0.5">
          <Sparkles size={11} strokeWidth={2} />
          {o.offering_type || "Offering"}
        </span>
      </div>
      <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-text-primary">
        {o.offering_name}
      </h1>
      {o.offering_description && (
        <p className="text-[14px] text-text-secondary mt-2 max-w-[680px]">
          {o.offering_description}
        </p>
      )}

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
            <p className="text-[13px] text-text-secondary">None selected.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {o.customerTypes.map((c) => (
                <Tooltip
                  key={c.id}
                  label={`${c.product_type} · Revenue ${c.revenue} · ${c.employees} employees · ${c.operational_focus}`}
                  side="top"
                  align="left"
                >
                  <span className="text-[12px] font-medium text-text-primary bg-surface border border-border-light rounded-md px-2 py-1 cursor-help">
                    {c.name}
                  </span>
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
            <p className="text-[13px] text-text-secondary">None selected.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {o.markets.map((m) => (
                <span
                  key={m.id}
                  className="text-[12px] font-medium text-text-primary bg-surface border border-border-light rounded-md px-2 py-1"
                >
                  {m.name}
                </span>
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
          <p className="text-[13px] text-text-secondary">
            No sales materials added yet.
          </p>
        ) : (
          <div className="space-y-4">
            {KIND_ORDER.map((kind) => {
              const items = o.materials.filter((m) => m.kind === kind);
              if (items.length === 0) return null;
              const Icon = MATERIAL_ICON[kind];
              return (
                <div key={kind}>
                  <p className="flex items-center gap-1.5 text-[12px] font-semibold text-text-secondary mb-1.5">
                    <Icon size={14} strokeWidth={1.8} />
                    {MATERIAL_META[kind].plural}
                  </p>
                  <ul className="space-y-1">
                    {items.map((m) => (
                      <li key={m.id}>
                        <a
                          href={m.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-[13.5px] text-blue-primary hover:underline"
                        >
                          {m.label}
                          <ExternalLink size={13} strokeWidth={1.7} />
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
