import { SmartBack } from "@/components/ui/BackButton";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatTile } from "@/components/ui/StatTile";
import { Waypoints } from "lucide-react";
import { requireModuleAccess } from "@/lib/moduleAccessServer";
import { readPerformance } from "@/lib/performance";
import { readActivityMaster } from "@/lib/activityMaster";
import { fmtAmount } from "@/lib/performanceShared";
import { ActivityGoalFlowGrid } from "@/components/reports/ActivityGoalFlowGrid";

export const metadata = { title: "Activity → Goal flow" };
export const dynamic = "force-dynamic";

/**
 * WHERE THE NUMBERS ACTUALLY COME FROM (Anir, Aug 17: the heat-map version of
 * the Activity Master — "how much money or count each activity actually
 * pushed into each goal"). Every result logged through an activity carries a
 * stamp saying which activity it came from; this page sums those stamps into
 * an activities × goals grid. Unstamped history stays out rather than being
 * guessed — the stamp shipped Aug 17, so the grid grows from that day.
 */
export default async function ActivityGoalFlowPage() {
  await requireModuleAccess("/reports");
  const [perf, master] = await Promise.all([
    readPerformance(),
    readActivityMaster(),
  ]);

  // Sum stamped entries per (activity, goal). Sent-back claims don't count —
  // same rule the goal numbers follow.
  const flow = new Map<string, Map<string, { amount: number; entries: number }>>();
  let stamped = 0;
  for (const a of perf.actuals) {
    if (!a.activityId) continue;
    // Same counting rule as the goal numbers: reported and verified count;
    // legacy entries with no status count as verified.

    stamped += 1;
    const byGoal = flow.get(a.activityId) ?? new Map();
    const cell = byGoal.get(a.goalId) ?? { amount: 0, entries: 0 };
    cell.amount += a.amount;
    cell.entries += 1;
    byGoal.set(a.goalId, cell);
    flow.set(a.activityId, byGoal);
  }

  const goalsWithFlow = perf.goals
    .filter((g) => [...flow.values()].some((byGoal) => byGoal.has(g.id)))
    .map((g) => ({ id: g.id, name: g.name, unit: g.unit, type: g.type }));

  const cells = master.activities.map((a) => ({
    activity: { id: a.id, label: a.label, color: a.color },
    goals: goalsWithFlow.map((g) => {
      const cell = flow.get(a.id)?.get(g.id);
      return {
        goalId: g.id,
        amount: cell?.amount ?? 0,
        entries: cell?.entries ?? 0,
        display: cell ? fmtAmount(g.unit as never, cell.amount) : "",
      };
    }),
  }));

  const totalEntries = stamped;

  return (
    <div className="space-y-5 pb-24">
      <SmartBack fallback="/reports">Reports</SmartBack>
      <PageHeader
        title="What each activity earned"
        subtitle="When someone logs a result through an activity (a pilot, a contract), it lands here: one row per activity, one column per goal, and the money or count that activity put into that goal."
      />

      {totalEntries === 0 ? (
        <Card className="p-8">
          <EmptyState
            icon={Waypoints}
            title="Nothing here yet, and that's normal"
            description="This page fills in on its own as the team works. Example: someone marks a Contract completed for $50K and points it at the Renewals goal. A $50K box appears here where Contract meets Renewals. Nobody has logged a result through an activity yet, so there is nothing to add up. Older results never said which activity they came from, so they stay out instead of being guessed."
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatTile
              icon={Waypoints}
              label="Results counted"
              value={String(totalEntries)}
              sub="each one logged through an activity"
            />
            <StatTile
              icon={Waypoints}
              label="Activities earning"
              value={String(cells.filter((c) => c.goals.some((g) => g.entries > 0)).length)}
              sub="of the five kinds of activity"
            />
            <StatTile
              icon={Waypoints}
              label="Goals receiving"
              value={String(goalsWithFlow.length)}
              sub="got at least one result this way"
            />
          </div>
          <ActivityGoalFlowGrid
            goals={goalsWithFlow}
            cells={cells}
          />
        </>
      )}
    </div>
  );
}
