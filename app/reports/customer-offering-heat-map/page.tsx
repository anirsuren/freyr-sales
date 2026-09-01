import Link from "next/link";
import { SmartBack } from "@/components/ui/BackButton";
import { ArrowLeft, Grid3X3 } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { CustomerOfferingHeatMap } from "@/components/reports/CustomerOfferingHeatMap";
import { withDemoHeatMapActivity } from "@/lib/customerOfferingHeatMap";
import { getDataMode } from "@/lib/dataMode";
import { getDb } from "@/lib/db";
import { listOfferings } from "@/lib/offerings";

export const metadata = { title: "Customer Offering Heat Map" };
export const dynamic = "force-dynamic";

export default async function CustomerOfferingHeatMapPage() {
  const offerings = listOfferings()
    .map((offering) => ({
      id: offering.id,
      name: offering.offering_name,
      category: offering.offering_category,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const workspaceCustomers = await getDb().customers.list();
  const customers = (
    getDataMode() === "mock"
      ? withDemoHeatMapActivity(workspaceCustomers, offerings)
      : workspaceCustomers
  ).sort((a, b) => a.company_name.localeCompare(b.company_name));

  return (
    <div className="space-y-5 pb-24">
      <div>
        <div className="mb-3">
          <SmartBack
            fallback="/reports"
            className="inline-flex cursor-pointer items-center gap-1.5 text-[12.5px] font-semibold text-text-secondary transition-colors hover:text-blue-primary"
          >
            <ArrowLeft size={14} strokeWidth={2} />
            All reports
          </SmartBack>
        </div>
        <PageHeader
          title="Customer Offering Heat Map"
          subtitle="Every customer against every offering. Change what cells display, filter the matrix, and open any cell to manage activity details and version history."
        />
      </div>
      {customers.length === 0 || offerings.length === 0 ? (
        <div className="flex min-h-[420px] flex-col items-center justify-center rounded-xl border border-border-light bg-white px-6 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-light text-blue-primary">
            <Grid3X3 size={22} strokeWidth={1.8} />
          </span>
          <h2 className="mt-4 text-[16px] font-semibold text-text-primary">
            Nothing to show yet
          </h2>
          <p className="mt-1 max-w-[520px] text-[13px] leading-relaxed text-text-secondary">
            This report needs at least one customer and one offering. Add both
            and every pairing shows up here, each one empty until somebody logs
            the first activity against it.
          </p>
        </div>
      ) : (
        <CustomerOfferingHeatMap
          initialCustomers={customers}
          offerings={offerings}
        />
      )}
    </div>
  );
}
