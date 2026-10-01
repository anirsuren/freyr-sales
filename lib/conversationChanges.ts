/** Apply only this client's changes. Concurrent edits to the same chat conflict, unless both sides only added messages. */
export function mergeConversationChanges<T extends { id: string }>(
  base: T[], next: T[], current: T[]
): T[] | null {
  const before = new Map(base.map(item => [item.id, item]));
  const after = new Map(next.map(item => [item.id, item]));
  const result = new Map(current.map(item => [item.id, item]));
  const same = (a: T | undefined, b: T | undefined) => JSON.stringify(a) === JSON.stringify(b);
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    const old = before.get(id), desired = after.get(id), remote = result.get(id);
    if (same(old, desired)) continue;
    if (!same(remote, old) && !same(remote, desired)) {
      const both = old && desired && remote ? mergeChat(old, desired, remote) : null;
      if (!both) return null;
      result.set(id, both);
      continue;
    }
    if (desired) result.set(id, desired);
    else result.delete(id);
  }
  return [...result.values()];
}

type Chat = { id: string; messages: unknown[]; updated?: unknown };

const isChat = (value: unknown): value is Chat =>
  Boolean(value) && Array.isArray((value as Chat).messages);

/** A message is who said what, when; the same key on both sides is the same message. */
const messageKey = (message: unknown) => {
  const m = message as { role?: unknown; ts?: unknown; text?: unknown };
  return `${String(m?.role)}|${String(m?.ts)}|${String(m?.text)}`;
};

const json = (value: unknown) => JSON.stringify(value);

/**
 * TWO DOORS, ONE THREAD. A WhatsApp message landed on a thread the open web
 * page held an older copy of; the person then typed in that thread on the
 * web, and the save was refused as "another tab changed the same
 * conversation". The web message was never stored, and every later save from
 * that page failed until "Recover local chats" was pressed (found testing Sep
 * 30). Chats grow by adding messages, so when each side only added messages,
 * or changed different ones, both are kept, in time order. The same message
 * changed two different ways, or a message deleted on one side and changed on
 * the other, is still a conflict.
 */
function mergeChat<T>(old: T, desired: T, remote: T): T | null {
  if (!isChat(old) || !isChat(desired) || !isChat(remote)) return null;
  const index = (list: unknown[]) => new Map(list.map(message => [messageKey(message), message]));
  const was = index(old.messages), mine = index(desired.messages), theirs = index(remote.messages);
  // Two messages with one key cannot be told apart: do not guess.
  if (was.size !== old.messages.length || mine.size !== desired.messages.length || theirs.size !== remote.messages.length) return null;
  const messages: unknown[] = [];
  for (const key of new Set([...was.keys(), ...mine.keys(), ...theirs.keys()])) {
    const o = was.get(key), d = mine.get(key), r = theirs.get(key);
    if (o !== undefined && (d === undefined || r === undefined)) {
      // Removed on one side: fine only if the other side left it as it was.
      const kept = d === undefined ? r : d;
      if (kept !== undefined && json(kept) !== json(o)) return null;
      continue;
    }
    if (d === undefined) messages.push(r);
    else if (r === undefined) messages.push(d);
    else if (json(d) === json(r)) messages.push(d);
    else if (o !== undefined && json(d) === json(o)) messages.push(r);
    else if (o !== undefined && json(r) === json(o)) messages.push(d);
    else return null;
  }
  messages.sort((a, b) => (Number((a as { ts?: unknown }).ts) || 0) - (Number((b as { ts?: unknown }).ts) || 0));
  // Everything but the messages: this side's change wins, else the other side's.
  const fields: Record<string, unknown> = {};
  const o = old as Record<string, unknown>, d = desired as Record<string, unknown>, r = remote as Record<string, unknown>;
  for (const field of new Set([...Object.keys(o), ...Object.keys(d), ...Object.keys(r)])) {
    if (field === "messages" || field === "updated") continue;
    const value = json(d[field]) === json(o[field]) ? r[field] : d[field];
    if (value !== undefined) fields[field] = value;
  }
  return {
    ...fields,
    messages,
    updated: Math.max(Number(d.updated) || 0, Number(r.updated) || 0),
  } as T;
}
