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

/**
 * THE WEBSITE SCAN RUNS ITSELF TOO.
 *
 * Anir, Aug 30: "until you have a good way of scanning those things every two
 * times a day, that's not considered done."
 *
 * Same shape as the refresh above and for the same reason — there is no
 * external scheduler in this deployment, the app arms its own timers on boot.
 * A SECOND timer rather than more work inside the first, because that is the
 * whole bug being fixed: the website pass used to be the last thing in a queue
 * that never got that far, and every company in the feed had never once been
 * scanned.
 *
 * TWICE A DAY FALLS OUT OF THE PARTS. Each company carries its own 12-hour
 * stamp, so a tick only visits the ones that are due; each tick spends at most
 * a few minutes and writes as it goes, so the list is covered across ticks
 * rather than in one long run that can die halfway.
 */
const SITE_ARMED_KEY = "__MI_SITE_SCAN_ARMED__";
const SITE_CHECK_MS = 20 * 60 * 1000;

export function armSiteUpdatesScan(): void {
  const g = globalThis as Record<string, unknown>;
  if (g[SITE_ARMED_KEY]) return;
  g[SITE_ARMED_KEY] = true;

  const tick = async () => {
    try {
      const { runSiteUpdatesRefresh } = await import("./marketIntelRefresh");
      const result = await runSiteUpdatesRefresh();
      if (result.scanned > 0) {
        console.log(
          `[market-intel] website scan: ${JSON.stringify(result)}`
        );
      }
    } catch (error) {
      console.error("[market-intel] website scan failed:", error);
    }
  };

  setInterval(tick, SITE_CHECK_MS);
  /* Offset from the news refresh's 90s so a cold boot does not fire both at
     once and have them queue behind each other on the same Perplexity key. */
  setTimeout(tick, 150 * 1000);
  console.log(
    "[market-intel] website scan armed: due companies checked every 20 minutes"
  );
}
