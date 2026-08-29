import "server-only";

import { listOfferingPeople, type Offering } from "./offerings";
import { getCurrentUser } from "./currentUser";
import { cookies } from "next/headers";
import { listWorkspaceAccess } from "./accessStore";
import { ACCESS_COOKIE, verifyAccessGrant } from "./accessControl";
import { getDataMode } from "./dataMode";

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
    // Local Real mode deliberately runs without an auth/approval gate, but it
    // still points at the configured real workspace. Without this fallback the
    // picker silently collapsed to only the local demo identity and hid every
    // actual teammate (including Eswar). Production continues to require a
    // verified access grant; the service credential never reaches the browser.
    const workspaceId =
      grant?.workspaceId ||
      (process.env.NODE_ENV !== "production" && !process.env.AUTH_MODE
        ? process.env.FREYR_WORKSPACE_ID
        : undefined);
    if (workspaceId) {
      const dir = await listWorkspaceAccess(workspaceId);
      // THE LINKEDIN CHIP HAD NO SOURCE. Every person object reached the UI with
      // `linkedin` undefined, so the chip could not appear for anybody however
      // many profiles were filled in (Anir, Jul 29: "LinkedIn: just make sure
      // that's there"). It lives on each member's own prefs row, saved from
      // Settings › Profile, so it is read here in one query for the workspace
      // rather than a lookup per card.
      const profiles = await linkedInByMember(workspaceId);
      for (const m of dir.members || []) {
        // Deactivated rows are retained for audit history, not assignment.
        // Treating one as a selectable POC would put an account-shaped person
        // on a live offering even though that person can no longer sign in.
        if (!m.active) continue;
        // Account classification is explicit in Supabase. Never infer it from
        // a name or email address.
        if (getDataMode() === "live" && m.accountType !== "real") continue;
        put({
          name: m.name || m.email || "",
          role: roleLabel(m.role),
          email: m.email || undefined,
          memberId: m.id,
          linkedin: profiles.get(m.id) || null,
        });
      }
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

  // Catalogue POC names populate the demonstration, but a name in a sheet is
  // not a workspace identity. Live pickers must contain account-backed people
  // only; otherwise assigning "Inayat" would create a person-shaped record
  // with no account behind it. In-progress mode keeps the catalogue roster so
  // every interaction remains visible with sample data.
  if (getDataMode() === "mock") {
    for (const p of listOfferingPeople()) put(p);
  }

  return Array.from(byKey.values())
    .filter((person) => getDataMode() === "mock" || Boolean(person.memberId))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Remove every person-shaped offering field that is not backed by an active
 * workspace account. The stored catalogue deliberately keeps the historical
 * spreadsheet roster for Mock mode and for source-data recovery, but Real
 * mode may only present identities that can actually sign in.
 *
 * This is a read-time copy: it never mutates or persists the catalogue.
 * Permission checks must continue to use the stored offering and stable owner
 * member ids; this helper controls presentation and AI grounding only.
 */
export function redactUnverifiedOfferingPeople<T extends Offering>(
  offering: T,
  people: readonly AssignablePerson[]
): T {
  if (getDataMode() !== "live") return offering;

  const accounts = people.filter((person) => Boolean(person.memberId));
  const accountFor = (candidate: {
    name?: string | null;
    email?: string | null;
    memberId?: string | null;
  }) => {
    const memberId = (candidate.memberId || "").trim();
    const email = (candidate.email || "").trim().toLowerCase();
    const name = (candidate.name || "").trim().toLowerCase();
    return accounts.find(
      (person) =>
        (memberId && person.memberId === memberId) ||
        (email && (person.email || "").trim().toLowerCase() === email) ||
        (name && person.name.trim().toLowerCase() === name)
    );
  };

  const contacts = (offering.contacts || [])
    .map((contact) => {
      const account = accountFor(contact);
      if (!account) return null;
      return {
        ...contact,
        // Use the account's canonical identity, never a stale spreadsheet
        // spelling or a client-supplied email.
        name: account.name,
        email: account.email || "",
      };
    })
    .filter((contact): contact is NonNullable<typeof contact> => !!contact);

  const owners = (offering.owners || [])
    .map((owner) => {
      const account = accountFor(owner);
      if (!account) return null;
      return {
        ...owner,
        name: account.name,
        email: account.email || null,
      };
    })
    .filter((owner): owner is NonNullable<typeof owner> => !!owner);

  return {
    ...offering,
    contacts,
    poc: contacts.map((contact) => contact.name).join(" / "),
    owners,
  };
}

/** Resolve a POC picker value to canonical active-account names. */
export function canonicalAccountBackedPoc(
  value: string | null | undefined,
  people: readonly AssignablePerson[]
): { value: string; invalid: string[] } {
  const requested = (value || "")
    .split(/\s*(?:\/|,|&|\band\b)\s*/i)
    .map((name) => name.trim())
    .filter(Boolean);
  const accounts = people.filter((person) => Boolean(person.memberId));
  const canonical: string[] = [];
  const invalid: string[] = [];
  for (const name of requested) {
    const account = accounts.find(
      (person) => person.name.trim().toLowerCase() === name.toLowerCase()
    );
    if (!account) invalid.push(name);
    else if (!canonical.includes(account.name)) canonical.push(account.name);
  }
  return { value: canonical.join(" / "), invalid };
}

/** The active account records selected by a POC value, in picker order. */
export function accountBackedPeopleForPoc(
  value: string | null | undefined,
  people: readonly AssignablePerson[]
): { people: AssignablePerson[]; invalid: string[] } {
  const requested = (value || "")
    .split(/\s*(?:\/|,|&|\band\b)\s*/i)
    .map((name) => name.trim())
    .filter(Boolean);
  const accounts = people.filter((person) => Boolean(person.memberId));
  const selected: AssignablePerson[] = [];
  const invalid: string[] = [];
  for (const name of requested) {
    const account = accounts.find(
      (person) => person.name.trim().toLowerCase() === name.toLowerCase()
    );
    if (!account) invalid.push(name);
    else if (!selected.some((person) => person.memberId === account.memberId))
      selected.push(account);
  }
  return { people: selected, invalid };
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

/**
 * "SALES" WAS NOT A ROLE ANYBODY COULD NAME (Anir, Aug 21, reading the
 * add-an-owner picker: "what does Sales mean? I know there's a manager role
 * and an admin role, but what is Sales — me? Does that mean sales rep? Why are
 * you just saying Sales?").
 *
 * "sales" is the LEGACY stored value for the rep role, and it leaked into the
 * UI as if it were the role's name. The role is BD Member, and the picker
 * should say so beside Owner and Workspace admin (Suren, Aug 29).
 */
function roleLabel(role: string): string {
  if (role === "admin") return "Workspace admin";
  if (role === "bd_owner") return "Owner";
  if (role === "sol_member") return "Solutioning Member";
  return "BD Member";
}
