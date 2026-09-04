import { notFound } from "next/navigation";
import { estimatedTcvOf } from "@/lib/opportunitiesShared";
import { ArrowLeft } from "lucide-react";
import { getDb } from "@/lib/db";
import { readOpportunities } from "@/lib/opportunities";
import { listOfferings } from "@/lib/offerings";
import { getRole } from "@/lib/role";
import {
  canOpenModule,
  moduleWriteRefusal,
  recordWriteRefusal,
  requireModuleAccess,
} from "@/lib/moduleAccessServer";
import { readRevenueAccruals } from "@/lib/revenueAccruals";
import { requireServerMemberScope } from "@/lib/memberScope";
import { getCurrentUser } from "@/lib/currentUser";
import { readPrivileges } from "@/lib/privileges";
import { readRecordTeams, teamFor } from "@/lib/recordTeams";
import { mayTouchOpportunity } from "@/lib/recordAccess";
import { listWorkspaceAccess } from "@/lib/accessStore";
import { getDataMode } from "@/lib/dataMode";
import { SmartBack } from "@/components/ui/BackButton";
import { PageHeader } from "@/components/layout/PageHeader";
import { DealEditScreen } from "@/components/opportunities/DealEditScreen";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { opportunities } = await readOpportunities();
  const deal = opportunities.find((o) => o.id === id);
  return { title: deal ? `Edit ${deal.name || deal.customer}` : "Edit deal" };
}

/**
 * EDITING A DEAL IS A PLACE YOU GO, NOT A BOX ON TOP OF WHERE YOU WERE.
 *
 * Anir, Sep 1: "the edit deal is actually not supposed to be a pop-up.
 * Remember what I said: it should be like the offerings page... We look at the
 * offerings pages, just copy that, and then, if I want to create a new
 * contract, etc., within the edit deal, then it can be a pop-up."
 *
 * Which is the right way round: eleven fields and six sections of records was
 * always more than a dialog could hold, and pinning that dialog's height only
 * made the scrolling worse. A page has room, keeps its own URL so it can be
 * linked and reloaded, and leaves the modal for the thing a modal is good at —
 * a short interruption you finish and dismiss.
 *
 * The guard is the same one the Edit button asks, because hiding a button
 * leaves the URL open.
 */
export default async function EditDealPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireModuleAccess("/opportunities");
  await requireServerMemberScope();
  const { id } = await params;

  const [{ opportunities }, role, me, privileges, teams] = await Promise.all([
    readOpportunities(),
    getRole(),
    getCurrentUser(),
    readPrivileges(),
    readRecordTeams(),
  ]);
  const deal = opportunities.find((o) => o.id === id);
  if (!deal) notFound();

  const db = getDb();
  const [customers, offerings] = await Promise.all([
    db.customers.list().catch(() => []),
    listOfferings(),
  ]);

  const customerId =
    customers.find(
      (c) =>
        (c.company_name ?? "").trim().toLowerCase() ===
        deal.customer.trim().toLowerCase()
    )?.id ?? null;

  /* The same question the Edit button asks on the deal page, asked again here
     because hiding a button leaves the URL open. */
  const verdict = mayTouchOpportunity({
    privileges,
    teams,
    person: me.name,
    role,
    opportunityId: deal.id,
    ...(customerId ? { customerId } : {}),
  });

  /* Real names in Real mode, the sample cast in Mock — identical to the deal
     page, so the two pickers offer the same people. */
  const live = getDataMode() === "live";
  const workspace = process.env.FREYR_WORKSPACE_ID;
  const directory =
    live && workspace
      ? await listWorkspaceAccess(workspace).catch(() => null)
      : null;
  const members = live
    ? [
        ...new Set(
          (directory?.members ?? [])
            .filter((m) => m.active && m.accountType === "real")
            .map((m) => m.name.trim())
            .filter(Boolean)
        ),
      ].sort((a, b) => a.localeCompare(b))
    : [
        "Elena Rossi",
        "Omar Haddad",
        "Nina Kowalski",
        "Marcus Chen",
        "Grace Liu",
        "Daniel Foster",
      ];

  /* The People section is part of the form, so this door carries it too, and
     asks the same question the route asks. One form, one set of facts,
     whichever way somebody came in. */
  const mayChangeTeam =
    verdict.mayEdit &&
    !(await recordWriteRefusal("/opportunities", { id: deal.id }));

  /**
   * THE ACCRUAL, FOR THE SCHEDULER ON THIS PAGE. Asked the same way the deal
   * page asks it and the same way /api/revenue-accruals asks before it saves,
   * so a person who may only read gets the months without a Save they cannot
   * use. One offering per opportunity (Suren, Aug 17), so the first line is
   * the line.
   */
  const mayPlanAccrual =
    (await canOpenModule("/revenue-accruals")) &&
    !(await moduleWriteRefusal("/revenue-accruals"));
  const accrualPlan = (await canOpenModule("/revenue-accruals"))
    ? ((await readRevenueAccruals().catch(() => null))?.plans.find(
        (p) => p.opportunityId === deal.id
      ) ?? null)
    : null;
  const accrualLine = (deal.lines ?? [])[0];
  const accrualOfferingId = accrualLine?.offeringId ?? deal.offeringIds[0];
  const accrualOfferingLabel = accrualOfferingId
    ? (offerings.find((o) => o.id === accrualOfferingId)?.offering_name ??
      accrualOfferingId)
    : (accrualLine?.offeringLabel ?? deal.offeringLabels[0]);
  const accrualSignDate = accrualLine?.estSignDate ?? deal.estSignDate;

  return (
    <div className="mx-auto max-w-[1100px]">
      <SmartBack
        fallback={`/opportunities/${deal.id}`}
        className="mb-4 inline-flex cursor-pointer items-center gap-1.5 text-[13px] text-text-secondary hover:text-blue-primary"
      >
        <ArrowLeft size={15} strokeWidth={1.8} /> Back to deal
      </SmartBack>
      <PageHeader
        title={`Edit ${deal.name || deal.customer}`}
        /* The sections of records that used to sit under the form are gone
           (Suren, Sep 1: "The edit deal has all these things below, right?
           These things we also don't need, right, because the tabs are already
           here"), so the line that promised them had to go with them. */
        subtitle="The deal's own details. Contracts, submissions, presentations, meetings and accruals each have their own tab on the deal itself."
      />
      <div className="mt-5">
        <DealEditScreen
          deal={deal}
          mayEdit={verdict.mayEdit}
          accrual={{
            mayPlan: mayPlanAccrual,
            plan: accrualPlan,
            deal: {
              id: deal.id,
              name: deal.name || `${deal.customer} deal`,
              customer: deal.customer,
              ...(deal.customerId ? { customerId: deal.customerId } : {}),
              ...(accrualOfferingId ? { offeringId: accrualOfferingId } : {}),
              ...(accrualOfferingLabel
                ? { offeringLabel: accrualOfferingLabel }
                : {}),
              /* THE DEAL'S ACTUAL MONEY, NOT ITS LEGACY COLUMN.
                 Found in the loop: a deal created with Estimated TCV and no
                 `value` reached the scheduler with a contract value of ZERO,
                 so Spread evenly divided nothing across the months and the
                 over-value cap — which only applies when the value is above 0
                 — never fired. Estimated TCV is the MANDATORY money field
                 since Manoj's item 2; `value` is the column it replaced.
                 `estimatedTcvOf` is the one helper that knows the order:
                 typed TCV first, the pipeline value behind it. */
              value: estimatedTcvOf(deal) ?? deal.value ?? 0,
              ...(deal.status ? { status: deal.status } : {}),
              ...(accrualSignDate ? { estSignDate: accrualSignDate } : {}),
              ...(deal.currency ? { currency: deal.currency } : {}),
            },
          }}
          why={verdict.why}
          meName={me.name}
          people={members}
          team={teamFor(teams, "opportunity", deal.id)}
          mayChangeTeam={mayChangeTeam}
          customers={customers.map((c) => ({
            id: c.id,
            name: c.company_name ?? "",
          }))}
          offerings={offerings.map((o) => ({
            id: o.id,
            name: o.offering_name,
            type: o.offering_type,
          }))}
        />
      </div>
    </div>
  );
}
