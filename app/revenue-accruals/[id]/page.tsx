import { notFound } from "next/navigation";
import { readRevenueAccruals } from "@/lib/revenueAccruals";
import { readOpportunities } from "@/lib/opportunities";
import { listOfferings } from "@/lib/offerings";
import { getCurrentUser } from "@/lib/currentUser";
import { getDataMode } from "@/lib/dataMode";
import { requireModuleAccess, moduleWriteRefusal } from "@/lib/moduleAccessServer";
import { requireServerMemberScope } from "@/lib/memberScope";
import { AccrualPlanPage } from "@/components/accruals/AccrualPlanPage";

export const dynamic = "force-dynamic";

/* Every other page names itself in the tab. Without this the browser tab for a
   plan just read "Freyr Sales Intelligence", so two open plans were
   indistinguishable (found Aug 30 in the browser). */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { opportunities } = await readOpportunities();
  const deal = opportunities.find((o) => o.id === id);
  return {
    title: deal ? `${deal.name || deal.customer} · Accrual plan` : "Accrual plan",
  };
}

/**
 * ONE DEAL'S ACCRUAL PLAN, ON ITS OWN PAGE.
 *
 * Anir, Aug 30: "I don't think he wants it to be like this. I'm pretty sure he
 * wants it to be a page instead of a popup."
 *
 * The planner is a contract value, a start month, a month count and a row per
 * month — a form that grows with the length of the plan and had to scroll
 * inside a fixed sheet, over the table it was editing. A twelve-month plan is
 * a page's worth of work.
 *
 * The dialog stays for "Plan a deal" from the list, where picking the deal is
 * the first step and nothing has been chosen yet.
 */
export default async function AccrualPlanRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireModuleAccess("/revenue-accruals");
  await requireServerMemberScope();
  const { id } = await params;

  const [state, { opportunities }, offerings, me] = await Promise.all([
    readRevenueAccruals(),
    readOpportunities(),
    listOfferings(),
    getCurrentUser(),
  ]);

  const deal = opportunities.find((o) => o.id === id);
  if (!deal) notFound();

  const offeringName = new Map(offerings.map((o) => [o.id, o.offering_name]));
  const line = (deal.lines ?? [])[0];
  const offeringId = line?.offeringId ?? deal.offeringIds[0];

  return (
    <AccrualPlanPage
      plan={state.plans.find((p) => p.opportunityId === deal.id) ?? null}
      deal={{
        id: deal.id,
        name: deal.name || `${deal.customer} deal`,
        customer: deal.customer,
        ...(deal.customerId ? { customerId: deal.customerId } : {}),
        ...(offeringId ? { offeringId } : {}),
        offeringLabel: offeringId
          ? (offeringName.get(offeringId) ?? offeringId)
          : (line?.offeringLabel ?? deal.offeringLabels[0]),
        value: deal.value ?? 0,
        ...(deal.status ? { status: deal.status } : {}),
        ...(line?.estSignDate ?? deal.estSignDate
          ? { estSignDate: line?.estSignDate ?? deal.estSignDate }
          : {}),
      }}
      /* THE TABLE DECIDES, NOT A HARDCODED ROLE (found in the loop, Sep 1).
         `me.role === "admin"` ignores the privilege table, so this module
         could be granted to somebody in the Admin grid and granting it changed
         no button — the same defect Submissions and Presentations had until
         Aug 31, and Revenue accruals until today. */
      canWrite={!(await moduleWriteRefusal("/revenue-accruals"))}
      live={getDataMode() === "live"}
    />
  );
}
