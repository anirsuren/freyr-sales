/**
 * MARKET INTEL RUNS ITSELF (Anir, Aug 11: "I'm gonna close my laptop... it
 * has to just run by itself"). The refresh used to fire only from page
 * visits, so a quiet day meant a stale feed.
 *
 * This lives OUTSIDE instrumentation.ts on purpose: instrumentation compiles
 * for the edge runtime too, and even a dynamic import that leads to
 * lib/claude drags node:fs into the edge bundle and breaks the dev build
 * (the exact hazard instrumentation.ts documents). This module is imported
 * only by Node-runtime code — the health endpoint, which the load balancer
 * pings continuously in production — so the timer arms seconds after every
 * server boot with no edge exposure.
 *
 * The runner itself no-ops as "fresh" between the twice-daily windows and
 * takes a database lock, so many server instances never double-run.
 */
const ARMED_KEY = "__MI_SELF_REFRESH_ARMED__";
const LOGGED_KEY = "__MI_SELF_REFRESH_FIRST_LOGGED__";
const CHECK_MS = 30 * 60 * 1000;

export function armMarketIntelSelfRefresh(): void {
  const g = globalThis as Record<string, unknown>;
  if (g[ARMED_KEY]) return;
  g[ARMED_KEY] = true;

  const tick = async () => {
    try {
      const { runMarketIntelRefresh } = await import("./marketIntelRefresh");
      const result = await runMarketIntelRefresh();
      if (result.ran || !g[LOGGED_KEY]) {
        g[LOGGED_KEY] = true;
        console.log(
          `[market-intel] self-refresh check: ${JSON.stringify(result)}`
        );
      }
    } catch (error) {
      console.error("[market-intel] self-refresh failed:", error);
    }
  };

  setInterval(tick, CHECK_MS);
  setTimeout(tick, 90 * 1000);
  console.log(
    "[market-intel] self-refresh armed: staleness checked every 30 minutes"
  );
}
