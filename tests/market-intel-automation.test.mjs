import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { marketIntelAutomaticCollectionEnabled } = require("../lib/marketIntelAutomation.ts");

test("automatic collection is fail-closed outside the exact production host", () => {
  assert.equal(marketIntelAutomaticCollectionEnabled({}), false);
  assert.equal(
    marketIntelAutomaticCollectionEnabled({
      AUTH_PUBLIC_ORIGIN: "https://freyrsales.dev.freyrapps.com",
    }),
    false,
  );
  assert.equal(
    marketIntelAutomaticCollectionEnabled({
      AUTH_PUBLIC_ORIGIN: "http://localhost:3006",
    }),
    false,
  );
  assert.equal(
    marketIntelAutomaticCollectionEnabled({
      AUTH_PUBLIC_ORIGIN: "https://freyrsales.freyrapps.com",
    }),
    true,
  );
});

test("production can be stopped explicitly but dev cannot be enabled", () => {
  assert.equal(
    marketIntelAutomaticCollectionEnabled({
      AUTH_PUBLIC_ORIGIN: "https://freyrsales.freyrapps.com",
      MARKET_INTEL_AUTO_COLLECTION_ENABLED: "0",
    }),
    false,
  );
  assert.equal(
    marketIntelAutomaticCollectionEnabled({
      AUTH_PUBLIC_ORIGIN: "https://freyrsales.dev.freyrapps.com",
      MARKET_INTEL_AUTO_COLLECTION_ENABLED: "1",
    }),
    false,
  );
});
