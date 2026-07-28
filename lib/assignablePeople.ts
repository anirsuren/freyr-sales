import "server-only";

import { listOfferingPeople } from "./offerings";
import { getCurrentUser } from "./currentUser";
import { cookies } from "next/headers";
import { listWorkspaceAccess } from "./accessStore";
import { ACCESS_COOKIE, verifyAccessGrant } from "./accessControl";

export type AssignablePerson = {
  name: string;
  role?: string;
  email?: string;
  /** Set when this person holds a real account, so permissions can key off it. */
  memberId?: string;
};

/**
 * EVERY PERSON YOU CAN ASSIGN, with their account attached.
 *
 * Assigning a contact is not free-text data entry: these are colleagues with
 * real accounts, and what gets assigned decides who is reachable and, in time,
 * who is permitted (Anir, Jul 28: "this is real people. People who have
 * accounts are going to get permissions based on this, so it should have a
 * dropdown with all the people... why would I want to enter their email and
 * phone? That should automatically be tied to that account").
 *
 * So the workspace's own account list leads, carrying each person's id, email
 * and role. The names already living in the offerings catalogue are merged in
 * behind it, because Suren's sheet named SMEs who may not have signed in yet
 * and dropping them would lose real contacts. A directory lookup that fails —
 * no Supabase in mock mode, no grant — degrades to the catalogue rather than
 * breaking the page.
 */
export async function listAssignablePeople(): Promise<AssignablePerson[]> {
  const byKey = new Map<string, AssignablePerson>();
  const put = (p: AssignablePerson) => {
    const key = p.name.trim().toLowerCase();
    if (!key) return;
    const prev = byKey.get(key);
    // An account always wins over a bare catalogue name.
    if (!prev || (!prev.memberId && p.memberId)) byKey.set(key, { ...prev, ...p });
  };

  try {
    const jar = await cookies();
    const grant = await verifyAccessGrant(jar.get(ACCESS_COOKIE)?.value);
    if (grant?.workspaceId) {
      const dir = await listWorkspaceAccess(grant.workspaceId);
      for (const m of dir.members || [])
        put({
          name: m.name || m.email || "",
          role: roleLabel(m.role),
          email: m.email || undefined,
          memberId: m.id,
        });
    }
  } catch {
    // No directory available in this mode. The catalogue below still applies.
  }

  const me = await getCurrentUser().catch(() => null);
  if (me?.name) put({ name: me.name, email: me.email || undefined, memberId: me.memberId || undefined });

  for (const p of listOfferingPeople()) put(p);

  return Array.from(byKey.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function roleLabel(role: string): string {
  if (role === "admin") return "Workspace admin";
  if (role === "editor") return "Offering editor";
  return "Sales";
}
