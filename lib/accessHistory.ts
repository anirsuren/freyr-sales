/**
 * WHO CHANGED SOMEBODY'S ACCESS, WHEN, AND WHAT IT WAS BEFORE.
 *
 * Anir, Sep 4, on a member's panel: "I want to see all their past history, like
 * who assigned what role to them, if they changed any role, etc. I want to see
 * all their history. for the roles."
 *
 * Until now every access change was announced and then forgotten: the code read
 * the person's row BEFORE the write purely so the email could say what it
 * changed from, and threw that away once the mail was queued. So the only
 * record that Abhinaya was made a BD Member on the 20th lived in an inbox, and
 * the question "who gave them this, and when" had no answer inside the app at
 * all.
 *
 * APPEND ONLY. An audit trail you can edit is not one. Nothing here updates or
 * deletes an entry; a mistake is corrected by making the opposite change, which
 * is itself another entry.
 */

import { createClient } from "@supabase/supabase-js";

const ROW = "access-history";

function hasSupabase(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function client() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/** One thing that happened to one person's access. */
export type AccessEvent = {
  id: string;
  /** ISO timestamp. */
  at: string;
  /** Who made the change, by name. "System" when nobody did. */
  actor: string;
  /** WHO IT HAPPENED TO. Matched on the name the privileges table uses, which
   *  is what the people-privileges map is keyed by. */
  subject: string;
  /** What kind of change: a role, a privilege set, or access itself. */
  kind: "role" | "privileges" | "active" | "joined";
  /** Plain English, already written for a reader: "BD Member to BD Owner". */
  detail: string;
};

type HistoryState = { events: AccessEvent[] };

/** Keep the row bounded. Oldest fall off first; a workspace this size will not
 *  reach it for years, and an unbounded row eventually fails to write. */
const MAX_EVENTS = 5000;

function normalize(raw: unknown): HistoryState {
  const r = (raw ?? {}) as { events?: unknown };
  const list = Array.isArray(r.events) ? r.events : [];
  const events: AccessEvent[] = [];
  for (const item of list) {
    const e = item as Partial<AccessEvent>;
    if (!e || typeof e !== "object") continue;
    const at = String(e.at ?? "");
    const subject = String(e.subject ?? "").trim();
    if (!at || !subject) continue;
    events.push({
      id: String(e.id ?? `${at}-${subject}`),
      at,
      actor: String(e.actor ?? "").trim() || "System",
      subject,
      kind:
        e.kind === "role" || e.kind === "privileges" || e.kind === "active" || e.kind === "joined"
          ? e.kind
          : "privileges",
      detail: String(e.detail ?? ""),
    });
  }
  /* Newest first, which is the order every reader wants. */
  return { events: events.sort((a, b) => (a.at < b.at ? 1 : -1)) };
}

export async function readAccessHistory(): Promise<HistoryState> {
  if (!hasSupabase()) return { events: [] };
  try {
    const { data } = await client()
      .from("offering_catalog_state")
      .select("catalog")
      .eq("id", ROW)
      .maybeSingle();
    return normalize(data?.catalog ?? null);
  } catch {
    return { events: [] };
  }
}

/**
 * Record what happened. Never throws: an audit write must not be able to fail
 * the change it is describing — a role that moved and was not logged is bad,
 * a role that would not move because the log was down is worse.
 */
export async function recordAccessEvents(
  entries: Omit<AccessEvent, "id" | "at">[]
): Promise<void> {
  if (!entries.length) return;
  try {
    const now = new Date().toISOString();
    const state = await readAccessHistory();
    const added: AccessEvent[] = entries.map((e, i) => ({
      ...e,
      at: now,
      id: `${now}-${i}-${Math.random().toString(36).slice(2, 8)}`,
    }));
    if (!hasSupabase()) return;
    await client()
      .from("offering_catalog_state")
      .upsert({
        id: ROW,
        catalog: { events: [...added, ...state.events].slice(0, MAX_EVENTS) },
        updated_at: new Date().toISOString(),
      });
  } catch {
    /* Swallowed on purpose — see above. */
  }
}

/** Everything that ever happened to one person, newest first. */
export async function accessHistoryFor(subject: string): Promise<AccessEvent[]> {
  const key = subject.trim().toLowerCase();
  if (!key) return [];
  const { events } = await readAccessHistory();
  return events.filter((e) => e.subject.trim().toLowerCase() === key);
}
