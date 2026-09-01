import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getDb } from "@/lib/db";
import { readOpportunities } from "@/lib/opportunities";
import { buildOpportunity360 } from "@/lib/opportunity360";
import { getRole } from "@/lib/role";
import { requireModuleAccess } from "@/lib/moduleAccessServer";
import { requireServerMemberScope } from "@/lib/memberScope";
import { getCurrentUser } from "@/lib/currentUser";
import { readPrivileges } from "@/lib/privileges";
import { readRecordTeams } from "@/lib/recordTeams";
import { mayTouchOpportunity } from "@/lib/recordAccess";
import { canOpenModule, moduleWriteRefusal } from "@/lib/moduleAccessServer";
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
  const [customers, contacts] = await Promise.all([
    db.customers.list().catch(() => []),
    db.contacts.list().catch(() => []),
  ]);
  const bands = await buildOpportunity360(deal.id, role);

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

  const mayCreateSolutioning =
    (await canOpenModule("/solutioning")) &&
    !(await moduleWriteRefusal("/solutioning"));

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
        subtitle="The deal's own details, and everything hanging off it: contracts, submissions, presentations, meetings and the work asked of solutioning."
      />
      <div className="mt-5">
        <DealEditScreen
          deal={deal}
          bands={bands}
          mayEdit={verdict.mayEdit}
          why={verdict.why}
          createOptions={
            mayCreateSolutioning
              ? {
                  customers: customers.map((c) => ({
                    id: c.id,
                    name: c.company_name ?? "",
                  })),
                  opportunities: opportunities.map((o) => ({
                    id: o.id,
                    label: o.name || `${o.customer} deal`,
                    customer: o.customer,
                    customerId: o.customerId ?? null,
                  })),
                  members,
                  contacts: contacts.map((c) => ({
                    id: c.id,
                    name: c.full_name,
                    customerId: c.customer_id ?? null,
                    title: c.job_title ?? "",
                  })),
                  meName: me.name,
                }
              : null
          }
        />
      </div>
    </div>
  );
}
