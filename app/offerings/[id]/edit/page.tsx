import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  FolderOpen,
  Globe,
  ListChecks,
  Package,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { OfferingIcon } from "@/components/ui/OfferingIcon";
import { Skeleton } from "@/components/ui/Skeleton";
import { OfferingForm } from "@/components/offerings/OfferingForm";
import { sectionId } from "@/lib/sectionId";
import {
  getOffering,
  listCustomerTypes,
  listMarkets,
  listOfferings,
  listOfferingTypes,
  listOfferingCategories,
  listOfferingPeople,
} from "@/lib/offerings";
import { canEditOffering } from "@/lib/offeringOwnership";
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
  // Direct navigation is gated exactly like the button that leads here: you
  // must own this offering. Hiding the button alone would leave the URL open
  // (Anir, Jul 28: "the edit offering button shouldn't even open up until I
  // take ownership").
  if (!(await canEditOffering(o)))
    return <ViewOnlyNotice backHref={`/offerings/${o.id}`} />;
  return (
    <div>
      <Link
        href={`/offerings/${o.id}`}
        className="inline-flex items-center gap-1.5 text-[13px] text-text-secondary hover:text-blue-primary mb-4"
      >
        <ArrowLeft size={15} strokeWidth={1.8} /> Back to offering
      </Link>
      <PageHeader
        title={`Edit ${o.offering_name}`}
        subtitle="Update this offering: its details, who it's for, the markets it's available in, and its sales materials."
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
      {/* The jump strip runs ACROSS the top, not down a right-hand rail. A rail
          ate 300px of every screen to hold five links (Anir, Jul 28: "if you're
          gonna put the headers on the right side... put that somewhere else. It
          doesn't make sense on the right, where it's blocking and eating up so
          much space"). Sticky, so it stays reachable as you scroll. */}
      <SectionJumpStrip />
      <div className="mt-1">
      {/* OfferingForm reads ?focus=name via useSearchParams, so it needs its own
          Suspense boundary; it also lets the page shell paint while the form's
          client chunk loads instead of the route showing nothing. */}
      <Suspense
        fallback={
          <div className="space-y-3">
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
          people={listOfferingPeople()}
        />
      </Suspense>
      </div>
    </div>
  );
}

/** WHERE YOU ARE IN THE FORM, as a strip across the top rather than a rail down
 *  the side. Five links do not justify a column: they cost 300px of width on
 *  every screen and pushed the fields that matter into a narrow gutter. The
 *  "How it stands today" panel that used to sit under them is gone entirely —
 *  it restated values the form's own fields already show, two inches away. */
function SectionJumpStrip() {
  const sections: { title: string; icon: LucideIcon }[] = [
    { title: "The basics", icon: Package },
    { title: "What's included", icon: ListChecks },
    { title: "Who it's for", icon: Building2 },
    { title: "Where it's available", icon: Globe },
    { title: "Sales materials", icon: FolderOpen },
  ];
  return (
    <nav className="sticky top-0 z-20 -mx-1 mb-1 flex flex-wrap items-center gap-1.5 rounded-xl border border-border-light bg-white/95 px-2 py-2 shadow-card backdrop-blur">
      {sections.map((s) => (
        <a
          key={s.title}
          href={`#${sectionId(s.title)}`}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold text-text-secondary transition-colors hover:bg-blue-light hover:text-blue-primary"
        >
          <s.icon size={13} strokeWidth={1.95} />
          {s.title}
        </a>
      ))}
    </nav>
  );
}
