import { PageHeader } from "@/components/layout/PageHeader";
import { AdminTabs } from "@/components/admin/AdminTabs";
import type { AdminRouteTab } from "@/lib/adminTabs";
import { listWorkspaceAccess } from "@/lib/accessStore";
import { getRole } from "@/lib/role";
import { requireModuleAccess } from "@/lib/moduleAccessServer";
import { readPerformance } from "@/lib/performance";
import { actualValue } from "@/lib/performanceShared";
import { getDataMode } from "@/lib/dataMode";

/**
 * ONE ADMIN SCREEN, FIVE ADDRESSES.
 *
 * Anir, Aug 15, about Performance: "the 4 page should have different / within
 * the /performance." Performance got that; Admin did not, and its five rooms
 * stayed one page with a remembered tab — so the address bar never moved,
 * nothing was linkable, and Back walked you out of Admin entirely instead of
 * to the room you came from (Anir, Aug 31: "can u create different pages for
 * these tabs... i thought i already told u to do that").
 *
 * Every route under /admin renders this with its own tab. The data read is
 * identical whichever room you land in, so it lives here once rather than
 * copied into five page files.
 */
export async function AdminScreen({ tab }: { tab: AdminRouteTab }) {
  await requireModuleAccess("/admin");
  const role = await getRole();
  const workspace = process.env.FREYR_WORKSPACE_ID;
  const directory =
    role === "admin" && workspace
      ? await listWorkspaceAccess(workspace).catch(() => null)
      : null;
  const memberNames = [
    ...new Set(
      (directory?.members ?? [])
        .filter((m) => m.active && m.accountType === "real")
        .map((m) => m.name.trim())
        .filter(Boolean)
    ),
  ].sort((a, b) => a.localeCompare(b));

  // The Activity Master's goal chips need each goal's target and overall
  // progress — read once here, exactly as the Performance page computed it.
  const perf = role === "admin" ? await readPerformance().catch(() => null) : null;
  const activityGoals = (perf?.goals ?? []).map((g) => ({
    id: g.id,
    name: g.name,
    year: g.year,
    type: g.type,
    target: g.target ?? 0,
    actual: perf ? actualValue(perf.actuals, g, { rates: perf.rates }) : 0,
  }));
  const live = getDataMode() === "live";

  return (
    <div>
      {role === "admin" ? (
        <AdminTabs
          routeTab={tab}
          memberNames={memberNames}
          activityGoals={activityGoals}
          live={live}
        />
      ) : (
        <>
          <PageHeader
            title="Admin"
            subtitle="Running the workspace: who is what, and which departments they belong to."
          />
          <div className="rounded-2xl border border-border-light bg-white px-6 py-14 text-center text-[13px] text-text-secondary">
            Admin tools are open to workspace admins.
          </div>
        </>
      )}
    </div>
  );
}
