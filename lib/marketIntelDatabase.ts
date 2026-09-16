/** Dedicated, server-side Market Intel connection. Never changes app auth or CRM storage. */
export function marketIntelDatabaseConfig(mode: "live" | "mock" = "live", env: NodeJS.ProcessEnv = process.env) {
  if (typeof window !== "undefined") throw new Error("Market Intel storage is server-only.");
  const sharedUrl = env.MARKET_INTEL_SUPABASE_URL?.trim();
  const sharedKey = env.MARKET_INTEL_SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (mode === "live" && (sharedUrl || sharedKey)) {
    if (!sharedUrl || !sharedKey) throw new Error("Shared Market Intel requires both database settings.");
    return { url: sharedUrl, key: sharedKey };
  }
  return { url: env.NEXT_PUBLIC_SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY };
}
