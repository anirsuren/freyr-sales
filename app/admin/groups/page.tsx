import { AdminScreen } from "../adminScreen";

export const metadata = { title: "User groups · Admin" };
export const dynamic = "force-dynamic";

/**
 * USER GROUPS NEEDS ITS OWN FILE, not the [tab] route beside it: `groups` is
 * already a static segment (groups/[id] opens one group), and Next resolves a
 * static segment before a dynamic sibling — so /admin/groups would have 404'd
 * rather than falling through to [tab]. Same screen, same tab, explicit route.
 */
export default async function AdminGroupsRoute() {
  return <AdminScreen tab="groups" />;
}
