import { armCompanyOnboarding } from "./marketIntelOnboarding";
import {
  claimAutomaticMarketIntelCycle,
  marketIntelAutomaticCollectionEnabled,
  millisecondsUntilNextMarketIntelRun,
} from "./marketIntelAutomation";

/**
 * Production has one coordinated Market Intel collection window per day.
 * The health endpoint only arms this scheduler; it never starts a collection.
 * A durable daily claim prevents another container or restart from spending in
 * the same UTC day. Explicit user-requested onboarding remains independent.
 */
const ARMED_KEY = "__MI_DAILY_REFRESH_ARMED__";
const DISABLED_LOGGED_KEY = "__MI_DAILY_REFRESH_DISABLED_LOGGED__";

async function runDailyMarketIntelCycle(): Promise<void> {
  const startedAt = new Date();
  if (!(await claimAutomaticMarketIntelCycle(startedAt))) {
    console.log("[market-intel] daily collection already claimed; skipping");
    return;
  }

  try {
    const { runMarketIntelRefresh, runSiteUpdatesRefresh } = await import(
      "./marketIntelRefresh"
    );
    const news = await runMarketIntelRefresh();
    const sites = await runSiteUpdatesRefresh();
    console.log(
      `[market-intel] daily collection finished: ${JSON.stringify({ news, sites })}`,
    );
  } catch (error) {
    console.error("[market-intel] daily collection failed:", error);
  }
}

function armDailyMarketIntelCycle(): void {
  // Only explicit company onboarding uses its own worker outside the daily run.
  armCompanyOnboarding();
  const g = globalThis as Record<string, unknown>;
  if (!marketIntelAutomaticCollectionEnabled()) {
    if (!g[DISABLED_LOGGED_KEY]) {
      g[DISABLED_LOGGED_KEY] = true;
      console.log("[market-intel] daily collection disabled in this environment");
    }
    return;
  }
  if (g[ARMED_KEY]) return;
  g[ARMED_KEY] = true;

  const scheduleNext = () => {
    const delay = millisecondsUntilNextMarketIntelRun();
    const timer = setTimeout(async () => {
      await runDailyMarketIntelCycle();
      scheduleNext();
    }, delay);
    timer.unref();
    console.log(
      `[market-intel] next daily collection scheduled in ${Math.round(delay / 60_000)} minutes`,
    );
  };

  scheduleNext();
}

export function armMarketIntelSelfRefresh(): void {
  armDailyMarketIntelCycle();
}

export function armSiteUpdatesScan(): void {
  armDailyMarketIntelCycle();
}
