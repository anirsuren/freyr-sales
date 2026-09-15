import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  marketIntelAutomaticCollectionEnabled,
  marketIntelAutomaticCycleId,
  millisecondsUntilNextMarketIntelRun,
} = require("../lib/marketIntelAutomation.ts");

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

test("automatic collection has one stable UTC-day claim", () => {
  assert.equal(
    marketIntelAutomaticCycleId(new Date("2026-09-15T04:42:00Z")),
    "market-intel:auto-cycle:2026-09-15",
  );
});

test("automatic collection schedules only the next daily 06:00 UTC window", () => {
  assert.equal(
    millisecondsUntilNextMarketIntelRun(Date.parse("2026-09-15T05:30:00Z")),
    30 * 60 * 1000,
  );
  assert.equal(
    millisecondsUntilNextMarketIntelRun(Date.parse("2026-09-15T06:30:00Z")),
    23.5 * 60 * 60 * 1000,
  );
});
