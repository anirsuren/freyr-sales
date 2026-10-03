import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { asksAboutGoalProgress, asksAboutPipelineBoard, asksAboutContractRecords, reminderTimeZone } = require("../lib/agentQuestionIntent.ts");

test("an MQL goal progress question is not routed as a lead summary", () => {
  assert.equal(asksAboutGoalProgress("Show the June 2026 progress for the exact goal Marketing Qualified Leads (MQLs) Generated: verified, pending, sent-back, and monthly target."), true);
});

test("ordinary lead summaries remain lead questions", () => {
  assert.equal(asksAboutGoalProgress("How many new leads are in each status?"), false);
  assert.equal(asksAboutGoalProgress("Give me a breakdown of lead sources this month"), false);
});

test("explicit Pipeline source wins when Opportunities appears only as a contrast", () => {
  assert.equal(asksAboutPipelineBoard("What is the current Pipeline page total deal count, open value and weighted commit? Keep this separate from Opportunities."), true);
  assert.equal(asksAboutPipelineBoard("What is Forecast's weighted commit compared with Opportunities?"), true);
  assert.equal(asksAboutPipelineBoard("What are the total Opportunities count and estimated TCV?"), false);
});

test("contract counts do not take the opportunity estimate shortcut", () => {
  assert.equal(asksAboutContractRecords("How many signed contracts are recorded for GSK? Do not call an opportunity estimate a signed contract."), true);
  assert.equal(asksAboutContractRecords("What is the total estimated TCV for opportunities?"), false);
});

test("a pending reminder's explicit timezone survives a short schedule answer only", () => {
  const history = [{role:"user",text:"I need a reminder in America/New_York."},{role:"agent",text:"What day and time should I set the reminder for?"}];
  assert.equal(reminderTimeZone("Tomorrow at 11:30 PM. Prepare the proposal only.", history), "America/New_York");
  assert.equal(reminderTimeZone("Tomorrow 9am Asia/Kolkata", history), "Asia/Kolkata");
  assert.equal(reminderTimeZone("Remind me to call a different account tomorrow at 9am", history), undefined);
  assert.equal(reminderTimeZone("What is GSK's owner?", [{role:"user",text:"America/New_York"},{role:"agent",text:"GSK is unassigned."}]), undefined);
});

 test("CRM briefing intent preserves customer work readers", async () => {
  const { asksAboutCustomerWork } = await import("../lib/agentQuestionIntent.ts");
  assert.equal(asksAboutCustomerWork("Brief me on GSK before a customer call. Separate opportunities and solutioning requests; do not update anything."), true);
  assert.equal(asksAboutCustomerWork("Latest GSK market news and articles"), false);
});
