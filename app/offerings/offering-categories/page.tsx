import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { OfferingCategoriesManager } from "@/components/offerings/OfferingCategoriesManager";
import { listOfferingCategories, listOfferings } from "@/lib/offerings";
import { canManageOfferings } from "@/lib/role";

export const dynamic = "force-dynamic";
export const metadata = { title: "Offering categories" };

export default async function OfferingCategoriesPage() {
  const offeringCategories = listOfferingCategories();
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
      <Link
        href="/offerings"
        className="inline-flex items-center gap-1.5 text-[13px] text-text-secondary hover:text-blue-primary mb-4"
      >
        <ArrowLeft size={15} strokeWidth={1.8} /> All offerings
      </Link>
      <PageHeader
        title="Offering categories"
        subtitle="The master list of offering categories — each groups related offerings and has an owner. Offerings are grouped and filtered by these."
      />
      <OfferingCategoriesManager
        offeringCategories={offeringCategories}
        offeringCounts={offeringCounts}
        canEdit={await canManageOfferings()}
      />
    </div>
  );
}
