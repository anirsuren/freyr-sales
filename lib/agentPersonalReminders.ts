import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { WorkspaceMemberScope } from "@/lib/types";

/**
 * "REMIND ME FRIDAY TO SEND PFIZER THE DECK."
 *
 * A follow-up on the account timeline needs a contact to hang on, and most
 * live accounts have none yet, so "remind me to follow up with GSK next
 * Tuesday" was refused outright (found testing Sep 30). A personal reminder is
 * the person's own note to themself: it needs no contact, no record and no
 * module permission beyond using the agent, and it is private to them. It
 * comes back through every reminder surface (chat, dock, WhatsApp push).
 */

export type PersonalReminder = {
  id: string;
  text: string;
  /** YYYY-MM-DD on the person's calendar. */
  day: string;
  /** "14:30" when they gave a time. */
  time?: string;
  account?: { id: string; name: string };
  createdAt: string;
  doneAt?: string;
};

const rowId = (scope: WorkspaceMemberScope) => `agent-personal-reminders:${scope.workspaceId}:${scope.userId}`;

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }) : null;
}

function clean(value: unknown): PersonalReminder | null {
  const r = value as Partial<PersonalReminder> | null;
  if (!r || typeof r.id !== "string" || typeof r.text !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(String(r.day))) return null;
  return {
    id: r.id,
    text: r.text.slice(0, 500),
    day: String(r.day),
    ...(typeof r.time === "string" && /^\d{2}:\d{2}$/.test(r.time) ? { time: r.time } : {}),
    ...(r.account && typeof r.account.id === "string" && typeof r.account.name === "string" ? { account: { id: r.account.id, name: r.account.name } } : {}),
    createdAt: typeof r.createdAt === "string" ? r.createdAt : new Date(0).toISOString(),
    ...(typeof r.doneAt === "string" ? { doneAt: r.doneAt } : {}),
  };
}

export async function readPersonalReminders(scope: WorkspaceMemberScope): Promise<PersonalReminder[]> {
  const db = client();
  if (!db) return [];
  const { data, error } = await db.from("offering_catalog_state").select("catalog").eq("id", rowId(scope)).maybeSingle();
  if (error) throw new Error(error.message);
  const list = (data?.catalog as { reminders?: unknown[] } | null)?.reminders;
  return Array.isArray(list) ? list.map(clean).filter((r): r is PersonalReminder => r !== null) : [];
}

async function writePersonalReminders(scope: WorkspaceMemberScope, reminders: PersonalReminder[]): Promise<void> {
  const db = client();
  if (!db) throw new Error("The reminder store is not available on this server.");
  // Done reminders are kept a fortnight so "what did I tick off" still answers, then dropped.
  const cutoff = Date.now() - 14 * 86_400_000;
  const kept = reminders.filter((r) => !r.doneAt || Date.parse(r.doneAt) >= cutoff).slice(-200);
  const { error } = await db
    .from("offering_catalog_state")
    .upsert({ id: rowId(scope), catalog: { workspaceId: scope.workspaceId, userId: scope.userId, reminders: kept, updatedAt: new Date().toISOString() } });
  if (error) throw new Error(error.message);
}

export async function addPersonalReminder(
  scope: WorkspaceMemberScope,
  input: { text: string; day: string; time?: string; account?: { id: string; name: string } },
): Promise<PersonalReminder> {
  const current = await readPersonalReminders(scope);
  const reminder: PersonalReminder = {
    id: `rem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    text: input.text.trim().slice(0, 500),
    day: input.day,
    ...(input.time ? { time: input.time } : {}),
    ...(input.account ? { account: input.account } : {}),
    createdAt: new Date().toISOString(),
  };
  await writePersonalReminders(scope, [...current, reminder]);
  return reminder;
}

/** Tick one off. Matches the id, else the one open reminder whose text contains the words given. */
export async function completePersonalReminder(
  scope: WorkspaceMemberScope,
  which: string,
): Promise<{ ok: true; reminder: PersonalReminder } | { ok: false; error: string; candidates?: PersonalReminder[] }> {
  const current = await readPersonalReminders(scope);
  const open = current.filter((r) => !r.doneAt);
  const q = which.trim().toLowerCase();
  const byId = open.find((r) => r.id === which.trim());
  const matches = byId ? [byId] : open.filter((r) => r.text.toLowerCase().includes(q) || (r.account?.name ?? "").toLowerCase().includes(q));
  if (!matches.length) return { ok: false, error: `You have no open reminder matching "${which.trim()}".` };
  if (matches.length > 1) return { ok: false, error: "More than one reminder matches. Which one?", candidates: matches };
  const done = { ...matches[0], doneAt: new Date().toISOString() };
  await writePersonalReminders(scope, current.map((r) => (r.id === done.id ? done : r)));
  return { ok: true, reminder: done };
}
