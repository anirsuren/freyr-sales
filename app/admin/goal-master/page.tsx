import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { getRole } from "@/lib/role";
import { getDataMode } from "@/lib/dataMode";
import { requireModuleAccess } from "@/lib/moduleAccessServer";
import { readPerformance } from "@/lib/performance";
import { listWorkspaceAccess } from "@/lib/accessStore";
import { isManagerOrAdmin } from "@/lib/moduleAccess";
import { PerformanceModule } from "@/components/performance/PerformanceModule";

/**
 * THE GOAL MASTER IS AN ADMIN SCREEN.
 *
 * Suren, Aug 29: "Goal master is also an admin function, right? Adding goals
 * which are the master goals — this goal master has to go in admin function, so
 * bring the goal master there... This is an execution screen [Performance],
 * this is an admin screen. No more assigning should happen here; let the
 * assigning happen in the admin screen."
 *
 * The Performance rooms stay exactly where they are and keep READING the plan —
 * "what about the goals page? Let this be here, man." What moved is the screen
 * that WRITES it. /performance/goal-master redirects here so nothing anybody
 * bookmarked breaks.
 *
 * It renders the same component the Performance page did, in admin chrome: no
 * org/groups/people selector, because the Admin tab strip is already the
 * selector one level up.
 */

export const metadata = { title: "Goal Master" };
export const dynamic = "force-dynamic";

export default async function AdminGoalMasterPage() {
  await requireModuleAccess("/admin");
  const role = await getRole();
  if (role !== "admin") notFound();

  const live = getDataMode() === "live";
  const workspace = process.env.FREYR_WORKSPACE_ID;
  const meFirst = await getCurrentUser();
  const [state, directory] = await Promise.all([
    readPerformance(live ? undefined : meFirst.name),
    live && workspace
      ? listWorkspaceAccess(workspace).catch(() => null)
      : null,
  ]);

  const memberNames = [
    ...new Set(
      (directory?.members ?? [])
        .filter((m) => m.active && m.accountType === "real")
        .map((m) => m.name.trim())
        .filter(Boolean)
    ),
  ].sort((a, b) => a.localeCompare(b));

  const memberRoles: Record<string, string> = {};
  for (const m of directory?.members ?? []) {
    if (m.name?.trim() && m.role) memberRoles[m.name.trim()] = m.role;
  }

  return (
    /* NO BACK ARROW (Anir, Aug 29: "what do you mean, all admin? Why is that
       back arrow even there? I just feel like that back arrow should not even
       be there"). He is right: the sidebar shows Admin with Goal Master under
       it, so this is a sibling page in a section you are already standing in,
       not somewhere you drilled into. The arrow implied a trail that does not
       exist, and it was holding a whole row open above the content. */
    <div>
      <PerformanceModule
        initial={state}
        live={live}
        meName={meFirst.name}
        isManager={isManagerOrAdmin(role)}
        isAdmin
        memberNames={memberNames}
        memberRoles={memberRoles}
        routeTab="org"
        routeMaster
        chrome="admin"
      />
    </div>
  );
}
