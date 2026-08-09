import Link from "next/link";
import { FileText, SearchX, ArrowLeft } from "lucide-react";
import { getDb } from "@/lib/db";
import { EmptyState } from "@/components/ui/EmptyState";
import { SizeBadge } from "@/components/ui/Badge";
import { IndustryTag } from "@/components/ui/IndustryTag";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { ReEnrichButton } from "@/components/customers/ReEnrichButton";
import { NewSessionButton } from "@/components/sessions/NewSessionButton";
import { CustomerTabs } from "@/components/customers/CustomerTabs";
import { initializeLiveOfferings, listFdlComponents } from "@/lib/offerings";
import { canManageOfferings } from "@/lib/role";
import { RecordView } from "@/components/RecordView";
import {
  listCustomerTypes,
  listOfferings,
  MATERIAL_META,
  type Offering,
} from "@/lib/offerings";
import { isSalesVisible } from "@/lib/offeringMaterials";
import { getDataMode } from "@/lib/dataMode";

export const metadata = { title: "Customer" };
export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const id = (await params).id;
  const db = getDb();
  const customer = await db.customers.get(id);

  if (!customer) {
    return (
      <EmptyState
        icon={SearchX}
        title="Customer not found"
        description="The link may be out of date, or this account was removed. Head back to your customers to find it."
        className="py-24"
        action={
          <Link
            href="/customers"
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-3.5 py-2 rounded-md bg-blue-primary text-white hover:bg-blue-hover transition-colors shadow-[0_1px_2px_rgba(0,113,227,0.20)] hover:shadow-[0_4px_12px_rgba(0,113,227,0.26)]"
          >
            <ArrowLeft size={15} strokeWidth={2} />
            Back to customers
          </Link>
        }
      />
    );
  }

  const contacts = await db.contacts.list(id);
  const interactions = await db.interactions.list(id);
  const sessions = await db.pitchSessions.list(id);
  // No agent-run fetch here any more: the account rail's agent block and its
  // Deliverables tiles are both gone, so this page listed every agent run in
  // the workspace on each load and used none of it. The only agent surfaces are
  // the dock and /agent (standing rule).
  //
  // No header health calc either — the score already leads the Account snapshot
  // rail and the Relationship health card, and the header bar that used this
  // was removed.

  // Customer analysis (Suren's Jun 27 ask): the customer-type definitions feed
  // the "Analyze the customer" dropdown, and once an account is qualified to a
  // type, the offerings applicable to that type show automatically.
  const customerTypes = listCustomerTypes();
  const matchedType = customer.customer_type
    ? customerTypes.find((t) => t.name === customer.customer_type)
    : null;

  // Customer⇄offering link (Suren, Jul 3): serialize the offerings applicable
  // to this customer's type — and the ones already in use — WITH descriptions
  // and sales materials, so the Offerings tab lets a rep work the account
  // without ever leaving the customer page.
  const toTabOffering = (o: Offering) => ({
    id: o.id,
    name: o.offering_name,
    category: o.offering_category,
    type: o.offering_type,
    availability: o.current_availability,
    poc: o.poc,
    description: o.offering_description,
    // Agent-training uploads never leave the offering page: they exist to make
    // the assistant smarter, not to be handed to a customer (Wajeed, Jul 29).
    materials: o.materials.filter(isSalesVisible).map((m) => ({
      id: m.id,
      kind: MATERIAL_META[m.kind]?.label || m.kind,
      // The raw kind travels alongside its label so the tab can resolve the
      // format glyph — the label alone can't be mapped back to an icon.
      kindKey: m.kind,
      label: m.label,
      url: m.url,
      // CR-3 tags travel as raw values; the tab narrows them safely so
      // untagged legacy materials render without pills instead of crashing.
      journeyStage: m.journeyStage,
      accessLevel: m.accessLevel,
    })),
  });
  const allOfferings = listOfferings();
  const applicableRich = matchedType
    ? allOfferings
        .filter((o) => o.customer_type_ids.includes(matchedType.id))
        .map(toTabOffering)
    : [];
  const inUseIds = new Set(customer.offerings_in_use || []);
  const inUseRich = allOfferings
    .filter((o) => inUseIds.has(o.id))
    .map(toTabOffering);

  // The Freya software this customer runs, for the Digital components tab.
  await initializeLiveOfferings().catch(() => undefined);
  const fdlComponents = listFdlComponents();
  const canEditComponents = await canManageOfferings();

  return (
    <div>
      <RecordView
        type="Customer"
        label={customer.company_name}
        sublabel={customer.industry || ""}
        href={`/customers/${customer.id}`}
      />
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <CompanyLogo
            name={customer.company_name}
            className="w-12 h-12 text-[16px]"
          />
          <div>
            <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-text-primary">
              {customer.company_name}
            </h1>
            {/* Identity only, directly under the name: what this account IS —
                its industry and its size, each a colour + icon chip. The health
                bar used to sit here and read as clutter against the company name
                (Anir, Jul 26: "the health bar looks really ugly next to the name
                at the top"); health is a MEASURE, not an identity, so it moved
                to its own labelled block on the right of the header. */}
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {customer.industry && <IndustryTag industry={customer.industry} />}
              <SizeBadge tier={customer.size_tier} />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {/* No health bar in the header: the same score already leads the
              Account snapshot rail AND the Relationship health card below, so a
              third copy beside the buttons was pure duplication (Anir, Jul 27:
              "remove the health bar from next to the New session, it's already
              below"). */}
          {/* Start a pitch session for THIS account — the button first explains
              what a session is (Suren #89), then prefills the intake with the
              company + primary contact. */}
          <NewSessionButton
            company={customer.company_name}
            intakeHref={`/intake?company=${encodeURIComponent(customer.company_name)}${
              contacts[0]
                ? `&contact=${encodeURIComponent(contacts[0].full_name)}`
                : ""
            }${
              customer.website_url
                ? `&website=${encodeURIComponent(customer.website_url)}`
                : ""
            }`}
          />
          <Link
            href={`/customers/${customer.id}/report`}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium px-3 py-2 rounded-md border border-border text-text-secondary hover:bg-surface transition-colors"
          >
            <FileText size={15} strokeWidth={1.7} />
            Report
          </Link>
          <ReEnrichButton customerId={customer.id} />
        </div>
      </div>

      <CustomerTabs
        customer={customer}
        contacts={contacts}
        sessions={sessions}
        interactions={interactions}
        includeDemoTeam={getDataMode() === "mock"}
        offeringsCatalog={{
          typeOptions: customerTypes.map((t) => t.name),
          applicable: applicableRich,
          inUse: inUseRich,
        }}
        fdlComponents={fdlComponents}
        canEditComponents={canEditComponents}
      />
    </div>
  );
}
