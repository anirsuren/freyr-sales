/** One collection per source per 24 hours; UI and background jobs share it. */
export const MARKET_INTEL_REFRESH_MS = 24 * 60 * 60 * 1000;

/** The next eligible collection is exactly 24 hours after the last one. */
export function nextMarketIntelCycle(
  lastCollectedAt: string | number,
  now = Date.now(),
): number {
  const last =
    typeof lastCollectedAt === "number"
      ? lastCollectedAt
      : Date.parse(lastCollectedAt);
  return Number.isFinite(last) ? last + MARKET_INTEL_REFRESH_MS : now;
}

export function collectedInCurrentCycle(
  at: string | null | undefined,
  now = Date.now(),
): boolean {
  if (!at) return false;
  const collected = Date.parse(at);
  return Number.isFinite(collected) && collected > now - MARKET_INTEL_REFRESH_MS;
}
