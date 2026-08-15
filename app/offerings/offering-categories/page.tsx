import { ArrowLeft } from "lucide-react";
import { SmartBack } from "@/components/ui/BackButton";
import { OfferingCategoriesManager } from "@/components/offerings/OfferingCategoriesManager";
import { listOfferingCategories, listOfferings } from "@/lib/offerings";
import { canManageOfferings } from "@/lib/role";
import { listAssignablePeople } from "@/lib/assignablePeople";

export const dynamic = "force-dynamic";
export const metadata = { title: "Offering categories" };

export default async function OfferingCategoriesPage() {
  const offeringCategories = listOfferingCategories();
  // The owner picker offers colleagues with accounts, not a free-text box
  // (Anir, Aug 15: "add the owner dropdown, like you do normally").
  const assignable = await listAssignablePeople();
  // How many offerings sit in each category — offerings store the category as a
  // string, so match by name → the category's id.
  const byName: Record<string, string> = {};
  for (const c of offeringCategories) byName[c.name] = c.id;
  const offeringCounts: Record<string, number> = {};
  for (const o of listOfferings()) {
    const id = byName[o.offering_category];
    if (id) offeringCounts[id] = (offeringCounts[id] || 0) + 1;
  }

  return (
    <div>
      <SmartBack
        fallback="/offerings"
        className="inline-flex cursor-pointer items-center gap-1.5 text-[13px] text-text-secondary hover:text-blue-primary mb-4"
      >
        <ArrowLeft size={15} strokeWidth={1.8} /> All offerings
      </SmartBack>
      <OfferingCategoriesManager
        offeringCategories={offeringCategories}
        offeringCounts={offeringCounts}
        canEdit={await canManageOfferings()}
        people={assignable.map((p) => p.name)}
        peopleRoles={Object.fromEntries(
          assignable.filter((p) => p.role).map((p) => [p.name, p.role as string])
        )}
      />
    </div>
  );
}
