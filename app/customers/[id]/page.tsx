import Link from "next/link";
import { FileText, Plus, SearchX, ArrowLeft } from "lucide-react";
import { getDb } from "@/lib/db";
import { EmptyState } from "@/components/ui/EmptyState";
import { SizeBadge } from "@/components/ui/Badge";
import { HealthBadge } from "@/components/ui/HealthBadge";
import { Avatar } from "@/components/ui/Avatar";
import { ReEnrichButton } from "@/components/customers/ReEnrichButton";
import { CustomerTabs } from "@/components/customers/CustomerTabs";
import { CustomerAnalyzePanel } from "@/components/customers/CustomerAnalyzePanel";
import { RecordView } from "@/components/RecordView";
import {
  listCustomerTypes,
  listOfferings,
  MATERIAL_META,
  type Offering,
} from "@/lib/offerings";
import { buildDeals } from "@/lib/pipeline";
import { accountHealth } from "@/lib/health";

export const metadata = { title: "Customer" };
export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const db = getDb();
  const customer = await db.customers.get(params.id);

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

  const contacts = await db.contacts.list(params.id);
  const interactions = await db.interactions.list(params.id);
  const sessions = await db.pitchSessions.list(params.id);
  const allRuns = await db.agentRuns.list();
  const agentRuns = allRuns.filter((r) => r.customer_id === params.id);

  // Account health for the header — the most important signal, so it's visible
  // the moment you land (matches the customers list cards).
  const health = accountHealth({
    interactions,
    deals: buildDeals(sessions, [customer], contacts, interactions),
    contactCount: contacts.length,
  });

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
    materials: o.materials.map((m) => ({
      id: m.id,
      kind: MATERIAL_META[m.kind]?.label || m.kind,
      label: m.label,
      url: m.url,
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
  const applicableOfferings = applicableRich.map((o) => ({
    id: o.id,
    name: o.name,
    type: o.category || o.type,
  }));

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
          <Avatar
            name={customer.company_name}
            className="w-12 h-12 text-[16px] rounded-xl"
          />
          <div>
            <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-text-primary">
              {customer.company_name}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <HealthBadge health={health} />
              <SizeBadge tier={customer.size_tier} />
              <span className="text-[13px] text-text-secondary">
                {customer.industry}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Start a pitch session for THIS account in one click — prefills the
              intake with the company + primary contact (streamlines sales). */}
          <Link
            href={`/intake?company=${encodeURIComponent(customer.company_name)}${
              contacts[0]
                ? `&contact=${encodeURIComponent(contacts[0].full_name)}`
                : ""
            }${
              customer.website_url
                ? `&website=${encodeURIComponent(customer.website_url)}`
                : ""
            }`}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-3.5 py-2 rounded-md bg-blue-primary text-white hover:bg-blue-hover transition-all shadow-[0_1px_2px_rgba(0,113,227,0.20)] hover:shadow-[0_4px_12px_rgba(0,113,227,0.26)]"
          >
            <Plus size={15} strokeWidth={2} />
            New session
          </Link>
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

      <CustomerAnalyzePanel
        customerId={customer.id}
        customerType={customer.customer_type ?? null}
        ownership={customer.ownership ?? null}
        revenue={customer.revenue ?? null}
        analyzed={!!customer.analyzed_at}
        typeOptions={customerTypes.map((t) => t.name)}
        applicableOfferings={applicableOfferings}
      />

      <CustomerTabs
        customer={customer}
        contacts={contacts}
        sessions={sessions}
        interactions={interactions}
        agentRuns={agentRuns}
        offeringsCatalog={{
          typeOptions: customerTypes.map((t) => t.name),
          applicable: applicableRich,
          inUse: inUseRich,
        }}
      />
    </div>
  );
}
