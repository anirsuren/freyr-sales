import { FolderOpen } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { AllMaterialsBrowser } from "@/components/offerings/AllMaterialsBrowser";
import { redactOfferingsForCurrentUser } from "@/lib/materialAccess";
import { hydrateOffering, listOfferings } from "@/lib/offerings";
import { getCurrentUser } from "@/lib/currentUser";
import { MaterialTagGlossary } from "@/components/offerings/MaterialTagGlossary";

export const metadata = { title: "Sales Materials" };
export const dynamic = "force-dynamic";

/**
 * EVERY SALES MATERIAL, IN ONE PLACE.
 *
 * The reps' most repeated ask in the feedback form, read out by Saras on the
 * Aug 21 call: "currently we can only access any sales material if we go to
 * Offerings, then click a specific offering, then go to the Sales Materials
 * tab. Is there a shorter way to reach the sales materials, and what if we
 * want to see materials for three or four offerings at once?"
 *
 * Anir's answer on that call is what this is: "I'll just have it within
 * Offerings as a subpage. You click Offerings, and then it'll show a subpage
 * on the sidebar — Sales Materials — and they can see all the materials
 * there." Nothing is moved: each offering keeps its own tab, and this is a
 * second door onto the same files.
 *
 * Redaction runs first and unchanged, so an AI-training file reaches this page
 * only for the offering's own owner or an app admin, exactly as it does
 * everywhere else.
 */
export default async function AllSalesMaterialsPage() {
  const me = await getCurrentUser();
  const offerings = await redactOfferingsForCurrentUser(
    listOfferings().map(hydrateOffering)
  );

  const rows = offerings.flatMap((offering) =>
    (offering.materials ?? []).map((material) => ({
      material,
      offeringId: offering.id,
      offeringName: offering.offering_name,
      offeringCategory: offering.offering_category,
      ownerNames: (offering.owners ?? [])
        .filter((owner) => owner.status === "owner")
        .map((owner) => owner.name),
    }))
  );

  return (
    <div>
      <PageHeader
        title="Sales Materials"
        subtitle={`Every file across every offering — ${rows.length} in all.`}
        action={<MaterialTagGlossary includeAgentOnly={me.role === "admin"} />}
      />
      {rows.length === 0 ? (
        <div className="mt-6 flex items-center gap-3 rounded-xl border border-border-light bg-white px-4 py-8 text-text-secondary">
          <FolderOpen size={18} strokeWidth={1.9} className="text-text-tertiary" />
          <p className="text-[13.5px]">
            No sales materials have been uploaded yet. They appear here as soon
            as an offering owner adds one.
          </p>
        </div>
      ) : (
        <AllMaterialsBrowser rows={rows} isAdmin={me.role === "admin"} />
      )}
    </div>
  );
}
