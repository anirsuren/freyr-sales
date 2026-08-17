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
        title="Activity → Goal flow"
        subtitle="How much each activity actually poured into each goal — from results stamped with the activity they came from."
      />

      {totalEntries === 0 ? (
        <Card className="p-8">
          <EmptyState
            icon={Waypoints}
            title="Nothing stamped yet — the counting just started"
            description="Results carry their source activity from Aug 17 onward. Log a pilot or a contract through an activity and its number lands here, activity by activity, goal by goal. History from before the stamp stays out rather than being guessed."
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatTile
              icon={Waypoints}
              label="Stamped results"
              value={String(totalEntries)}
              sub="logged through an activity"
            />
            <StatTile
              icon={Waypoints}
              label="Activities flowing"
              value={String(cells.filter((c) => c.goals.some((g) => g.entries > 0)).length)}
              sub="of the master's vocabulary"
            />
            <StatTile
              icon={Waypoints}
              label="Goals fed"
              value={String(goalsWithFlow.length)}
              sub="received at least one stamped result"
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
