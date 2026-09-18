"use client";

import { ExternalLink } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import {
  ACCESS_LEVEL_META,
  JOURNEY_STAGE_META,
  MATERIAL_FORMAT_META,
  materialFormat,
  materialJourneyStages,
  type OfferingMaterial,
} from "@/lib/offeringMaterials";
import { tint } from "@/lib/tint";
import { cn } from "@/lib/utils";

export function LinkMaterialPreview({
  material,
  offeringName,
  compact = false,
}: {
  material: OfferingMaterial;
  offeringName?: string;
  compact?: boolean;
}) {
  const format = MATERIAL_FORMAT_META[materialFormat(material.kind)];
  const FormatIcon = format.icon;
  const stages = materialJourneyStages(material);
  const access = material.accessLevel ? ACCESS_LEVEL_META[material.accessLevel] : null;

  return (
    <div className={cn("h-full overflow-auto bg-[#edf2f8]", compact ? "p-3" : "p-6 sm:p-8")}>
      <article className={cn("mx-auto min-h-full bg-white shadow-[0_8px_30px_rgba(16,24,40,0.12)]", compact ? "max-w-[510px] p-6" : "max-w-[820px] p-10 sm:p-14")}>
        <header className="border-b-2 border-blue-primary pb-5">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-primary">
            <FormatIcon size={15} strokeWidth={2.1} aria-hidden="true" />
            {offeringName ? `${offeringName} · ` : ""}{format.label}
          </div>
          <h2 className={cn("mt-4 font-semibold leading-tight text-text-primary", compact ? "text-[19px]" : "text-[28px]")}>
            {material.label}
          </h2>
          {material.description ? (
            <p className={cn("mt-3 max-w-3xl leading-relaxed text-text-secondary", compact ? "text-[12.5px]" : "text-[15px]")}>
              {material.description}
            </p>
          ) : null}
        </header>

        <div className={cn("grid gap-5", compact ? "mt-5" : "mt-8 sm:grid-cols-2")}>
          <section>
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-text-tertiary">Material details</p>
            <dl className="mt-3 space-y-2 text-[12px]">
              <div className="flex items-center justify-between gap-4"><dt className="text-text-tertiary">Format</dt><dd className="font-semibold text-text-primary">{format.label}</dd></div>
              <div className="flex items-center justify-between gap-4"><dt className="text-text-tertiary">Buyer stage</dt><dd className="flex flex-wrap justify-end gap-1">{stages.length ? stages.map((stage) => { const meta = JOURNEY_STAGE_META[stage]; return <span key={stage} className="rounded-full px-2 py-0.5 font-semibold" style={{ color: meta.color, background: tint(meta.color, 8) }}>{meta.short}</span>; }) : <span className="font-semibold text-text-primary">Not recorded</span>}</dd></div>
              <div className="flex items-center justify-between gap-4"><dt className="text-text-tertiary">Access</dt><dd>{access ? <span className="rounded-full px-2 py-0.5 font-semibold" style={{ color: access.color, background: tint(access.color, 8) }}>{access.short}</span> : <span className="font-semibold text-text-primary">Not recorded</span>}</dd></div>
            </dl>
          </section>
          <section className={cn(compact && "hidden")}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-text-tertiary">About this preview</p>
            <p className="mt-3 text-[13px] leading-6 text-text-secondary">
              This catalogue entry does not include uploaded file bytes. The material details remain available here, and the source can be opened separately.
            </p>
          </section>
        </div>
      </article>
    </div>
  );
}

export function LinkMaterialViewer({
  material,
  offeringName,
  onClose,
}: {
  material: OfferingMaterial;
  offeringName?: string;
  onClose: () => void;
}) {
  return (
    <Modal
      open
      onClose={onClose}
      title={material.label}
      size="viewer"
      actions={
        <a
          href={material.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border-light px-3 text-[12px] font-semibold text-text-secondary transition-colors hover:border-blue-subtle hover:bg-blue-light hover:text-blue-primary"
        >
          Open source
          <ExternalLink size={13} strokeWidth={2.1} aria-hidden="true" />
        </a>
      }
    >
      <div className="h-[min(72vh,760px)] overflow-hidden">
        <LinkMaterialPreview material={material} offeringName={offeringName} />
      </div>
    </Modal>
  );
}
