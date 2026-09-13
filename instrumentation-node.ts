import { armMarketIntelSelfRefresh, armSiteUpdatesScan } from "./lib/marketIntelCron";
import { initializeLiveOfferings } from "./lib/offerings";

export async function registerNode() {
  // Resume durable onboarding after every process restart, even if no user
  // revisits Market Intel and localhost has no load-balancer health pings.
  armMarketIntelSelfRefresh();
  armSiteUpdatesScan();
  try {
    await initializeLiveOfferings();
  } catch (error) {
    console.error("Offering catalog initialization failed", error);
  }
}
