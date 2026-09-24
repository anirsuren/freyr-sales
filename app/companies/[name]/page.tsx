import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Mail, Phone } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { readLeads } from "@/lib/leads";
import { readOpportunities } from "@/lib/opportunities";
import { readSolutioning } from "@/lib/solutioning";
import { getDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/currentUser";
import { canOpenModule } from "@/lib/moduleAccessServer";
import { requireServerMemberScope } from "@/lib/memberScope";
import { privilegesForPerson, readPrivileges } from "@/lib/privileges";
import { canAssignSolutioning } from "@/lib/solutioningValidation";

export const dynamic = "force-dynamic";

export default async function CompanyPage({ params }: { params: Promise<{ name: string }> }) {
  await requireServerMemberScope();
  const { name: rawName } = await params;
  const name = rawName.trim();
  if (!name) notFound();

  const [canSeeLeads, canSeeOpportunities, canSeeSolutioning, canSeeCustomers] = await Promise.all([
    canOpenModule("/leads"),
    canOpenModule("/opportunities"),
    canOpenModule("/solutioning"),
    canOpenModule("/customers"),
  ]);
  if (!canSeeLeads && !canSeeOpportunities && !canSeeSolutioning) redirect("/offerings");
  const [state, opportunityState, solutioningState, customers] = await Promise.all([
    canSeeLeads ? readLeads() : null,
    canSeeOpportunities ? readOpportunities() : null,
    canSeeSolutioning ? readSolutioning() : null,
    canSeeCustomers ? getDb().customers.list().catch(() => []) : [],
  ]);
  const account = customers.find((customer) => customer.company_name.trim().toLocaleLowerCase() === name.toLocaleLowerCase());
  if (account) redirect(`/customers/${encodeURIComponent(account.id)}`);

  const leads = state?.leads.filter((lead) => lead.company.trim().toLocaleLowerCase() === name.toLocaleLowerCase()) ?? [];
  const opportunities = opportunityState?.opportunities.filter((deal) => deal.customer.trim().toLocaleLowerCase() === name.toLocaleLowerCase()) ?? [];
  const matchingRequests = solutioningState?.requests.filter((request) => request.customer.trim().toLocaleLowerCase() === name.toLocaleLowerCase()) ?? [];
  let requests = matchingRequests;
  if (matchingRequests.length) {
    const [me, privilegeState] = await Promise.all([getCurrentUser(), readPrivileges()]);
    const held = privilegesForPerson(privilegeState, me.name);
    const memberOnly = (me.role === "sol_member" || held.includes("sol_member")) && !canAssignSolutioning(me.role, held);
    if (memberOnly) requests = matchingRequests.filter((request) => request.owner === me.name);
  }
  if (!leads.length && !opportunities.length && !requests.length) notFound();
  const companyName = leads[0]?.company.trim() || opportunities[0]?.customer.trim() || requests[0].customer.trim();

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-7 sm:px-8">
      <Link href={leads.length ? "/leads" : opportunities.length ? "/opportunities" : "/solutioning"} className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-blue-primary">
        <ArrowLeft size={15} aria-hidden="true" /> Back to {leads.length ? "Leads" : opportunities.length ? "Opportunities" : "Solutioning"}
      </Link>
      <header className="mt-6 flex items-center gap-4">
        <CompanyLogo name={companyName} className="h-14 w-14 shrink-0" />
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold text-text-primary">{companyName}</h1>
          <p className="mt-1 text-sm text-text-secondary">{[leads.length && `${leads.length} ${leads.length === 1 ? "lead" : "leads"}`, opportunities.length && `${opportunities.length} ${opportunities.length === 1 ? "opportunity" : "opportunities"}`, requests.length && `${requests.length} ${requests.length === 1 ? "Solutioning item" : "Solutioning items"}`].filter(Boolean).join(" · ")}</p>
        </div>
      </header>
      <div className="mt-7 rounded-xl border border-border-light bg-white">
        <div className="border-b border-border-light px-5 py-4">
          <h2 className="font-semibold text-text-primary">Related records</h2>
          <p className="mt-1 text-sm text-text-secondary">People, deals, and requests associated with this company name.</p>
        </div>
        <div className="divide-y divide-border-light">
          {leads.map((lead) => (
            <div key={lead.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 gap-3">
                <Avatar name={lead.name} className="h-9 w-9 shrink-0" />
                <div className="min-w-0">
                  <p className="font-semibold text-text-primary">{lead.name}</p>
                  {lead.title && <p className="text-sm text-text-secondary">{lead.title}</p>}
                  <p className="mt-1 text-sm text-text-secondary">{lead.status} · {lead.source}</p>
                  {lead.interest && <p className="mt-2 max-w-2xl text-sm text-text-secondary">{lead.interest}</p>}
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-blue-primary">
                    {lead.email && <a href={`mailto:${lead.email}`} className="inline-flex items-center gap-1 hover:underline"><Mail size={12} aria-hidden="true" />{lead.email}</a>}
                    {lead.phone && <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-1 hover:underline"><Phone size={12} aria-hidden="true" />{lead.phone}</a>}
                  </div>
                </div>
              </div>
              <Link href={`/leads?lead=${encodeURIComponent(lead.ref)}`} className="inline-flex shrink-0 items-center gap-1 self-start text-sm font-semibold text-blue-primary hover:underline">
                Open lead <ArrowUpRight size={14} aria-hidden="true" />
              </Link>
            </div>
          ))}
          {opportunities.map((deal) => (
            <div key={deal.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Opportunity</p>
                <p className="mt-1 font-semibold text-text-primary">{deal.name}</p>
                <p className="mt-1 text-sm text-text-secondary">{deal.status}</p>
              </div>
              <Link href={`/opportunities/${encodeURIComponent(deal.id)}`} className="inline-flex shrink-0 items-center gap-1 self-start text-sm font-semibold text-blue-primary hover:underline">
                Open opportunity <ArrowUpRight size={14} aria-hidden="true" />
              </Link>
            </div>
          ))}
          {requests.map((request) => (
            <div key={request.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Solutioning</p>
                <p className="mt-1 font-semibold text-text-primary">{request.title}</p>
                <p className="mt-1 text-sm text-text-secondary">{request.status}</p>
              </div>
              <Link href={`/solutioning/${encodeURIComponent(request.id)}`} className="inline-flex shrink-0 items-center gap-1 self-start text-sm font-semibold text-blue-primary hover:underline">
                Open request <ArrowUpRight size={14} aria-hidden="true" />
              </Link>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
