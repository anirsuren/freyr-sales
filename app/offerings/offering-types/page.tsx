import { ArrowLeft } from "lucide-react";
import { SmartBack } from "@/components/ui/BackButton";
import { OfferingTypesManager } from "@/components/offerings/OfferingTypesManager";
import { listOfferingTypes, listOfferings } from "@/lib/offerings";
import { canManageOfferings } from "@/lib/role";

export const dynamic = "force-dynamic";
export const metadata = { title: "Offering types" };

export default async function OfferingTypesPage() {
  const offeringTypes = listOfferingTypes();
  // How many offerings use each type — offerings store the type as a string, so
  // match by name → the type's id, to link "the offerings of this type".
  const byName: Record<string, string> = {};
  for (const t of offeringTypes) byName[t.name] = t.id;
  const offeringCounts: Record<string, number> = {};
  for (const o of listOfferings()) {
    const id = byName[o.offering_type];
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
      <OfferingTypesManager
        offeringTypes={offeringTypes}
        offeringCounts={offeringCounts}
        canEdit={await canManageOfferings()}
      />
    </div>
  );
}
