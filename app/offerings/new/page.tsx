import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { OfferingForm } from "@/components/offerings/OfferingForm";
import { isAdmin } from "@/lib/role";
import { ViewOnlyNotice } from "@/components/offerings/ViewOnlyNotice";
import {
  listCustomerTypes,
  listMarkets,
  listOfferings,
  listOfferingTypes,
} from "@/lib/offerings";

// Suggest from the managed master list first, plus any type strings already on
// offerings (in case one isn't in the master list yet).
function distinctTypes() {
  return Array.from(
    new Set([
      ...listOfferingTypes().map((t) => t.name),
      ...listOfferings().map((o) => o.offering_type).filter(Boolean),
    ])
  );
}

export const dynamic = "force-dynamic";
export const metadata = { title: "New offering" };

export default function NewOfferingPage() {
  if (!isAdmin()) return <ViewOnlyNotice />;
  return (
    <div>
      <Link
        href="/offerings"
        className="inline-flex items-center gap-1.5 text-[13px] text-text-secondary hover:text-blue-primary mb-4"
      >
        <ArrowLeft size={15} strokeWidth={1.8} /> All offerings
      </Link>
      <PageHeader
        title="New offering"
        subtitle="Add an offering to the repository — its type, who it's for, the markets it's available in, and the sales materials behind it."
      />
      <OfferingForm
        customerTypes={listCustomerTypes()}
        markets={listMarkets()}
        existingTypes={distinctTypes()}
      />
    </div>
  );
}
