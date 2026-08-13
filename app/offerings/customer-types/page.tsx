import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CustomerTypesManager } from "@/components/offerings/CustomerTypesManager";
import {
  listCustomerTypes,
  listMarkets,
  listOfferings,
} from "@/lib/offerings";
import { canManageOfferings } from "@/lib/role";

export const dynamic = "force-dynamic";
export const metadata = { title: "Customer types & markets" };

export default async function CustomerTypesPage() {
  // How many offerings are mapped to each customer type / market — lets the
  // definitions page link straight to "the offerings for this type".
  const offerings = listOfferings();
  const typeCounts: Record<string, number> = {};
  const marketCounts: Record<string, number> = {};
  for (const o of offerings) {
    for (const id of o.customer_type_ids)
      typeCounts[id] = (typeCounts[id] || 0) + 1;
    for (const id of o.market_ids)
      marketCounts[id] = (marketCounts[id] || 0) + 1;
  }

  return (
    <div>
      <Link
        href="/offerings"
        className="inline-flex items-center gap-1.5 text-[13px] text-text-secondary hover:text-blue-primary mb-4"
      >
        <ArrowLeft size={15} strokeWidth={1.8} /> All offerings
      </Link>
      <CustomerTypesManager
        customerTypes={listCustomerTypes()}
        markets={listMarkets()}
        typeCounts={typeCounts}
        marketCounts={marketCounts}
        canEdit={await canManageOfferings()}
      />
    </div>
  );
}
