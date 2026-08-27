"use client";

import Link from "next/link";
import { ChevronRight, Package } from "lucide-react";
import { OfferingIcon } from "@/components/ui/OfferingIcon";
import { AvailabilityPill } from "@/components/ui/AvailabilityPill";
import { RelatedOfferingNote } from "@/components/offerings/RelatedOfferingNote";

/**
 * READ-ONLY HERE, EDITED IN THE EDIT PAGE (Anir, Aug 27: "it shouldn't be a
 * separate edit thing. When they press Edit at the top, that's where it
 * should be — a separate section under Sales Materials"). This renders what
 * the curated list produced; the curation itself is the Related offerings
 * section of the offering's edit form. The per-pair note keeps its inline
 * pencil, which he liked where it was.
 */
export type RelatedPill = {
  id: string;
  name: string;
  type?: string;
  availability?: string;
};

export function RelatedOfferingsSection({
  offeringId,
  related,
  notes,
  canEdit,
  heading,
}: {
  offeringId: string;
  related: RelatedPill[];
  notes: Record<string, string>;
  canEdit: boolean;
  heading: React.ReactNode;
}) {
  if (related.length === 0) return null;
  return (
    <section className="pt-7 border-t-2 border-border-light">
      {heading}
      {/* Floating pill cards, not hairline rows (Anir, Jul 28). */}
      <div className="mt-5 ml-11 grid grid-cols-1 gap-3 xl:grid-cols-2">
        {related.map((relatedOffering) => (
          <Link
            key={relatedOffering.id}
            href={`/offerings/${relatedOffering.id}`}
            className="group flex min-h-[92px] flex-col justify-center gap-2 rounded-2xl border border-border-light bg-white px-4 py-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all duration-150 hover:-translate-y-0.5 hover:border-blue-subtle hover:shadow-[0_6px_18px_rgba(16,24,40,0.08)]"
          >
            <span className="flex items-center gap-3">
              <OfferingIcon name={relatedOffering.name} className="h-9 w-9 shrink-0" />
              {/* The full name, always: default wrap breaks at spaces. */}
              <span className="min-w-0 flex-1 text-[13.5px] font-semibold leading-snug text-text-primary group-hover:text-blue-primary">
                {relatedOffering.name}
              </span>
              <ChevronRight size={15} strokeWidth={1.7} className="shrink-0 text-text-tertiary transition-transform group-hover:translate-x-0.5 group-hover:text-blue-primary" />
            </span>
            <span className="flex flex-wrap items-center gap-1">
              {relatedOffering.type && (
                <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-blue-light px-1.5 py-0.5 text-[10px] font-semibold text-blue-primary">
                  <Package size={10} strokeWidth={2.3} aria-hidden="true" />
                  {relatedOffering.type}
                </span>
              )}
              <AvailabilityPill value={relatedOffering.availability} size="sm" />
            </span>
            {/* How the two actually relate, written by someone who knows
                (Anir, Aug 25). */}
            <RelatedOfferingNote
              offeringId={offeringId}
              relatedId={relatedOffering.id}
              relatedName={relatedOffering.name}
              notes={notes}
              canEdit={canEdit}
            />
          </Link>
        ))}
      </div>
    </section>
  );
}
