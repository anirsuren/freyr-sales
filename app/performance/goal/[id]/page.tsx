import { redirect } from "next/navigation";
import { GoalZoom } from "@/components/performance/GoalZoom";
import { readPerformance } from "@/lib/performance";
import { getCurrentUser } from "@/lib/currentUser";
import { getRole } from "@/lib/role";
import { isManagerOrAdmin } from "@/lib/moduleAccess";
import { visibleNamesFor } from "@/lib/performanceShared";
import { requireServerMemberScope } from "@/lib/memberScope";
import { requireModuleAccess } from "@/lib/moduleAccessServer";

/** The goal's own name in the tab. A static "Goal" made two open goals
 *  indistinguishable, which is the state you are most often in on this page
 *  since its whole purpose is comparing one against another (found Aug 14
 *  walking the flows). */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const state = await readPerformance();
  const goal = state.goals.find((g) => g.id === id);
  return { title: goal ? `${goal.name} · Performance` : "Goal" };
}

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
  // A goal id from the OTHER mode (mock ids after switching to Real, and the
  // reverse) must never strand anyone on a not-found screen — land on Org
  // performance where every goal of the current mode is one click away.
  if (!goal) redirect("/performance");
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
