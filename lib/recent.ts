// Recently-viewed records (V6) — client-side, localStorage. Dedupes by href,
// most-recent first, capped.
export type RecentItem = {
  type: string;
  label: string;
  sublabel?: string;
  href: string;
};

const KEY = "freyr.recent.v1";
const CAP = 8;

function keyFor(userId: string) {
  return `${KEY}:${encodeURIComponent(userId)}`;
}

export function getRecent(userId: string): RecentItem[] {
  try {
    return JSON.parse(localStorage.getItem(keyFor(userId)) || "[]");
  } catch {
    return [];
  }
}

export function pushRecent(item: RecentItem, userId: string) {
  if (!item.label || !item.href) return;
  try {
    const next = [item, ...getRecent(userId).filter((r) => r.href !== item.href)].slice(
      0,
      CAP
    );
    localStorage.setItem(keyFor(userId), JSON.stringify(next));
  } catch {}
}
