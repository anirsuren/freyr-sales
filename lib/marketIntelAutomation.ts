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
