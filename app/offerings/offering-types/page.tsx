import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
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
      <Link
        href="/offerings"
        className="inline-flex items-center gap-1.5 text-[13px] text-text-secondary hover:text-blue-primary mb-4"
      >
        <ArrowLeft size={15} strokeWidth={1.8} /> All offerings
      </Link>
      <PageHeader
        title="Offering types"
        subtitle="The master list of offering types — what Freyr sells, each with a plain-English description. Offerings are grouped and filtered by these."
      />
      <OfferingTypesManager
        offeringTypes={offeringTypes}
        offeringCounts={offeringCounts}
        canEdit={await canManageOfferings()}
      />
    </div>
  );
}
