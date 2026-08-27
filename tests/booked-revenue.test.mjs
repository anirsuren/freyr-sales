import test from "node:test";
import assert from "node:assert/strict";

import { contractCounts } from "../lib/contractsShared.ts";

/**
 * WHEN A SIGNED CONTRACT PUTS ITS VALUE ON A GOAL.
 *
 * Suren, Aug 18: a contract is what produces booked revenue. Anir, Aug 26, on
 * which goal it lands against: "Yeah, the person picks the goal."
 *
 * All four conditions are load-bearing, and every one of them was chosen to
 * stop a specific lie:
 *
 *   status Signed   a draft is sales still typing
 *   signedOn        no signature date means it has not landed yet, and the
 *                   entry is BACKDATED to that month, so a missing one would
 *                   silently post the money into today instead
 *   value > 0       a zero is not a result
 *   a goal          "the person picks the goal" — an unclaimed number is not
 *                   anybody's performance
 *
 *   npm run test:booked
 */

const base = {
  id: "c1",
  reference: "FR-C-0001",
  name: "Platform licence",
  customer: "CuraTeQ",
  value: 250000,
  status: "Signed",
  signedOn: "2026-08-20",
  goalLink: { goalId: "g1" },
  schedule: [],
  createdBy: "x", createdAt: "", updatedBy: "x", updatedAt: "",
};

test("a signed contract with a date, a value and a goal counts", () => {
  assert.equal(contractCounts(base), true);
});

test("a draft never counts, however complete it looks", () => {
  assert.equal(contractCounts({ ...base, status: "Draft" }), false);
});

test("ready for delivery is not signed yet", () => {
  assert.equal(contractCounts({ ...base, status: "Ready for delivery" }), false);
});

test("a cancelled contract counts nothing", () => {
  assert.equal(contractCounts({ ...base, status: "Cancelled" }), false);
});

test("no signature date, no posting", () => {
  // Booked revenue is backdated to the month it was signed. Without that date
  // the money would quietly land in today's month instead, which is the exact
  // kind of number nobody can trace back.
  assert.equal(contractCounts({ ...base, signedOn: undefined }), false);
  assert.equal(contractCounts({ ...base, signedOn: "" }), false);
  assert.equal(contractCounts({ ...base, signedOn: "   " }), false);
});

test("a zero or missing value is not a result", () => {
  assert.equal(contractCounts({ ...base, value: 0 }), false);
  assert.equal(contractCounts({ ...base, value: undefined }), false);
});

test("a negative value never counts", () => {
  assert.equal(contractCounts({ ...base, value: -5000 }), false);
});

test("no goal chosen posts nothing at all", () => {
  // Never inferred from the offering, the customer or the owner's group.
  assert.equal(contractCounts({ ...base, goalLink: undefined }), false);
  assert.equal(contractCounts({ ...base, goalLink: { goalId: "" } }), false);
});

test("the person is optional; the goal is not", () => {
  assert.equal(contractCounts({ ...base, goalLink: { goalId: "g1" } }), true);
  assert.equal(
    contractCounts({ ...base, goalLink: { goalId: "g1", person: "Ravi" } }),
    true
  );
});

test("an already posted contract still counts, so a re-save adopts its entry", () => {
  // The double-count guard depends on this staying true: if a posted contract
  // stopped counting, the next save would take its entry down and write a new
  // one, and the goal would flicker between two ids for the same money.
  assert.equal(
    contractCounts({ ...base, goalLink: { goalId: "g1", actualId: "a1", postedAt: "2026-08-20" } }),
    true
  );
});
