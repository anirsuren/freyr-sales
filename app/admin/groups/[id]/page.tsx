import { notFound, redirect } from "next/navigation";
import { getRole } from "@/lib/role";
import { requireModuleAccess } from "@/lib/moduleAccessServer";
import { readPerformance } from "@/lib/performance";
import { readPrivileges } from "@/lib/privileges";
import { listWorkspaceAccess } from "@/lib/accessStore";
import { GroupDetail } from "@/components/admin/GroupDetail";

/**
 * ONE GROUP, ON ITS OWN SCREEN.
 *
 * Suren, Aug 29: "I don't want expansion, I don't like this, I don't need
 * expansion at all. The group is there, he clicks on the group, this screen
 * goes away, put all the people in the group and then have a mechanism for the
 * group to be assigned goals... I don't want to see all the other group guys.
 * When I'm not focusing on other things I'm seeing all the other things and I'm
 * getting lost."
 *
 * So opening a group is a navigation, not a fold. The list is gone while you
 * are in here, and what is on the screen is this group's people and this
 * group's goals — nothing else to read past.
 */

export const dynamic = "force-dynamic";

export default async function AdminGroupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireModuleAccess("/admin");
  const role = await getRole();
  if (role !== "admin") notFound();

  const { id } = await params;
  const [perf, privileges] = await Promise.all([
    readPerformance().catch(() => null),
    readPrivileges().catch(() => null),
  ]);
  const group = perf?.groups.find((g) => g.id === id);
  /* A MISSING GROUP LANDS ON THE GROUPS LIST, never on a dead end (Anir,
     Sep 4). The role gate above stays a 404 — that one is hiding a surface,
     not mislaying a record. */
  if (!perf || !group) redirect("/admin/groups");

  /* Everyone who could be added, so the picker is not limited to whoever is
     already in the group. Real accounts only — a group of placeholder rows
     carries placeholder goals. */
  const workspace = process.env.FREYR_WORKSPACE_ID;
  const directory = workspace
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

  return (
    <GroupDetail
      state={perf}
      groupId={group.id}
      memberNames={memberNames}
      groupTypeLabel={privileges?.groupTypes[group.id] ?? null}
    />
  );
}
