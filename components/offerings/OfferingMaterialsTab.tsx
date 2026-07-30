import { FolderOpen } from "lucide-react";
import { MaterialsSection } from "@/components/offerings/MaterialsSection";
import { AddMaterialButton } from "@/components/offerings/AddMaterialButton";
import type { Offering } from "@/lib/offerings";

/**
 * SALES MATERIALS AS A DESTINATION, NOT A SCROLL.
 *
 * Suren, Jul 30 (10:08): "the heavy traffic item, I don't want to be a scroll
 * function… I have another tab called sales materials. In that, because right
 * there at the top, let them create on sales material, look at sales materials.
 * I don't want them to scroll down and do some things there."
 *
 * Same block as before, lifted out of the overview so it owns a tab. The
 * overview keeps the brief, the segments and the related offerings — the things
 * you read once — and the files people open twenty times a day get their own
 * front door.
 */
export function OfferingMaterialsTab({
  offering: o,
  admin,
}: {
  offering: Offering;
  admin: boolean;
}) {
  return (
    <section className="mt-6">
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-light text-blue-primary">
          <FolderOpen size={16} strokeWidth={1.9} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[19px] font-semibold tracking-[-0.01em] text-text-primary">
            Sales materials ({o.materials.length})
          </h2>
          <p className="mt-0.5 text-[13.5px] text-text-secondary">
            Seller-ready assets, ordered by the way they are typically used.
          </p>
        </div>
        {/* Only an owner can add — a control you cannot use should not look
            available. On an empty offering this is the only way in, so it sits
            in the header rather than inside the (absent) list. */}
        {admin && o.materials.length === 0 && (
          <AddMaterialButton offeringId={o.id} materials={o.materials} />
        )}
      </div>

      {o.materials.length === 0 ? (
        admin ? (
          <p className="mt-5 pl-11 text-[13px] text-text-tertiary">
            No sales materials yet. Add the decks, one-pagers, demos and
            anything else a rep hands a customer.
          </p>
        ) : (
          <div className="mt-5 pl-11">
            <p className="text-[13px] text-text-secondary">
              No sales materials yet. Only an owner of this offering can add
              them, so its content stays with the person accountable for it.
            </p>
            <p className="mt-1 text-[12.5px] text-text-tertiary">
              If these are yours to upload, use{" "}
              <span className="font-semibold text-text-secondary">
                Ask to own this
              </span>{" "}
              in &ldquo;Who can edit this&rdquo; on the Overview tab, and an
              admin hands it over.
            </p>
          </div>
        )
      ) : (
        <MaterialsSection
          materials={o.materials}
          offeringId={o.id}
          canEdit={admin}
          materialFolders={o.materialFolders ?? []}
          action={
            admin ? (
              <AddMaterialButton
                key="add-material"
                offeringId={o.id}
                materials={o.materials}
                compact
              />
            ) : undefined
          }
        />
      )}
    </section>
  );
}
