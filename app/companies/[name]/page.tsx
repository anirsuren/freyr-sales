import { redirect } from "next/navigation";
import { requireServerMemberScope } from "@/lib/memberScope";
import { canOpenModule, moduleWriteRefusal } from "@/lib/moduleAccessServer";
import { getCurrentUser } from "@/lib/currentUser";
import { ensureCustomerAccount } from "@/lib/ensureCustomerAccount";
import { linkLeadsToCustomer } from "@/lib/leads";
import { getDb } from "@/lib/db";
import { CompanyAccountProblem } from "@/components/customers/CompanyAccountRedirect";

export const dynamic = "force-dynamic";

/**
 * STRAIGHT TO THE ACCOUNT (Anir, Sep 29: "just load it. Why does it say
 * Opening? It's so ugly. Make sure it's not doing that anywhere else").
 *
 * The twin of the lead-to-contact hop: this drew the company name and
 * "Opening customer account…" while the browser made the round trip, so
 * every company link in the app flashed a waiting room. The resolve happens
 * here and the browser is handed the account page.
 */
export default async function CompanyPage({ params }: { params: Promise<{ name: string }> }) {
  await requireServerMemberScope();
  const name = decodeURIComponent((await params).name).trim();
  if (!name) redirect("/customers");
  if (!(await canOpenModule("/customers")))
    return <CompanyAccountProblem name={name} message="Customer accounts are not available on this account." />;

  const existing = (await getDb().customers.list()).find(
    (item) => item.company_name.trim().toLocaleLowerCase() === name.toLocaleLowerCase()
  );
  const canWriteSource = (
    await Promise.all(["/leads", "/opportunities", "/solutioning"].map(moduleWriteRefusal))
  ).some((refusal) => !refusal);
  if (!existing && !canWriteSource)
    return <CompanyAccountProblem name={name} message="You cannot create customer accounts." />;

  let id = "";
  try {
    const me = await getCurrentUser();
    const account = existing ?? (await ensureCustomerAccount(name, null, me.name));
    if (!(await moduleWriteRefusal("/leads"))) await linkLeadsToCustomer(name, account.id);
    id = account.id;
  } catch (error) {
    return <CompanyAccountProblem name={name} message={error instanceof Error ? error.message : "Could not open the customer account."} />;
  }
  redirect(`/customers/${encodeURIComponent(id)}`);
}
