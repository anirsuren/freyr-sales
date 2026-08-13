import { notFound } from "next/navigation";
import { GoalZoom } from "@/components/performance/GoalZoom";
import { readPerformance } from "@/lib/performance";
import { getCurrentUser } from "@/lib/currentUser";
import { getRole } from "@/lib/role";
import { isManagerOrAdmin } from "@/lib/moduleAccess";
import { visibleNamesFor } from "@/lib/performanceShared";
import { requireServerMemberScope } from "@/lib/memberScope";
import { requireModuleAccess } from "@/lib/moduleAccessServer";

export const metadata = { title: "Goal" };
export const dynamic = "force-dynamic";

/**
 * ONE GOAL, ZOOMED (Suren, Aug 13): "you are in the big screen... something
 * becomes bigger and something becomes smaller." The box always holds one
 * level — a financial year, a half, a quarter, a month — and going deeper
 * refreshes the same space while the level above shrinks to a strip. Groups
 * and people fan out inside whatever period is in focus.
 *
 * Same visibility rule as the Performance page: managers see everyone, a
 * group owner their group, everyone else themself.
 */
export default async function GoalZoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireModuleAccess("/performance");
  await requireServerMemberScope();
  const { id } = await params;
  const [state, me, role] = await Promise.all([
    readPerformance(),
    getCurrentUser(),
    getRole(),
  ]);
  const goal = state.goals.find((g) => g.id === id);
  if (!goal) notFound();
  const manager = isManagerOrAdmin(role);
  const visible = manager ? null : visibleNamesFor(state, me.name);
  const scoped = visible
    ? {
        ...state,
        groups: state.groups.filter(
          (g) =>
            visible.has(g.head.trim()) ||
            g.members.some((m) => visible.has(m.trim()))
        ),
        actuals: state.actuals.filter((a) => visible.has(a.person.trim())),
      }
    : state;
  return <GoalZoom state={scoped} goalId={goal.id} meName={me.name} />;
}
