import { ContractsModule } from "@/components/contracts/ContractsModule";
import { readContracts } from "@/lib/contracts";
import { readOpportunities } from "@/lib/opportunities";
import { readPerformance } from "@/lib/performance";
import { listOfferings, initializeLiveOfferings } from "@/lib/offerings";
import { getCurrentUser } from "@/lib/currentUser";
import { getDataMode } from "@/lib/dataMode";
import { listWorkspaceAccess } from "@/lib/accessStore";
import { requireServerMemberScope } from "@/lib/memberScope";
import { requireModuleAccess } from "@/lib/moduleAccessServer";

export const metadata = { title: "Contracts" };
export const dynamic = "force-dynamic";

/**
 * CONTRACTS (Suren, Aug 25): "the contract repository has to be in one place
 * and both the systems have to use the same place… this interface should enter
 * the data, because this is where we are logically closing."
 *
 * Admin-only for now, like every module that shipped that day.
 */
export default async function ContractsPage() {
  await requireModuleAccess("/contracts");
  await requireServerMemberScope();
  await initializeLiveOfferings().catch(() => undefined);
  const live = getDataMode() === "live";
  const workspace = process.env.FREYR_WORKSPACE_ID;
  const [state, me, opportunities, perf, directory] = await Promise.all([
    readContracts(),
    getCurrentUser(),
    readOpportunities()
      .then((s) => s.opportunities)
      .catch(() => []),
    /* The goal list the signer picks from. Suren, Aug 18: a signed contract
       is what produces booked revenue, and Anir, Aug 26: "the person picks
       the goal" — so the form needs the whole Goal Master to offer. */
    readPerformance().catch(() => null),
    live && workspace ? listWorkspaceAccess(workspace).catch(() => null) : null,
  ]);
  const offeringName = new Map(
    listOfferings().map((o) => [o.id, o.offering_name])
  );

  const members = live
    ? [
        ...new Set(
          (directory?.members ?? [])
            .filter((m) => m.active && m.accountType === "real")
            .map((m) => m.name.trim())
            .filter(Boolean)
        ),
      ].sort((a, b) => a.localeCompare(b))
    : ["Elena Rossi", "Omar Haddad", "Nina Kowalski", "Marcus Chen"];

  return (
    <ContractsModule
      state={state}
      canWrite={me.role === "admin"}
      members={members}
      meName={me.name}
      goals={(perf?.goals ?? []).map((g) => ({
        id: g.id,
        name: g.name,
        year: g.year,
        type: g.type,
      }))}
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
          status: line?.status ?? o.status,
          owner: o.owner,
        };
      })}
    />
  );
}
