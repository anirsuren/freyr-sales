import test from "node:test";
import assert from "node:assert/strict";
import { checkCreateOpportunityEvidence } from "../lib/agentProposalEvidence.ts";

const now = new Date("2026-09-30T12:00:00Z");
const zone = "America/New_York";
const proposed = {
  customer: "Galderma",
  name: "GRI — Galderma",
  estimatedTcv: "100k",
  confidence: 10,
  estSignDate: "2026-11-15",
  status: "Qualify",
};

test("an account-only new deal cannot borrow an old date or invented numbers", () => {
  const history = [
    { role: "user", text: "Create a new opportunity for GRI under Galderma" },
    { role: "agent", text: "What date should I use?" },
    { role: "user", text: "Oct 30" },
    { role: "agent", text: "There is nothing scheduled on Oct 30." },
  ];
  const result = checkCreateOpportunityEvidence(
    proposed,
    "Sorry, create a new opportunity for GRI under Galderma account",
    history,
    now,
    zone
  );
  assert.deepEqual(result.unsupported, ["estimated value", "confidence percentage", "expected signing date"]);
  assert.equal(result.params.status, undefined);
});

test("a follow-up date, value and percentage can complete the same deal request", () => {
  const history = [
    { role: "user", text: "Create a new opportunity for GRI under Galderma" },
    { role: "agent", text: "What value, confidence and date?" },
    { role: "user", text: "Value is $100,000 and confidence is 10%." },
    { role: "agent", text: "What signing date?" },
  ];
  const result = checkCreateOpportunityEvidence(
    { ...proposed, estSignDate: "2026-10-30" },
    "Oct30",
    history,
    now,
    zone
  );
  assert.deepEqual(result.unsupported, []);
  assert.equal(result.params.status, undefined);
});

test("an explicit stage is retained, but a different proposed date is refused", () => {
  const result = checkCreateOpportunityEvidence(
    proposed,
    "Create a GRI opportunity under Galderma, value 100k, 10% confidence, signing Oct 30, stage Qualify",
    [],
    now,
    zone
  );
  assert.deepEqual(result.unsupported, ["expected signing date"]);
  assert.equal(result.params.status, "Qualify");
});

test("compact currency amounts are explicit user evidence, but larger invented values are not", () => {
  const message = "Create an opportunity for Galderma with value USD133750, confidence 50%, signing 2026-11-01.";
  const params = { estimatedTcv:133750, confidence:50, estSignDate:"2026-11-01" };
  assert.deepEqual(checkCreateOpportunityEvidence(params,message,[],now,zone).unsupported,[]);
  assert.deepEqual(checkCreateOpportunityEvidence({...params,estimatedTcv:1337500},message,[],now,zone).unsupported,["estimated value"]);
});
