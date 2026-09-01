import { LeadsModule } from "@/components/leads/LeadsModule";
import { readLeads } from "@/lib/leads";
import { getDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/currentUser";
import { getDataMode } from "@/lib/dataMode";
import { listWorkspaceAccess } from "@/lib/accessStore";
import { requireServerMemberScope } from "@/lib/memberScope";
import { requireModuleAccess, moduleWriteRefusal } from "@/lib/moduleAccessServer";

export const metadata = { title: "Leads" };
export const dynamic = "force-dynamic";

/**
 * LEADS (Suren, Aug 25): "there will be thousands of leads… out of those only
 * hundreds can be your opportunities. That is why you want to keep something
 * as a lead — so that you don't discuss those 3000 items, you discuss only the
 * opportunity."
 *
 * Admin-only for now, like every module that shipped that day (Anir's standing
 * rule). The guard is here AND on /api/leads.
 */
export default async function LeadsPage() {
  await requireModuleAccess("/leads");
  await requireServerMemberScope();
  const live = getDataMode() === "live";
  const workspace = process.env.FREYR_WORKSPACE_ID;
  const db = getDb();
  const [state, me, customers, directory] = await Promise.all([
    readLeads(),
    getCurrentUser(),
    db.customers.list().catch(() => []),
    live && workspace ? listWorkspaceAccess(workspace).catch(() => null) : null,
  ]);

  /* Real workspace accounts in live mode — never invented names on real data. */
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
    <LeadsModule
      state={state}
      live={live}
      /* THE TABLE DECIDES, NOT A HARDCODED ROLE (found in the loop, Sep 1).
         `me.role === "admin"` ignores the privilege table, so this module
         could be granted to somebody in the Admin grid and granting it changed
         no button — the same defect Submissions and Presentations had until
         Aug 31, and Revenue accruals until today. */
      canWrite={!(await moduleWriteRefusal("/leads"))}
      members={members}
      customers={customers
        .map((c) => ({ id: c.id, name: c.company_name }))
        .sort((a, b) => a.name.localeCompare(b.name))}
    />
  );
}
