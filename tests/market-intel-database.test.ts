import { test } from "node:test";
import assert from "node:assert/strict";
import { marketIntelDatabaseConfig } from "../lib/marketIntelDatabase";
import { marketIntelAutomaticCollectionEnabled } from "../lib/marketIntelAutomation";
const env: NodeJS.ProcessEnv = { NODE_ENV: "test", NEXT_PUBLIC_SUPABASE_URL: "https://dev.example", SUPABASE_SERVICE_ROLE_KEY: "dev-test", MARKET_INTEL_SUPABASE_URL: "https://shared.example", MARKET_INTEL_SUPABASE_SERVICE_ROLE_KEY: "shared-test" };
test("live reads and writes select the shared connection; mock retains local storage", () => {
  assert.deepEqual(marketIntelDatabaseConfig("live", env), { url: env.MARKET_INTEL_SUPABASE_URL, key: "shared-test" });
  assert.deepEqual(marketIntelDatabaseConfig("mock", env), { url: env.NEXT_PUBLIC_SUPABASE_URL, key: "dev-test" });
});
test("incomplete shared configuration fails closed", () => {
  assert.throws(() => marketIntelDatabaseConfig("live", { ...env, MARKET_INTEL_SUPABASE_SERVICE_ROLE_KEY: "" }));
  assert.throws(() => marketIntelDatabaseConfig("live", { ...env, MARKET_INTEL_SUPABASE_URL: "" }));
});
test("unconfigured deployments retain their current database", () => {
  assert.equal(marketIntelDatabaseConfig("live", { NODE_ENV: "test", NEXT_PUBLIC_SUPABASE_URL: "local", SUPABASE_SERVICE_ROLE_KEY: "test" }).url, "local");
});
test("sharing never enables automatic paid collection on development", () => {
  for (const origin of ["https://freyrsales.dev.freyrapps.com", "http://localhost:3006"]) {
    assert.equal(marketIntelAutomaticCollectionEnabled({ ...env, AUTH_PUBLIC_ORIGIN: origin, MARKET_INTEL_AUTO_COLLECTION_ENABLED: "true" }), false);
  }
  assert.equal(marketIntelAutomaticCollectionEnabled({ ...env, AUTH_PUBLIC_ORIGIN: "https://freyrsales.freyrapps.com" }), true);
});
