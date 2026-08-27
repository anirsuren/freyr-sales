"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Layers, Package } from "lucide-react";
import { OfferingIcon } from "@/components/ui/OfferingIcon";
import { AvailabilityPill } from "@/components/ui/AvailabilityPill";
import { RelatedOfferingNote } from "@/components/offerings/RelatedOfferingNote";
import {
  RelatedOfferingAdd,
  RelatedOfferingRemove,
  RelatedOfferingsEditButton,
  useRelatedListEdits,
} from "@/components/offerings/RelatedOfferingsManager";

/**
 * THE RELATED SECTION, NOW A CLIENT ISLAND, because it needs one bit of
 * state the server render cannot hold: whether the editor is managing the
 * list (Saras via Anir, Aug 27: "making the related offering section
 * editable"). Reading stays exactly what it was — same pills, same note —
 * and the manage affordances only mount for someone who can edit.
 */
export type RelatedPill = {
  id: string;
  name: string;
  type?: string;
  availability?: string;
};

export function RelatedOfferingsSection({
  offeringId,
  category,
  related,
  relatedAdd,
  relatedHide,
  allOfferings,
  notes,
  canEdit,
  heading,
}: {
  offeringId: string;
  category: string;
  related: RelatedPill[];
  relatedAdd: string[];
  relatedHide: string[];
  allOfferings: { id: string; name: string; category?: string }[];
  notes: Record<string, string>;
  canEdit: boolean;
  /** The SectionHeading, rendered by the server parent so it stays the
   *  single source of that pattern. */
  heading: React.ReactNode;
}) {
  const [managing, setManaging] = useState(false);
  const edits = useRelatedListEdits({ offeringId, relatedAdd, relatedHide });
  const shown = new Set(related.map((r) => r.id));
  const addable = allOfferings.filter((o) => !shown.has(o.id));

  /* Nothing related and nobody who could change that: the section stays off
     the page, exactly as before. An EDITOR sees it even empty, or the only
     way to start the list would be to already have one. */
  if (related.length === 0 && !canEdit) return null;

  return (
    <section className="pt-7 border-t-2 border-border-light">
      <div className="flex flex-wrap items-start justify-between gap-3">
        {heading}
        {canEdit && (
          <RelatedOfferingsEditButton
            managing={managing}
            onToggle={() => setManaging((v) => !v)}
          />
        )}
      </div>
      {/* Floating pill cards, not hairline rows (Anir, Jul 28: "make it look
          better, like pill-like floating pills"). */}
      <div className="mt-5 ml-11 grid grid-cols-1 gap-3 xl:grid-cols-2">
        {related.map((relatedOffering) => (
          <span key={relatedOffering.id} className="relative">
            {managing && (
              <RelatedOfferingRemove
                busy={edits.busy}
                name={relatedOffering.name}
                onRemove={() => edits.remove(relatedOffering.id, relatedOffering.name)}
              />
            )}
            <Link
              href={`/offerings/${relatedOffering.id}`}
              className="group flex min-h-[92px] flex-col justify-center gap-2 rounded-2xl border border-border-light bg-white px-4 py-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all duration-150 hover:-translate-y-0.5 hover:border-blue-subtle hover:shadow-[0_6px_18px_rgba(16,24,40,0.08)]"
            >
              <span className="flex items-center gap-3">
                <OfferingIcon name={relatedOffering.name} className="h-9 w-9 shrink-0" />
                {/* The full name, always: default wrap breaks at spaces, so a
                    long product code runs to a second line intact. */}
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
                  (Anir, Aug 25). Sharing a category is not a reason to sell
                  them together; this line is. */}
              <RelatedOfferingNote
                offeringId={offeringId}
                relatedId={relatedOffering.id}
                relatedName={relatedOffering.name}
                notes={notes}
                canEdit={canEdit}
              />
            </Link>
          </span>
        ))}
        {managing && (
          <RelatedOfferingAdd
            busy={edits.busy}
            options={addable}
            onAdd={(id) => {
              const hit = addable.find((o) => o.id === id);
              if (hit) edits.add(hit.id, hit.name);
            }}
          />
        )}
        {related.length === 0 && !managing && (
          <p className="col-span-full rounded-2xl border border-dashed border-border-light bg-white/60 px-4 py-6 text-center text-[12.5px] text-text-tertiary">
            Nothing related yet. {category ? `No other offering shares the ${category} category.` : ""} Press
            &ldquo;Edit this list&rdquo; to add one.
          </p>
        )}
      </div>
    </section>
  );
}
