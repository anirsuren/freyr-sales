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
  type Offering,
  listCustomerTypes,
  listMarkets,
  listOfferings,
  listOfferingTypes,
  listOfferingCategories,
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
      {/* Two columns so the form fills the screen instead of hugging the left
          edge with a third of the monitor empty beside it. The rail carries the
          section jump-list and what this page actually controls, so the space
          it fills is doing work. */}
      <div className="mt-1 grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
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
        />
      </Suspense>
        </div>
        <EditSideRail offering={o} />
      </div>
    </div>
  );
}

/** What the right column carries: where you are in the form, and the facts about
 *  this offering that the form is about to change. Sticky, so it stays useful
 *  while you scroll five sections of fields. */
function EditSideRail({ offering }: { offering: Offering }) {
  const sections: { title: string; icon: LucideIcon; hint: string }[] = [
    { title: "The basics", icon: Package, hint: "Name, type, category, owner" },
    { title: "What's included", icon: ListChecks, hint: "Description and capabilities" },
    { title: "Who it's for", icon: Building2, hint: "Customer types this suits" },
    { title: "Where it's available", icon: Globe, hint: "Markets and availability" },
    { title: "Sales materials", icon: FolderOpen, hint: "Decks, one-pagers, demos" },
  ];
  const facts: { label: string; value: string }[] = [
    { label: "Category", value: offering.offering_category || "No category" },
    { label: "Type", value: offering.offering_type || "Not set" },
    { label: "Availability", value: offering.current_availability || "Not set" },
    { label: "Point of contact", value: offering.poc || "Not set" },
    { label: "Markets", value: `${offering.market_ids.length} selected` },
    { label: "Sales materials", value: `${offering.materials.length} attached` },
  ];
  return (
    <aside className="hidden xl:block xl:sticky xl:top-6 space-y-3">
      <div className="rounded-xl border border-border-light bg-white p-3 shadow-card">
        <p className="mb-2 px-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-text-tertiary">
          On this page
        </p>
        <nav className="space-y-0.5">
          {sections.map((s) => (
            <a
              key={s.title}
              href={`#${sectionId(s.title)}`}
              className="flex items-start gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-blue-light"
            >
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-light text-blue-primary">
                <s.icon size={13} strokeWidth={1.9} />
              </span>
              <span className="min-w-0">
                <span className="block text-[12.5px] font-semibold text-text-primary">
                  {s.title}
                </span>
                <span className="block text-[11px] leading-snug text-text-tertiary">
                  {s.hint}
                </span>
              </span>
            </a>
          ))}
        </nav>
      </div>

      <div className="rounded-xl border border-border-light bg-white p-4 shadow-card">
        <p className="mb-2.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-text-tertiary">
          How it stands today
        </p>
        <dl className="space-y-2">
          {facts.map((f) => (
            <div key={f.label} className="flex items-baseline justify-between gap-3">
              <dt className="shrink-0 text-[11.5px] text-text-secondary">{f.label}</dt>
              <dd className="min-w-0 break-words text-right text-[12px] font-semibold text-text-primary">
                {f.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <p className="px-1 text-[11.5px] leading-relaxed text-text-tertiary">
        You can edit this because you own {offering.offering_name}. Everyone else
        sees it read-only until an admin hands them ownership.
      </p>
    </aside>
  );
}
