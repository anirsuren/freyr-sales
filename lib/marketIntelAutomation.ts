/**
 * Recurring Market Intel collection is allowed only on the production site.
 * Development and localhost keep their databases and manual onboarding/admin
 * refreshes, but must never spend provider credits merely because the app is
 * running or somebody opened a page.
 *
 * The explicit variable is useful for operations, but the hostname allowlist
 * is deliberately fail-closed so a missing task-definition value cannot turn
 * collection back on in development after a future deploy.
 */
export function marketIntelAutomaticCollectionEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const explicit = env.MARKET_INTEL_AUTO_COLLECTION_ENABLED?.trim().toLowerCase();
  const hosts: string[] = [];
  for (const raw of [env.AUTH_PUBLIC_ORIGIN, env.APP_PUBLIC_URL]) {
    if (!raw) continue;
    try {
      hosts.push(new URL(raw).hostname.toLowerCase());
    } catch {
      // An invalid or partial origin must not enable a paid background job.
    }
  }

  // Dev and local are hard stops. This intentionally wins over an accidental
  // "1" copied into the wrong task definition.
  if (
    hosts.some(
      (host) =>
        host === "freyrsales.dev.freyrapps.com" ||
        host === "localhost" ||
        host === "127.0.0.1",
    )
  ) {
    return false;
  }

  // Production defaults on, but operations can explicitly stop it without a
  // code deploy. Unknown environments remain off unless deliberately enabled.
  if (explicit) return ["1", "true", "yes", "on"].includes(explicit);
  return hosts.includes("freyrsales.freyrapps.com");
}

/** One automatic collection window per UTC day, shared by every app instance. */
export const MARKET_INTEL_DAILY_RUN_HOUR_UTC = 6;

export function marketIntelAutomaticCycleId(now = new Date()): string {
  return `market-intel:auto-cycle:${now.toISOString().slice(0, 10)}`;
}

/** Milliseconds until the next 06:00 UTC collection window. */
export function millisecondsUntilNextMarketIntelRun(
  nowMs = Date.now(),
  hourUtc = MARKET_INTEL_DAILY_RUN_HOUR_UTC,
): number {
  const now = new Date(nowMs);
  const next = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    hourUtc,
  );
  return (next > nowMs ? next : next + 24 * 60 * 60 * 1000) - nowMs;
}

/**
 * Claim today's automatic run before touching a paid provider. The unique row
 * makes simultaneous ECS tasks and later container restarts share one window.
 * Failure is fail-closed: no durable claim means no automatic provider calls.
 */
export async function claimAutomaticMarketIntelCycle(
  now = new Date(),
): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;

  try {
    const { createClient } = await import("@supabase/supabase-js");
    const { error } = await createClient(url, key)
      .from("offering_catalog_state")
      .insert({
        id: marketIntelAutomaticCycleId(now),
        catalog: { startedAt: now.toISOString(), cadence: "daily" },
      });
    if (!error) return true;
    if (error.code === "23505") return false;
    console.error(`[market-intel] daily claim failed: ${error.message}`);
    return false;
  } catch (error) {
    console.error(
      `[market-intel] daily claim failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
}
