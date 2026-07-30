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
  /** The profile URL they saved in Settings. Never generated from their name. */
  linkedin?: string | null;
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
      // THE LINKEDIN CHIP HAD NO SOURCE. Every person object reached the UI with
      // `linkedin` undefined, so the chip could not appear for anybody however
      // many profiles were filled in (Anir, Jul 29: "LinkedIn: just make sure
      // that's there"). It lives on each member's own prefs row, saved from
      // Settings › Profile, so it is read here in one query for the workspace
      // rather than a lookup per card.
      const profiles = await linkedInByMember(grant.workspaceId);
      for (const m of dir.members || [])
        put({
          name: m.name || m.email || "",
          role: roleLabel(m.role),
          email: m.email || undefined,
          memberId: m.id,
          linkedin: profiles.get(m.id) || null,
        });
    }
  } catch {
    // No directory available in this mode. The catalogue below still applies.
  }

  const me = await getCurrentUser().catch(() => null);
  if (me?.name)
    put({
      name: me.name,
      // WITHOUT A ROLE HERE, YOU ARE THE BLANK ROW. Every colleague arrived
      // from the directory carrying a role label and the signed-in user did
      // not, so the picker showed a title for everyone except the person
      // reading it (Anir, Jul 29: "it says I'm the owner; it doesn't say he's
      // the owner. I don't understand"). Their own account role is the honest
      // answer, and the directory entry above still wins when it exists.
      role: roleLabel(me.role || ""),
      email: me.email || undefined,
      memberId: me.memberId || undefined,
    });

  for (const p of listOfferingPeople()) put(p);

  return Array.from(byKey.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * user_id → the LinkedIn URL they saved, for one workspace.
 *
 * Service-role read of agent_prefs, the same table the LinkedIn enrichment
 * writes. A failure is not fatal: no chip is strictly better than a wrong one.
 */
async function linkedInByMember(
  workspaceId: string
): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  )
    return found;
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const { data } = await createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
      .from("agent_prefs")
      .select("user_id, linkedin_url")
      .eq("workspace_id", workspaceId);
    for (const row of (data || []) as {
      user_id: string;
      linkedin_url: string | null;
    }[]) {
      const url = (row.linkedin_url || "").trim();
      if (url) found.set(row.user_id, url);
    }
  } catch {
    // Column or table missing in this environment: no chips, no crash.
  }
  return found;
}

function roleLabel(role: string): string {
  if (role === "admin") return "Workspace admin";
  if (role === "editor") return "Offering editor";
  return "Sales";
}
