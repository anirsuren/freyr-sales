import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  OfferingsBrowser,
  type HydratedOffering,
} from "@/components/offerings/OfferingsBrowser";
import {
  listOfferings,
  listCustomerTypes,
  listMarkets,
  hydrateOffering,
} from "@/lib/offerings";

export const dynamic = "force-dynamic";

export default function OfferingsPage() {
  const offerings = listOfferings().map(hydrateOffering) as HydratedOffering[];
  const customerTypes = listCustomerTypes();
  const markets = listMarkets();

  return (
    <div>
      <PageHeader
        title="Offerings"
        subtitle="Freyr's offering repository — what we sell, who it's for, the markets it's available in, and the sales materials behind each one."
        action={
          <div className="flex items-center gap-2">
            <Link
              href="/offerings/customer-types"
              className="inline-flex items-center justify-center text-[14px] font-semibold rounded-md px-4 py-2.5 bg-white border border-border text-text-primary hover:bg-surface transition-colors"
            >
              Customer types
            </Link>
            <Link
              href="/offerings/new"
              className="inline-flex items-center justify-center text-[14px] font-semibold rounded-md px-5 py-2.5 bg-blue-primary text-white hover:bg-blue-hover transition-colors"
            >
              + New offering
            </Link>
          </div>
        }
      />
      <OfferingsBrowser
        offerings={offerings}
        customerTypes={customerTypes}
        markets={markets}
      />
    </div>
  );
}
