/** A Manage-page save changes only the rows edited in that draft. */
export type BookmarkChange = { id: string; on: boolean; star: boolean };

export function applyBookmarkChanges(
  current: { companyIds: string[]; starredIds: string[] },
  changes: BookmarkChange[]
): { companyIds: string[]; starredIds: string[] } {
  const list = new Set(current.companyIds);
  const stars = new Set(current.starredIds);
  for (const change of changes) {
    if (change.on) {
      list.add(change.id);
      if (change.star) stars.add(change.id);
      else stars.delete(change.id);
    } else {
      list.delete(change.id);
      stars.delete(change.id);
    }
  }
  return { companyIds: [...list], starredIds: [...stars].filter((id) => list.has(id)) };
}
