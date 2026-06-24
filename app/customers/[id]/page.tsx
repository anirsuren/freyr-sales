import Link from "next/link";
import { FileText } from "lucide-react";
import { getDb } from "@/lib/db";
import { PageHeader } from "@/components/layout/PageHeader";
import { SizeBadge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { ReEnrichButton } from "@/components/customers/ReEnrichButton";
import { CustomerTabs } from "@/components/customers/CustomerTabs";
import { RecordView } from "@/components/RecordView";

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
      <div>
        <PageHeader title="Customer not found" />
        <Link href="/customers" className="text-blue-primary hover:underline">
          ← Back to customers
        </Link>
      </div>
    );
  }

  const contacts = await db.contacts.list(params.id);
  const interactions = await db.interactions.list(params.id);
  const sessions = await db.pitchSessions.list(params.id);
  const allRuns = await db.agentRuns.list();
  const agentRuns = allRuns.filter((r) => r.customer_id === params.id);

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
              <SizeBadge tier={customer.size_tier} />
              <span className="text-[13px] text-text-secondary">
                {customer.industry}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
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
        agentRuns={agentRuns}
      />
    </div>
  );
}
