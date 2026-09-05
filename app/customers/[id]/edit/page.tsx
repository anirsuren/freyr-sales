import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { SmartBack } from "@/components/ui/BackButton";
import { PageHeader } from "@/components/layout/PageHeader";
import { CustomerEditForm } from "@/components/customers/CustomerEditForm";
import { getDb } from "@/lib/db";
import { resolveScope, canEditRecord } from "@/lib/recordScope";
import { moduleWriteRefusal } from "@/lib/moduleAccessServer";
import { listCustomerTypes } from "@/lib/offerings";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const c = await getDb().customers.get((await params).id);
  return { title: c ? `Edit ${c.company_name} · Customers` : "Edit account" };
}

/**
 * THE ACCOUNT'S EDIT PAGE (Anir, Sep 4: "look at the offering page. That is
 * what it's supposed to be when I press edit"). Same idiom as
 * /offerings/[id]/edit: the detail page reads, this page writes, one Save.
 *
 * Direct navigation is gated exactly like the button that leads here — the
 * same owner-or-manager rule the PATCH enforces — so hiding the button is
 * never the only lock on the door.
 */
export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const customer = await getDb().customers.get((await params).id);
  /* A MISSING RECORD LANDS ON ITS LIST, NEVER ON A DEAD END (Anir, Sep 4,
     stuck on "Customer not found" after a mode switch: "i should never go
     here... just take me back to the page with all those things. dont show me
     that it doesnt exist"). The commonest way to arrive with a stale id is
     flipping Mock/Real while standing on a record; the honest answer is the
     module's own list, which exists in both worlds. */
  if (!customer) redirect("/customers");
  const scope = await resolveScope();
  const mayEdit =
    !(await moduleWriteRefusal("/customers")) &&
    canEditRecord(
      {
        id: customer.id,
        owner: customer.owner,
        owner_user_id: customer.owner_user_id,
        created_by: customer.created_by,
      },
      "customers",
      scope
    );
  if (!mayEdit) redirect(`/customers/${customer.id}`);
  return (
    <div>
      <SmartBack
        fallback={`/customers/${customer.id}`}
        className="mb-4 inline-flex cursor-pointer items-center gap-1.5 text-[13px] text-text-secondary hover:text-blue-primary"
      >
        <ArrowLeft size={15} strokeWidth={1.8} /> Back to {customer.company_name}
      </SmartBack>
      <PageHeader
        title={`Edit ${customer.company_name}`}
        subtitle="Update the account's facts. Contacts, the team and activities are edited where they live."
      />
      <CustomerEditForm
        customer={customer}
        customerTypes={listCustomerTypes().map((t) => t.name)}
      />
    </div>
  );
}
