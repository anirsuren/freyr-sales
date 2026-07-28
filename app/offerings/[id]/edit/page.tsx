import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { OfferingIcon } from "@/components/ui/OfferingIcon";
import { Skeleton } from "@/components/ui/Skeleton";
import { OfferingForm } from "@/components/offerings/OfferingForm";
import {
  getOffering,
  listCustomerTypes,
  listMarkets,
  listOfferings,
  listOfferingTypes,
  listOfferingCategories,
} from "@/lib/offerings";
import { canManageOfferings } from "@/lib/role";
import { ViewOnlyNotice } from "@/components/offerings/ViewOnlyNotice";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const o = getOffering((await params).id);
  return { title: o ? `Edit ${o.offering_name} · Offerings` : "Edit offering" };
}

export default async function EditOfferingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const o = getOffering((await params).id);
  if (!o) notFound();
  if (!(await canManageOfferings())) return <ViewOnlyNotice backHref={`/offerings/${o.id}`} />;
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
        action={
          /* Which offering you're editing, visible without scrolling back. */
          <span className="inline-flex items-center gap-2 rounded-full border border-border-light bg-white px-3 py-1.5">
            <OfferingIcon name={o.offering_name} className="h-6 w-6" />
            <span className="text-[13px] font-semibold text-text-primary">
              {o.offering_name}
            </span>
          </span>
        }
      />
      {/* OfferingForm reads ?focus=name via useSearchParams, so it needs its own
          Suspense boundary; it also lets the page shell paint while the form's
          client chunk loads instead of the route showing nothing. */}
      <Suspense
        fallback={
          <div className="max-w-[880px] space-y-3">
            {["h-[190px]", "h-[260px]", "h-[210px]", "h-[190px]"].map((h) => (
              <Skeleton key={h} className={`w-full rounded-xl ${h}`} />
            ))}
          </div>
        }
      >
        <OfferingForm
          offeringId={o.id}
          initial={{
            offering_type: o.offering_type,
            offering_category: o.offering_category,
            offering_name: o.offering_name,
            offering_description: o.offering_description,
            current_availability: o.current_availability,
            future_availability: o.future_availability,
            poc: o.poc,
            customer_type_ids: o.customer_type_ids,
            market_ids: o.market_ids,
            materials: o.materials.map((m) => ({
              kind: m.kind,
              label: m.label,
              url: m.url,
              journeyStage: m.journeyStage,
              accessLevel: m.accessLevel,
            })),
          }}
          customerTypes={listCustomerTypes()}
          markets={listMarkets()}
          existingTypes={Array.from(
            new Set([
              ...listOfferingTypes().map((t) => t.name),
              ...listOfferings().map((x) => x.offering_type).filter(Boolean),
            ])
          )}
          offeringCategories={listOfferingCategories()}
        />
      </Suspense>
    </div>
  );
}
