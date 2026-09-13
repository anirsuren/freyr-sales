/** One collection per 24 hours; UI and background jobs share this clock. */
export const MARKET_INTEL_REFRESH_MS = 24 * 60 * 60 * 1000;

/** Every company joins the same daily batch, at 06:00 UTC. */
export function marketIntelCycleStart(now = Date.now()): number {
  const date = new Date(now);
  date.setUTCHours(6, 0, 0, 0);
  if (date.getTime() > now) date.setUTCDate(date.getUTCDate() - 1);
  return date.getTime();
}
export function nextMarketIntelCycle(now = Date.now()): number {
  return marketIntelCycleStart(now) + MARKET_INTEL_REFRESH_MS;
}
export function collectedInCurrentCycle(
  at: string | null | undefined,
  now = Date.now(),
): boolean {
  return !!at && Date.parse(at) >= marketIntelCycleStart(now);
}
