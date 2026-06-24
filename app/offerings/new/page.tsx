import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { OfferingForm } from "@/components/offerings/OfferingForm";
import { listCustomerTypes, listMarkets } from "@/lib/offerings";

export const dynamic = "force-dynamic";

export default function NewOfferingPage() {
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
      <OfferingForm customerTypes={listCustomerTypes()} markets={listMarkets()} />
    </div>
  );
}
