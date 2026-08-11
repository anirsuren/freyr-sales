import { PageHeader } from "@/components/layout/PageHeader";
import { PerformanceModule } from "@/components/performance/PerformanceModule";
import { readPerformance } from "@/lib/performance";
import { getDataMode } from "@/lib/dataMode";
import { getCurrentUser } from "@/lib/currentUser";
import { requireServerMemberScope } from "@/lib/memberScope";

export const metadata = { title: "Performance" };
export const dynamic = "force-dynamic";

/**
 * PERFORMANCE MANAGEMENT (Suren, Aug 11): the goal master, the org goal plan,
 * and every group and person's numbers — one module, three rooms. The page is
 * a thin server shell; the module itself is interactive throughout.
 */
export default async function PerformancePage() {
  await requireServerMemberScope();
  const [state, me] = await Promise.all([readPerformance(), getCurrentUser()]);
  return (
    <div className="space-y-5">
      <PageHeader
        title="Performance"
        subtitle="Company goals against their targets — from the organization, through every group, down to each person."
      />
      <PerformanceModule
        initial={state}
        live={getDataMode() === "live"}
        meName={me.name}
      />
    </div>
  );
}
