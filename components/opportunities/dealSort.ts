/**
 * HOW THE OPPORTUNITIES LIST CAN BE ORDERED. "none" is the order the list
 * arrived in (money, frozen for the session); the two confidence orders are
 * Manoj's; the two time orders are Anir's (Sep 7: "sort by the newest
 * change… I just did it and I don't know where it is").
 */
export type DealSort = "none" | "desc" | "asc" | "changed" | "added";

/** The moment a time order sorts on, as milliseconds; missing stamps sink. */
export function dealStamp(
  deal: { updatedAt?: string; createdAt?: string },
  sort: "changed" | "added"
): number {
  const raw = sort === "changed" ? deal.updatedAt || deal.createdAt : deal.createdAt || deal.updatedAt;
  const ms = raw ? Date.parse(raw) : NaN;
  return Number.isFinite(ms) ? ms : 0;
}
