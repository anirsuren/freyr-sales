import { armMarketIntelSelfRefresh, armSiteUpdatesScan } from "./lib/marketIntelCron";
import { initializeLiveOfferings } from "./lib/offerings";
import { verifyVertexConnection } from "./lib/vertex";
import { armEcsAwsCredentialBridge } from "./lib/ecsAwsCredentials";

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
  // On ECS, hand the task role to Google's auth library before anything asks
  // Vertex a question (see lib/ecsAwsCredentials).
  const bridged = armEcsAwsCredentialBridge();
  if (process.env.VERTEX_VERIFY_ON_STARTUP === "1") {
    // Give the first credential fetch a moment so the verification below
    // exercises the real path rather than racing it.
    if (bridged) await new Promise((resolve) => setTimeout(resolve, 1500));
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
