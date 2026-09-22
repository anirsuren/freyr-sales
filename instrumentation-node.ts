import { armMarketIntelSelfRefresh, armSiteUpdatesScan } from "./lib/marketIntelCron";
import { initializeLiveOfferings } from "./lib/offerings";
import { verifyVertexConnection } from "./lib/vertex";

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
  if (process.env.VERTEX_VERIFY_ON_STARTUP === "1") {
    try {
      const verified = await verifyVertexConnection();
      console.info(
        `[agent] Vertex ready: ${verified.project}/${verified.location}/${verified.model}`
      );
    } catch (error) {
      console.error(
        "[agent] Vertex startup verification failed:",
        error instanceof Error ? error.message : error
      );
    }
  }
}
