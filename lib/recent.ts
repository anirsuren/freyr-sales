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

export function getRecent(): RecentItem[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function pushRecent(item: RecentItem) {
  if (!item.label || !item.href) return;
  try {
    const next = [item, ...getRecent().filter((r) => r.href !== item.href)].slice(
      0,
      CAP
    );
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
}
