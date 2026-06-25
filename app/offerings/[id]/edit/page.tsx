import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { OfferingForm } from "@/components/offerings/OfferingForm";
import {
  getOffering,
  listCustomerTypes,
  listMarkets,
  listOfferings,
} from "@/lib/offerings";

export const dynamic = "force-dynamic";

export function generateMetadata({ params }: { params: { id: string } }) {
  const o = getOffering(params.id);
  return { title: o ? `Edit ${o.offering_name} · Offerings` : "Edit offering" };
}

export default function EditOfferingPage({
  params,
}: {
  params: { id: string };
}) {
  const o = getOffering(params.id);
  if (!o) notFound();
  return (
    <div>
      <Link
        href={`/offerings/${o.id}`}
        className="inline-flex items-center gap-1.5 text-[13px] text-text-secondary hover:text-blue-primary mb-4"
      >
        <ArrowLeft size={15} strokeWidth={1.8} /> Back to offering
      </Link>
      <PageHeader
        title="Edit offering"
        subtitle="Update this offering — its details, who it's for, the markets it's available in, and its sales materials."
      />
      <OfferingForm
        offeringId={o.id}
        initial={{
          offering_type: o.offering_type,
          offering_name: o.offering_name,
          offering_description: o.offering_description,
          current_availability: o.current_availability,
          future_availability: o.future_availability,
          customer_type_ids: o.customer_type_ids,
          market_ids: o.market_ids,
          materials: o.materials.map((m) => ({
            kind: m.kind,
            label: m.label,
            url: m.url,
          })),
        }}
        customerTypes={listCustomerTypes()}
        markets={listMarkets()}
        existingTypes={Array.from(
          new Set(
            listOfferings().map((x) => x.offering_type).filter(Boolean)
          )
        ).sort()}
      />
    </div>
  );
}
