import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { asksAboutGoalProgress } = require("../lib/agentQuestionIntent.ts");

test("an MQL goal progress question is not routed as a lead summary", () => {
  assert.equal(asksAboutGoalProgress("Show the June 2026 progress for the exact goal Marketing Qualified Leads (MQLs) Generated: verified, pending, sent-back, and monthly target."), true);
});

test("ordinary lead summaries remain lead questions", () => {
  assert.equal(asksAboutGoalProgress("How many new leads are in each status?"), false);
  assert.equal(asksAboutGoalProgress("Give me a breakdown of lead sources this month"), false);
});
