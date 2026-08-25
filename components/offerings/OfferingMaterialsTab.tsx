import { FolderOpen } from "lucide-react";
import { MaterialsSection } from "@/components/offerings/MaterialsSection";
import { MaterialTagGlossary } from "@/components/offerings/MaterialTagGlossary";
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
  workspaceAdmin = false,
  preferenceOwnerId,
}: {
  offering: Offering;
  /** May edit THIS offering: its owners, plus admins. */
  admin: boolean;
  /** A workspace admin, which is narrower. Renaming a folder is theirs alone
   *  (Saras, Aug 14, change log #38). */
  workspaceAdmin?: boolean;
  preferenceOwnerId?: string | null;
}) {
  return (
    <section className="mt-6">
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-light text-blue-primary">
          <FolderOpen size={16} strokeWidth={1.9} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[19px] font-semibold tracking-[-0.01em] text-text-primary">
            Sales Materials ({o.materials.length})
          </h2>
          <p className="mt-0.5 text-[13.5px] text-text-secondary">
            Seller-ready assets, ordered by the way they are typically used.
          </p>
        </div>
        {/* THE TAG GLOSSARY, top right (Saras, Aug 21, from the written rep
            feedback: "they're a bit confused about what the tags mean... I
            leave that up to your discretion, where you think it will be the
            easiest and most convenient for them"). Directly above the filters
            that use these words, and out of the way of anybody who already
            knows what they mean. */}
        <MaterialTagGlossary includeAgentOnly={admin} />
        {/* Only an owner can add — a control you cannot use should not look
            available. On an empty offering this is the only way in, so it sits
            in the header rather than inside the (absent) list. */}
      </div>
      <MaterialsSection
        materials={o.materials}
        offeringId={o.id}
        offeringName={o.offering_name}
        canEdit={admin}
        canRenameFolders={workspaceAdmin}
        materialFolders={o.materialFolders ?? []}
        offeringType={o.offering_type}
        ownerNames={(o.owners ?? [])
          .filter((owner) => owner.status === "owner")
          .map((owner) => owner.name)}
        preferenceOwnerId={preferenceOwnerId}
        action={
          admin ? (
            <AddMaterialButton
              key="add-material"
              offeringId={o.id}
              offeringName={o.offering_name}
              materials={o.materials}
              materialFolders={o.materialFolders ?? []}
              offeringType={o.offering_type}
              compact
            />
          ) : undefined
        }
      />
      {o.materials.length === 0 && !admin && (
        <p className="mt-3 pl-11 text-[12.5px] text-text-tertiary">
          The folder structure is ready. An owner of this offering adds the
          seller-ready files.
        </p>
      )}
    </section>
  );
}
