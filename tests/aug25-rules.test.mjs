import test from "node:test";
import assert from "node:assert/strict";

import {
  spreadEvenly,
  judgePlan,
  buildDeviation,
} from "../lib/revenueAccrualsShared.ts";
import {
  revenueTypeFromConfidence,
  effectiveRevenueType,
} from "../lib/opportunitiesShared.ts";
import {
  nextContractReference,
  readinessGaps,
  scheduleSupersedesAccrual,
} from "../lib/contractsShared.ts";
import { nextLeadRef, leadAgeDays, isOpenLead } from "../lib/leadsShared.ts";

/**
 * THE RULES FROM SUREN'S AUG 25 CALL, tested where they actually live.
 *
 * Every assertion here is a sentence he said, turned into arithmetic. Pure
 * functions only — no database, no server, no fixtures to clean up, so this
 * can be run any time without the data-safety worry that keeps the Playwright
 * suite parked.
 *
 *   node --test tests/aug25-rules.test.mjs
 */

/* ------------------------------------------------ revenue type = confidence */

test("revenue type is read off the confidence bar", () => {
  // "0 to 80 you can play around whatever you want to play around."
  assert.equal(revenueTypeFromConfidence(0), "Pipeline");
  assert.equal(revenueTypeFromConfidence(80), "Pipeline");
  assert.equal(revenueTypeFromConfidence(94), "Pipeline");
  // "The moment you say 95 that I will treat it as high confidence."
  assert.equal(revenueTypeFromConfidence(95), "High confidence");
  assert.equal(revenueTypeFromConfidence(98), "High confidence");
  // "If you say 99 it is go get. 100 is just one step there."
  assert.equal(revenueTypeFromConfidence(99), "Go get");
  assert.equal(revenueTypeFromConfidence(100), "Go get");
  // Nothing set is not a verdict.
  assert.equal(revenueTypeFromConfidence(undefined), "Pipeline");
  assert.equal(revenueTypeFromConfidence(NaN), "Pipeline");
});

test("Future is about WHEN the money lands, not how likely it is", () => {
  assert.equal(revenueTypeFromConfidence(99, true), "Future");
  assert.equal(effectiveRevenueType({ level: "Future", confidence: 99 }), "Future");
});

test("an existing deal's word is corrected by its own number", () => {
  // The offering page was showing "High confidence · 25%" until this landed.
  assert.equal(effectiveRevenueType({ level: "Go get", confidence: 25 }), "Pipeline");
  assert.equal(effectiveRevenueType({ level: "Go get", confidence: 0 }), "Pipeline");
  // One offering per opportunity, so the row's confidence is the deal's.
  assert.equal(
    effectiveRevenueType({ level: "Pipeline", confidence: 10, lines: [{ confidence: 99 }] }),
    "Go get"
  );
});

test("a deal with no confidence keeps the word it was imported with", () => {
  // 76 rows came from Suren's workbook where level was a column and confidence
  // often was not. Rewriting those would invent a verdict from an empty cell.
  assert.equal(effectiveRevenueType({ level: "Go get" }), "Go get");
  assert.equal(effectiveRevenueType({ level: "High confidence", lines: [{}] }), "High confidence");
});

/* --------------------------------------------------- the accrual formula */

test("the simple formula always adds back to the contract value", () => {
  const three = spreadEvenly(1_000_000, "2026-04", 3);
  assert.equal(three.length, 3);
  assert.equal(three.reduce((s, l) => s + l.amount, 0), 1_000_000);
  // The rounding remainder lands on the LAST month, never scattered.
  assert.equal(three[2].amount, 333_334);
  assert.equal(
    spreadEvenly(1_000_001, "2026-04", 12).reduce((s, l) => s + l.amount, 0),
    1_000_001
  );
  assert.equal(spreadEvenly(777, "2026-04", 1)[0].amount, 777);
});

test("months roll the year, and bad input produces nothing rather than nonsense", () => {
  assert.equal(
    spreadEvenly(120, "2026-11", 4).map((l) => l.month).join(","),
    "2026-11,2026-12,2027-01,2027-02"
  );
  assert.equal(spreadEvenly(100, "2026-04", 0).length, 0);
  assert.equal(spreadEvenly(100, "nonsense", 3).length, 0);
});

/* -------------------------------------------------------------- the flag */

const NOW = new Date("2026-08-25T12:00:00Z");
const plan = (lines, contractValue = 0) => ({
  id: "p",
  opportunityId: "o",
  opportunityName: "n",
  customer: "c",
  contractValue,
  lines,
  updatedBy: "x",
  updatedAt: "2026-08-01T00:00:00Z",
});

test("a close date that has passed flags the plan and moves nothing", () => {
  const p = plan([{ month: "2026-09", amount: 100 }], 100);
  const frozen = JSON.stringify(p);
  const v = judgePlan(p, { status: "Propose", estSignDate: "2026-07-30" }, NOW);
  assert.ok(v.invalid);
  assert.ok(v.problems.includes("close_date_passed"));
  assert.match(v.headline, /has passed/);
  // Manoj: "if you keep pushing it, then I'm off the hook."
  assert.equal(JSON.stringify(p), frozen);
});

test("money stranded in months that have gone by is named and counted", () => {
  const v = judgePlan(
    plan([{ month: "2026-06", amount: 400 }, { month: "2026-09", amount: 600 }], 1000),
    { status: "Propose" },
    NOW
  );
  assert.ok(v.problems.includes("past_months_unbooked"));
  assert.equal(v.strandedAmount, 400);
});

test("a closed deal is not nagged about its past months", () => {
  for (const status of ["Won", "Lost"]) {
    const v = judgePlan(
      plan([{ month: "2026-06", amount: 400 }], 400),
      { status, estSignDate: "2026-01-01" },
      NOW
    );
    assert.equal(v.invalid, false, status);
  }
});

test("a plan that does not add up is flagged, but a rounding dollar is not", () => {
  assert.ok(
    judgePlan(plan([{ month: "2026-09", amount: 900 }], 1000), { status: "Propose" }, NOW)
      .problems.includes("does_not_add_up")
  );
  assert.equal(
    judgePlan(plan([{ month: "2026-09", amount: 999 }], 1000), { status: "Propose" }, NOW).invalid,
    false
  );
});

/* -------------------------------------------------- month-on-month gap */

const PLANS = [
  { ...plan([{ month: "2026-08", amount: 100 }, { month: "2026-09", amount: 300 }]), id: "p1", opportunityId: "d1", opportunityName: "Deal one", customer: "Acme" },
  { ...plan([{ month: "2026-09", amount: 500 }]), id: "p2", opportunityId: "d2", opportunityName: "Deal two", customer: "Beta" },
];
const SNAP = {
  id: "2026-07",
  takenAt: "2026-07-31T00:00:00Z",
  takenBy: "x",
  rows: [
    { opportunityId: "d1", opportunityName: "Deal one", customer: "Acme", byMonth: { "2026-08": 400 } },
    { opportunityId: "d3", opportunityName: "Deal three", customer: "Gamma", byMonth: { "2026-08": 200 } },
  ],
};

test("the gap is measured per month against the frozen sheet", () => {
  const dev = buildDeviation(PLANS, SNAP);
  assert.equal(dev.againstMonth, "2026-07");
  const aug = dev.byMonth.find((m) => m.month === "2026-08");
  assert.deepEqual([aug.was, aug.now, aug.delta], [600, 100, -500]);
  const sep = dev.byMonth.find((m) => m.month === "2026-09");
  assert.deepEqual([sep.was, sep.now], [0, 800]);
  assert.equal(dev.totalDelta, 300);
});

test("a deal that only SLIPPED a month is surfaced, not buried", () => {
  // "How many opportunities we thought will close in July are not closed in
  // July and are now spilling into August." Its net change is zero.
  const dev = buildDeviation(PLANS, SNAP);
  const d1 = dev.byDeal.find((d) => d.opportunityId === "d1");
  assert.equal(d1.delta, 0);
  assert.equal(d1.slipped, true);
  assert.equal(d1.movement, 300, "counted once, not once per side");
  assert.equal(
    d1.months.map((m) => `${m.month}:${m.delta}`).join(","),
    "2026-08:-300,2026-09:300"
  );
  // and it outranks a smaller straight loss
  assert.ok(
    dev.byDeal.findIndex((d) => d.opportunityId === "d1") <
      dev.byDeal.findIndex((d) => d.opportunityId === "d3")
  );
});

test("deals that appeared and deals that vanished both show", () => {
  const dev = buildDeviation(PLANS, SNAP);
  assert.equal(dev.byDeal.find((d) => d.opportunityId === "d2").delta, 500);
  assert.equal(dev.byDeal.find((d) => d.opportunityId === "d3").delta, -200);
});

test("with no frozen sheet it says so rather than inventing a baseline", () => {
  const dev = buildDeviation(PLANS, null);
  assert.equal(dev.againstMonth, null);
  assert.equal(dev.totalWas, 0);
  assert.equal(dev.totalNow, 900);
});

/* ------------------------------------------------------------ contracts */

const contract = (p) => ({
  id: "c", reference: "FR-C-0001", name: "", customer: "", value: 0,
  status: "Draft", schedule: [], createdBy: "x", createdAt: "",
  updatedBy: "x", updatedAt: "", ...p,
});

test("the delivery handshake reference never repeats a retired number", () => {
  assert.equal(nextContractReference([]), "FR-C-0001");
  assert.equal(nextContractReference([contract({ reference: "FR-C-0009" })]), "FR-C-0010");
  assert.equal(
    nextContractReference([contract({ reference: "FR-C-0001" }), contract({ reference: "FR-C-0007" })]),
    "FR-C-0008"
  );
  assert.equal(nextContractReference([contract({ reference: "legacy" })]), "FR-C-0001");
});

test("a contract is not handed to delivery half-finished", () => {
  assert.equal(readinessGaps(contract({})).length, 5);
  const whole = {
    name: "n", customer: "c", value: 100, startDate: "2026-09-01",
    schedule: [{ month: "2026-09", amount: 100 }],
  };
  assert.equal(readinessGaps(contract(whole)).length, 0);
  assert.ok(
    readinessGaps(contract({ ...whole, schedule: [{ month: "2026-09", amount: 40 }] }))
      .some((g) => /adds up/.test(g))
  );
});

test("schedule revenue supersedes the accrual plan only once it is real", () => {
  // "Once it is executed you don't need the accrual revenue in this sense."
  assert.ok(scheduleSupersedesAccrual(contract({ status: "Signed" })));
  assert.ok(scheduleSupersedesAccrual(contract({ status: "Ready for delivery" })));
  assert.equal(scheduleSupersedesAccrual(contract({ status: "Draft" })), false);
  assert.equal(scheduleSupersedesAccrual(contract({ status: "Cancelled" })), false);
});

/* ---------------------------------------------------------------- leads */

const lead = (p) => ({
  id: "l", ref: "LEAD-0001", name: "n", company: "c", source: "Website",
  status: "New", createdBy: "x", createdAt: "2026-08-01T00:00:00Z",
  updatedBy: "x", updatedAt: "2026-08-01T00:00:00Z", ...p,
});

test("lead references count on from the highest", () => {
  assert.equal(nextLeadRef([]), "LEAD-0001");
  assert.equal(nextLeadRef([lead({ ref: "LEAD-0042" })]), "LEAD-0043");
});

test("open means not yet converted and not yet dropped", () => {
  assert.ok(isOpenLead(lead({ status: "New" })));
  assert.equal(isOpenLead(lead({ status: "Converted" })), false);
  assert.equal(isOpenLead(lead({ status: "Disqualified" })), false);
});

test("a lead's age counts from the last time somebody moved it", () => {
  assert.equal(
    leadAgeDays(
      lead({ createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-08-20T00:00:00Z" }),
      Date.parse("2026-08-25T00:00:00Z")
    ),
    5
  );
});
