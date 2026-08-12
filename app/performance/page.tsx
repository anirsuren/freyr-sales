import { PerformanceModule } from "@/components/performance/PerformanceModule";
import { readPerformance } from "@/lib/performance";
import { getDataMode } from "@/lib/dataMode";
import { getCurrentUser } from "@/lib/currentUser";
import { requireServerMemberScope } from "@/lib/memberScope";
import { listWorkspaceAccess } from "@/lib/accessStore";
import { requireModuleAccess } from "@/lib/moduleAccessServer";

export const metadata = { title: "Performance" };
export const dynamic = "force-dynamic";

/**
 * PERFORMANCE MANAGEMENT (Suren, Aug 11): the goal master, the org goal plan,
 * and every group and person's numbers. The title itself is the room picker
 * (same pattern as Market Intel), so the module owns its whole header.
 *
 * People pickers are fed the REAL workspace accounts in live mode — "you
 * can't put fake accounts on real mode" (Anir).
 */
export default async function PerformancePage() {
  await requireModuleAccess("/performance");
  await requireServerMemberScope();
  const live = getDataMode() === "live";
  const workspace = process.env.FREYR_WORKSPACE_ID;
  const [state, me, directory] = await Promise.all([
    readPerformance(),
    getCurrentUser(),
    live && workspace ? listWorkspaceAccess(workspace).catch(() => null) : null,
  ]);
  const memberNames = [
    ...new Set(
      (directory?.members ?? [])
        .filter((m) => m.active && m.accountType === "real")
        .map((m) => m.name.trim())
        .filter(Boolean)
    ),
  ].sort((a, b) => a.localeCompare(b));
  return (
    <PerformanceModule
      initial={state}
      live={live}
      meName={me.name}
      memberNames={memberNames}
    />
  );
}
