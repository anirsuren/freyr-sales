import { readCustomerGroups } from "@/lib/customerGroups";
import { RevenueAccrualsModule } from "@/components/accruals/RevenueAccrualsModule";
import { readRevenueAccruals } from "@/lib/revenueAccruals";
import { readOpportunities } from "@/lib/opportunities";
import { listOfferings, initializeLiveOfferings } from "@/lib/offerings";
import { getCurrentUser } from "@/lib/currentUser";
import { getDataMode } from "@/lib/dataMode";
import { requireServerMemberScope } from "@/lib/memberScope";
import { requireModuleAccess } from "@/lib/moduleAccessServer";

export const metadata = { title: "Revenue Accruals" };
export const dynamic = "force-dynamic";

/**
 * REVENUE ACCRUALS (Suren, Aug 25): "you need to create one more thing called
 * sales revenue accruals — that's one more module, created outside, because
 * you can see one report across it, because you cannot go from opportunity to
 * opportunity."
 *
 * Tied to customer, opportunity AND offering, all three, because "revenue
 * accruals can also be looked at from an offering point of view".
 */
export default async function RevenueAccrualsPage() {
  await requireModuleAccess("/revenue-accruals");
  await requireServerMemberScope();
  await initializeLiveOfferings().catch(() => undefined);
  const [state, me, opportunities, groupState] = await Promise.all([
    readRevenueAccruals(),
    getCurrentUser(),
    readOpportunities()
      .then((s) => s.opportunities)
      .catch(() => []),
      readCustomerGroups().catch(() => ({ groups: [] })),
  ]);
  const offeringName = new Map(
    listOfferings().map((o) => [o.id, o.offering_name])
  );

  return (
    <RevenueAccrualsModule
      state={state}
      canWrite={me.role === "admin"}
      live={getDataMode() === "live"}
      /* THE PIPELINE ITSELF, so the accrual summary can group and total the
         same way Opportunities does (Suren, Aug 30). The DealOption list below
         stays as it is — it feeds the planner, which wants a flat picker. */
      opportunities={opportunities.filter((o) => o.level !== "Future")}
      customerGroups={groupState.groups.map((g) => ({
        id: g.id,
        name: g.name,
        color: g.color,
        customerIds: g.customerIds,
      }))}
      offeringNames={Object.fromEntries(offeringName)}
      deals={opportunities.map((o) => {
        const line = (o.lines ?? [])[0];
        const offeringId = line?.offeringId ?? o.offeringIds[0];
        return {
          id: o.id,
          name: o.name || `${o.customer} deal`,
          customer: o.customer,
          customerId: o.customerId,
          offeringId,
          offeringLabel: offeringId
            ? (offeringName.get(offeringId) ?? offeringId)
            : (line?.offeringLabel ?? o.offeringLabels[0]),
          value: o.value ?? 0,
          status: o.status,
          estSignDate: line?.estSignDate ?? o.estSignDate,
          owner: o.owner,
        };
      })}
    />
  );
}
