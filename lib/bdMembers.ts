import { getDataMode } from "./dataMode";
import { listWorkspaceAccess } from "./accessStore";
import { readPrivileges } from "./privileges";
import { SALES_TEAM } from "./salesTeam";

/**
 * WHO COUNTS AS A BD MEMBER, for the Owner field on a new customer (Manoj,
 * Sep 10: "Owner* (drop-down of all BD members)").
 *
 * Active real members whose role is BD Owner or BD Member, or who carry either
 * of those privilege badges, because privileges are held by the person and
 * the role is only the fallback. Mock mode uses the demo sales team.
 */
export type BdMember = { id: string | null; name: string; role: string };

const BD_ROLES = new Set(["bd_owner", "bd_member"]);

export async function listBdMembers(): Promise<BdMember[]> {
  if (getDataMode() === "mock") {
    return SALES_TEAM.map((name) => ({ id: null, name, role: "bd_member" }));
  }
  const workspace = process.env.FREYR_WORKSPACE_ID;
  if (!workspace) return [];
  const [directory, privileges] = await Promise.all([
    listWorkspaceAccess(workspace).catch(() => null),
    readPrivileges().catch(() => null),
  ]);
  const badges = privileges?.peoplePrivileges ?? {};
  const out: BdMember[] = [];
  for (const m of directory?.members ?? []) {
    if (!m.active || m.accountType !== "real") continue;
    const name = m.name.trim();
    if (!name) continue;
    const badge = (badges[name] ?? []).find((b) => BD_ROLES.has(b));
    if (!BD_ROLES.has(m.role) && !badge) continue;
    out.push({ id: m.id, name, role: BD_ROLES.has(m.role) ? m.role : (badge ?? "bd_member") });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
