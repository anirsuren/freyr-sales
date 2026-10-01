import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { WorkspaceMemberScope } from "@/lib/types";
import { changeRow } from "@/lib/agentRowCas";

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
  /** When it was sent to them at its minute (WhatsApp), so it goes out once. */
  notifiedAt?: string;
};

const rowId = (scope: WorkspaceMemberScope) => `agent-personal-reminders:${scope.workspaceId}:${scope.userId}`;

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }) : null;
}

export function cleanPersonalReminder(value: unknown): PersonalReminder | null {
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
    ...(typeof r.notifiedAt === "string" ? { notifiedAt: r.notifiedAt } : {}),
  };
}

export async function readPersonalReminders(scope: WorkspaceMemberScope): Promise<PersonalReminder[]> {
  const db = client();
  if (!db) return [];
  const { data, error } = await db.from("offering_catalog_state").select("catalog").eq("id", rowId(scope)).maybeSingle();
  if (error) throw new Error(error.message);
  const list = (data?.catalog as { reminders?: unknown[] } | null)?.reminders;
  return Array.isArray(list) ? list.map(cleanPersonalReminder).filter((r): r is PersonalReminder => r !== null) : [];
}

type Stored = { workspaceId: string; userId: string; reminders: PersonalReminder[]; updatedAt: string };

/** Change the list as it is NOW, written only if nobody wrote in between (two confirms at once lost one, Sep 30). */
async function changePersonalReminders(
  scope: WorkspaceMemberScope,
  change: (list: PersonalReminder[]) => PersonalReminder[] | null,
): Promise<void> {
  const db = client();
  if (!db) throw new Error("The reminder store is not available on this server.");
  await changeRow<Stored>(db, rowId(scope), (current) => {
    const list = (Array.isArray(current?.reminders) ? current.reminders : []).map(cleanPersonalReminder).filter((r): r is PersonalReminder => r !== null);
    const next = change(list);
    if (!next) return null;
    // Done reminders are kept a fortnight so "what did I tick off" still answers, then dropped.
    const cutoff = Date.now() - 14 * 86_400_000;
    const kept = next.filter((r) => !r.doneAt || Date.parse(r.doneAt) >= cutoff).slice(-200);
    return { workspaceId: scope.workspaceId, userId: scope.userId, reminders: kept, updatedAt: new Date().toISOString() };
  });
}

export async function addPersonalReminder(
  scope: WorkspaceMemberScope,
  input: { text: string; day: string; time?: string; account?: { id: string; name: string } },
): Promise<PersonalReminder> {
  const reminder: PersonalReminder = {
    id: `rem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    text: input.text.trim().slice(0, 500),
    day: input.day,
    ...(input.time ? { time: input.time } : {}),
    ...(input.account ? { account: input.account } : {}),
    createdAt: new Date().toISOString(),
  };
  await changePersonalReminders(scope, (list) => [...list, reminder]);
  return reminder;
}

type Found = { ok: true; reminder: PersonalReminder } | { ok: false; error: string; candidates?: PersonalReminder[] };

/* Words that say which reminder without being part of it: "the Pfizer one",
   "that reminder", "tick off my deck reminder". */
const FILLER = new Set(["the", "a", "an", "to", "for", "my", "me", "one", "reminder", "about", "that", "this", "it", "is", "was", "done", "and", "of", "on", "at", "with", "please", "tick", "off", "mark", "as", "i", "you", "your", "today", "tomorrow"]);

/** "Your reminder tomorrow at 15:00: Send Pfizer the deck." reads as "send pfizer the deck". */
function plain(value: string): string {
  return value
    .toLowerCase()
    .replace(/^\s*(?:your reminder|you asked me to remind you|reminder)\b[^:]{0,80}:\s*/, "")
    .replace(/["'“”‘’.,;:!?()[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const words = (value: string) => plain(value).split(" ").filter((w) => w && !FILLER.has(w));

/**
 * WHICH REMINDER DID THEY MEAN? The id, else the reminder whose words were
 * given. The agent reads a reminder back as "Your reminder tomorrow: Send
 * Pfizer the pricing deck." and then passed that whole line as the one to
 * tick off, which no reminder's text contains, so "tick that off" failed after
 * the person had already said yes (found testing Sep 30). Each step is tried
 * in turn and the first that finds anything decides; two hits is a question.
 */
export function pickPersonalReminder(list: PersonalReminder[], which: string): PersonalReminder[] {
  const raw = which.trim().replace(/^personal:/, "");
  const byId = list.filter((r) => r.id === raw);
  if (byId.length) return byId;
  const q = plain(which);
  if (!q) return [];
  const exact = list.filter((r) => plain(r.text) === q);
  if (exact.length) return exact;
  const contained = list.filter((r) => {
    const text = plain(r.text);
    const account = plain(r.account?.name ?? "");
    return text.includes(q) || q.includes(text) || (account && q === account);
  });
  if (contained.length) return contained;
  const asked = words(which);
  // "tick that off" with one reminder open: that one. The confirm card names it before anything changes.
  if (!asked.length) return list.length === 1 ? list : [];
  const scored = list
    .map((r) => {
      const have = new Set(words(`${r.text} ${r.account?.name ?? ""}`));
      return { r, score: asked.filter((w) => have.has(w)).length / asked.length };
    })
    .filter((s) => s.score >= 0.6);
  const best = Math.max(0, ...scored.map((s) => s.score));
  return scored.filter((s) => s.score === best).map((s) => s.r);
}

/** Find one of their open reminders by id or by a few of its words, without changing it. */
export async function findPersonalReminder(scope: WorkspaceMemberScope, which: string): Promise<Found> {
  const current = await readPersonalReminders(scope);
  const open = current.filter((r) => !r.doneAt);
  if (!open.length) return { ok: false, error: "You have no open reminders." };
  const matches = pickPersonalReminder(open, which);
  if (matches.length === 1) return { ok: true, reminder: matches[0] };
  if (matches.length > 1) return { ok: false, error: "More than one reminder matches. Which one?", candidates: matches };
  const done = pickPersonalReminder(current.filter((r) => r.doneAt), which);
  if (done.length === 1) return { ok: false, error: `"${done[0].text}" is already ticked off.` };
  return { ok: false, error: `You have no open reminder matching "${which.trim()}".`, candidates: open.length <= 5 ? open : undefined };
}

/** Tick one off: the reminder findPersonalReminder resolves. */
export async function completePersonalReminder(scope: WorkspaceMemberScope, which: string): Promise<Found> {
  const found = await findPersonalReminder(scope, which);
  if (!found.ok) return found;
  const done = { ...found.reminder, doneAt: new Date().toISOString() };
  await changePersonalReminders(scope, (list) => list.map((r) => (r.id === done.id ? done : r)));
  return { ok: true, reminder: done };
}

/**
 * Claim one reminder for sending at its minute: marks it sent and returns it,
 * or null when it is gone, done, or already claimed (another server, an
 * earlier pass). Written only if nobody wrote in between, so it goes out once.
 */
export async function claimReminderNotice(scope: WorkspaceMemberScope, id: string): Promise<PersonalReminder | null> {
  let claimed: PersonalReminder | null = null;
  await changePersonalReminders(scope, (list) => {
    claimed = null;
    const i = list.findIndex((r) => r.id === id && !r.doneAt && !r.notifiedAt);
    if (i < 0) return null;
    const next = [...list];
    next[i] = { ...list[i], notifiedAt: new Date().toISOString() };
    claimed = next[i];
    return next;
  });
  return claimed;
}
