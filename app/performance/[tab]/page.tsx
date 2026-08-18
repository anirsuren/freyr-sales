import { PerformanceModule } from "@/components/performance/PerformanceModule";
import { readPerformance } from "@/lib/performance";
import { getDataMode } from "@/lib/dataMode";
import { getCurrentUser } from "@/lib/currentUser";
import { getRole } from "@/lib/role";
import { isManagerOrAdmin } from "@/lib/moduleAccess";
import { visibleNamesFor } from "@/lib/performanceShared";
import { requireServerMemberScope } from "@/lib/memberScope";
import { listWorkspaceAccess } from "@/lib/accessStore";
import { requireModuleAccess } from "@/lib/moduleAccessServer";
import { notFound, redirect } from "next/navigation";

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
/** The four addresses, and which of them each role may open. */
const ROUTE_TABS = ["org", "groups", "people"] as const;
type RouteTab = (typeof ROUTE_TABS)[number];

export default async function PerformanceTabPage({
  params,
}: {
  params: Promise<{ tab: string }>;
}) {
  const { tab: raw } = await params;
  const master = raw === "goal-master";
  // The Activity Master lives on the Admin page now (Suren, Aug 18: "you
  // should have admin module where all these are configured"). The old
  // address keeps working for anyone who bookmarked it.
  if (raw === "activity-master") redirect("/admin?tab=activity");
  if (!master && !ROUTE_TABS.includes(raw as RouteTab)) notFound();
  await requireModuleAccess("/performance");
  await requireServerMemberScope();
  const live = getDataMode() === "live";
  const workspace = process.env.FREYR_WORKSPACE_ID;
  const [state, me, role, directory] = await Promise.all([
    readPerformance(),
    getCurrentUser(),
    getRole(),
    live && workspace ? listWorkspaceAccess(workspace).catch(() => null) : null,
  ]);
  const manager = isManagerOrAdmin(role);
  // The scoped copy for non-managers — same rule as the API (Suren, Aug 12:
  // a group owner sees their group, an individual sees themself).
  const visible = manager ? null : visibleNamesFor(state, me.name);
  const scoped = visible
    ? {
        ...state,
        goals: state.goals.map((g) => ({
          ...g,
          subgoals: g.subgoals.map((s) => ({
            ...s,
            people: s.people.filter((p) => visible.has(p.name.trim())),
          })),
          assignments: (g.assignments ?? []).filter((a) =>
            visible.has(a.person.trim())
          ),
        })),
        groups: state.groups.filter(
          (g) =>
            visible.has(g.head.trim()) ||
            g.members.some((m) => visible.has(m.trim()))
        ),
        actuals: state.actuals.filter((a) => visible.has(a.person.trim())),
      }
    : state;
  const memberNames = [
    ...new Set(
      (directory?.members ?? [])
        .filter((m) => m.active && m.accountType === "real")
        .map((m) => m.name.trim())
        .filter(Boolean)
    ),
  ].sort((a, b) => a.localeCompare(b));
  // Name → role, so a picker can say WHO someone is rather than just what
  // they are called (Anir, Aug 15: "I feel like it should show a role").
  const memberRoles: Record<string, string> = {};
  for (const m of directory?.members ?? []) {
    if (m.active && m.accountType === "real" && m.name.trim()) {
      memberRoles[m.name.trim()] = m.role;
    }
  }
  // GATED HERE, NOT ONLY IN THE UI. Hiding a tab is a courtesy; refusing the
  // route is the rule (Suren, Aug 12: a group owner sees their group, an
  // individual sees themself). The Goal Master is open to everyone — it is how
  // anybody picks up a goal.
  const iHeadAGroup = state.groups.some(
    (g) => g.head.trim().toLowerCase() === me.name.trim().toLowerCase()
  );
  const allowed: RouteTab[] = manager
    ? [...ROUTE_TABS]
    : iHeadAGroup
      ? ["groups", "people"]
      : ["people"];
  if (!master && !allowed.includes(raw as RouteTab))
    redirect(`/performance/${allowed[0]}`);

  return (
    <PerformanceModule
      routeTab={master ? allowed[0] : (raw as RouteTab)}
      routeMaster={master}
      initial={scoped}
      live={live}
      meName={me.name}
      isManager={manager}
      isAdmin={role === "admin"}
      memberNames={memberNames}
      memberRoles={memberRoles}
    />
  );
}
