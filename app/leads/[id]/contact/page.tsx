import { redirect } from "next/navigation";
import { requireModuleAccess, canOpenModule, moduleWriteRefusal } from "@/lib/moduleAccessServer";
import { requireServerMemberScope } from "@/lib/memberScope";
import { getCurrentUser } from "@/lib/currentUser";
import { ensureCustomerAccount } from "@/lib/ensureCustomerAccount";
import { readLeads, linkLeadsToCustomer } from "@/lib/leads";
import { getDb } from "@/lib/db";
import { LeadContactProblem } from "@/components/leads/LeadContactRedirect";

export const dynamic = "force-dynamic";

/**
 * STRAIGHT TO THE CONTACT, NO WAITING ROOM (Anir, Sep 29: "why does it say
 * Opening? It's so ugly. Just load it").
 *
 * This used to render a page that said "Opening contact" and then made three
 * round trips from the browser before redirecting, so every visit flashed an
 * interstitial that no other record link in the app shows. The same work
 * happens here, on the server, and the browser is handed the contact page
 * directly. Only a genuine problem, a deleted lead or a lead with no company,
 * ever draws anything.
 */
export default async function LeadContactPage({ params }: { params: Promise<{ id: string }> }) {
  await requireModuleAccess("/leads");
  await requireServerMemberScope();
  const leadId = (await params).id;

  const state = await readLeads();
  const lead = state.leads.find((item) => item.id === leadId);
  if (!lead) return <LeadContactProblem message="This lead no longer exists." />;
  if (lead.contactId) redirect(`/contacts/${encodeURIComponent(lead.contactId)}`);
  if (!lead.company)
    return <LeadContactProblem message="Add a company to this lead before opening a contact record." />;

  /* The link is made on first open, exactly as the old client flow did: an
     account for the company, then the leads on it pointed at that account. */
  if (!(await canOpenModule("/customers")))
    return <LeadContactProblem message="Customer accounts are not available on this account." />;
  const name = lead.company.trim();
  const existing = (await getDb().customers.list()).find(
    (item) => item.company_name.trim().toLocaleLowerCase() === name.toLocaleLowerCase()
  );
  const canWriteSource = (
    await Promise.all(["/leads", "/opportunities", "/solutioning"].map(moduleWriteRefusal))
  ).some((refusal) => !refusal);
  if (!existing && !canWriteSource)
    return <LeadContactProblem message="You cannot create customer accounts." />;

  let contactId = "";
  try {
    const me = await getCurrentUser();
    const account = existing ?? (await ensureCustomerAccount(name, null, me.name));
    if (!(await moduleWriteRefusal("/leads"))) await linkLeadsToCustomer(name, account.id);
    const linked = (await readLeads()).leads.find((item) => item.id === leadId);
    contactId = linked?.contactId ?? "";
  } catch {
    return <LeadContactProblem message="Could not link this contact." />;
  }
  if (!contactId) return <LeadContactProblem message="Could not open this contact record." />;
  redirect(`/contacts/${encodeURIComponent(contactId)}`);
}
