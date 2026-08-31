import { SolutioningModule } from "@/components/solutioning/SolutioningModule";
import { readSolutioning } from "@/lib/solutioning";
import { readOpportunities } from "@/lib/opportunities";
import { getDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/currentUser";
import { getDataMode } from "@/lib/dataMode";
import { listWorkspaceAccess } from "@/lib/accessStore";
import { requireServerMemberScope } from "@/lib/memberScope";
import {
  moduleCreateRefusal,
  moduleWriteRefusal,
  requireModuleAccess,
} from "@/lib/moduleAccessServer";

export const metadata = { title: "Solutioning" };
export const dynamic = "force-dynamic";

/**
 * SOLUTIONING (Suren, Aug 24): the requests room. Sales asks for a
 * presentation, a submission or a meeting; the Solutioning team picks it up,
 * builds the documents, and the requester closes it. This page is the solution
 * team's front door — "the solutioning guy will not come to the customer
 * module, he'll come to the solutioning module and see all the requests."
 */
export default async function SolutioningPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  /* Which room the sidebar sent us to. See the Solutioning entries in
     components/layout/Sidebar. */
  const { tab } = await searchParams;
  await requireModuleAccess("/solutioning");
  await requireServerMemberScope();
  const live = getDataMode() === "live";
  const workspace = process.env.FREYR_WORKSPACE_ID;
  const db = getDb();
  const [state, me, customers, opportunities, directory] = await Promise.all([
    readSolutioning(),
    getCurrentUser(),
    db.customers.list().catch(() => []),
    readOpportunities()
      .then((s) => s.opportunities)
      .catch(() => []),
    live && workspace ? listWorkspaceAccess(workspace).catch(() => null) : null,
  ]);

  /* The people pickers: real workspace accounts in live mode — never invented
     names on real data. Mock offers the sample cast the sample requests are
     already staffed by. */
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
    <SolutioningModule
      state={state}
      room={tab === "submissions" || tab === "presentations" ? tab : "requests"}
      meRole={me.role}
      /* THE ROOM DECIDES WHICH QUESTION (see the note in the API route).
         Requests is the module's inbound — anybody who may write it may raise
         one. Submissions and presentations are the work itself, and starting
         one is the owner's. */
      canCreate={
        tab === "submissions" || tab === "presentations"
          ? /* Ask about THIS room's privilege, not the module's. Submissions
               and Presentations each have their own, and asking "/solutioning"
               asked about Solution requests for all three. */
            !(await moduleCreateRefusal(`/solutioning?tab=${tab}`))
          : !(await moduleWriteRefusal("/solutioning"))
      }
      members={members}
      customers={customers
        .map((c) => ({ id: c.id, name: c.company_name }))
        .sort((a, b) => a.name.localeCompare(b.name))}
      opportunities={opportunities.map((o) => ({
        id: o.id,
        label: o.name || `${o.customer} deal`,
        customer: o.customer,
        customerId: o.customerId ?? null,
      }))}
    />
  );
}
