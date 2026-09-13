/** Apply only this client's changes. Concurrent edits to the same chat conflict. */
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
    if (!same(remote, old) && !same(remote, desired)) return null;
    if (desired) result.set(id, desired);
    else result.delete(id);
  }
  return [...result.values()];
}
