import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { CustomerTypesManager } from "@/components/offerings/CustomerTypesManager";
import { listCustomerTypes, listMarkets } from "@/lib/offerings";

export const dynamic = "force-dynamic";

export default function CustomerTypesPage() {
  return (
    <div>
      <Link
        href="/offerings"
        className="inline-flex items-center gap-1.5 text-[13px] text-text-secondary hover:text-blue-primary mb-4"
      >
        <ArrowLeft size={15} strokeWidth={1.8} /> All offerings
      </Link>
      <PageHeader
        title="Customer types & markets"
        subtitle="The customer-type definitions and markets that offerings are mapped to. Add more as the book grows."
      />
      <CustomerTypesManager
        customerTypes={listCustomerTypes()}
        markets={listMarkets()}
      />
    </div>
  );
}
