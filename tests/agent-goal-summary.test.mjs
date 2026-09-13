import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url),
  Module = require("node:module"),
  load = Module._load;
let role = "admin",
  state;
const actor = {
  userId: "rep",
  workspaceId: "fixture",
  role: "bd_member",
  name: "Rep",
  subject: "signed",
};
const goal = (id, extra = {}) => ({
  id,
  name: `Goal ${id}`,
  type: "Sales",
  unit: "count",
  measure: "total",
  year: 2026,
  target: 100,
  pickedForOrg: true,
  verified: true,
  subgoals: [],
  assignments: [
    { person: "Rep", target: 20, verified: true },
    { person: "Other", target: 80, verified: true },
  ],
  createdBy: "Admin",
  createdAt: "2026-01-01",
  ...extra,
});
const actual = (id, goalId, amount, extra = {}) => ({
  id,
  goalId,
  subgoalId: null,
  person: "Rep",
  amount,
  date: "2026-08-01",
  addedAt: "2026-08-01T12:00:00Z",
  status: "verified",
  ...extra,
});
const reset = (goals, actuals = []) => {
  role = "admin";
  state = {
    goals,
    actuals,
    types: [],
    groups: [],
    rates: { USD: 1, EUR: 0.8 },
  };
};
const mocks = {
  "server-only": {},
  "./materialAccess": { canViewOfferingMaterial: () => true },
  "./moduleAccessServer": { canOpenModule: async () => true },
  "./viewerAccess": { resolveViewerAccess: async () => ({ role }) },
  "./performance": { readPerformance: async () => state },
  "./leads": {},
  "./opportunities": {},
  "./contracts": {},
  "./solutioning": {},
  "./offerings": {},
  "./marketIntelBookmarks": {},
  "./marketIntelTracking": {},
};
Module._load = function (name, ...args) {
  return mocks[name] || load.call(this, name, ...args);
};
const { readAgentWorkspace } = require("../lib/agentWorkspace.ts");
Module._load = load;
const read = async (mine = false) =>
  JSON.parse(await readAgentWorkspace(actor, "goals", "", mine));

test("verified and pending values are separate and no pace is invented", async () => {
  reset(
    [goal("one")],
    [
      actual("a", "one", 10),
      actual("b", "one", 20, { status: "reported" }),
      actual("c", "one", 5, { status: "sent_back" }),
    ],
  );
  const {
    records: [g],
    summary,
  } = await read();
  assert.equal(g.verifiedValue, 10);
  assert.equal(g.pendingValue, 25);
  assert.equal(g.percentMet, 10);
  assert.equal(g.targetGap, 90);
  assert.equal(g.pace, "unscheduled");
  assert.equal(summary.laggingScheduledCount, 0);
  assert.equal(g.actuals, undefined);
});
test("organization pacing uses only recorded due milestones", async () => {
  reset(
    [
      goal("due", { milestones: [{ date: "2020-01-01", amount: 50 }] }),
      goal("future", { milestones: [{ date: "2099-01-01", amount: 50 }] }),
    ],
    [actual("a", "due", 10)],
  );
  const { records } = await read();
  assert.equal(records[0].pace, "lagging");
  assert.deepEqual(records[0].dueMilestone, { date: "2020-01-01", amount: 50 });
  assert.equal(records[1].pace, "unscheduled");
});
test("rep scope replaces organization targets with only their recorded shares", async () => {
  reset(
    [
      goal("one", { milestones: [{ date: "2020-01-01", amount: 90 }] }),
      goal("private", {
        assignments: [{ person: "Other", target: 100, verified: true }],
      }),
    ],
    [actual("a", "one", 10), actual("b", "one", 70, { person: "Other" })],
  );
  role = "bd_member";
  const result = await read();
  assert.equal(result.records.length, 1);
  const g = result.records[0];
  assert.equal(g.target, 20);
  assert.equal(g.verifiedValue, 10);
  assert.equal(g.percentMet, 50);
  assert.equal(g.pace, "unscheduled");
  assert.equal(g.assignedPeople, 1);
  assert.ok(!JSON.stringify(result).includes("Other"));
});
test("mineOnly restricts even an admin to their own target and actuals", async () => {
  reset(
    [goal("one")],
    [actual("a", "one", 10), actual("b", "one", 70, { person: "Other" })],
  );
  const {
    records: [g],
  } = await read(true);
  assert.equal(g.target, 20);
  assert.equal(g.verifiedValue, 10);
});
test("headed group visibility follows existing shared scope helper", async () => {
  reset(
    [goal("one")],
    [actual("a", "one", 10), actual("b", "one", 70, { person: "Other" })],
  );
  role = "bd_member";
  state.groups = [
    { id: "team", name: "Team", head: "Rep", members: ["Other"] },
  ];
  const {
    records: [g],
  } = await read();
  assert.equal(g.target, 100);
  assert.equal(g.verifiedValue, 80);
  assert.equal(g.pace, "unscheduled");
});
test("level goals use latest readings and composite goals roll up their family", async () => {
  reset(
    [
      goal("ratio", { unit: "percent", measure: "level", target: 50 }),
      goal("sum", { componentGoalIds: ["a", "b"] }),
    ],
    [
      actual("r1", "ratio", 10, { date: "2026-07-01" }),
      actual("r2", "ratio", 40),
      actual("a1", "a", 12),
      actual("b1", "b", 8),
    ],
  );
  const { records } = await read();
  assert.equal(records[0].verifiedValue, 40);
  assert.equal(records[0].percentMet, 80);
  assert.equal(records[0].pace, "unscheduled");
  assert.equal(records[1].verifiedValue, 20);
});
test("currency rollup uses recorded FX and declares the output currency", async () => {
  reset(
    [goal("money", { unit: "currency", currency: "USD" })],
    [actual("a", "money", 8, { currency: "EUR" })],
  );
  const {
    records: [g],
  } = await read();
  assert.equal(g.currency, "USD");
  assert.equal(g.verifiedValue, 10);
});
test("unset targets do not manufacture percentages or gaps", async () => {
  reset([goal("unset", { target: 0 })]);
  const {
    records: [g],
  } = await read();
  assert.equal(g.targetStatus, "unset");
  assert.equal(g.percentMet, null);
  assert.equal(g.targetGap, null);
});
test("34 goals with thousands of logs remain compact and fully returned", async () => {
  const goals = Array.from({ length: 34 }, (_, i) => goal(String(i)));
  const actuals = goals.flatMap((g) =>
    Array.from({ length: 100 }, (_, i) =>
      actual(`${g.id}-${i}`, g.id, 1, {
        note: "Long source detail ".repeat(100),
      }),
    ),
  );
  reset(goals, actuals);
  const result = await read();
  assert.equal(result.shown, 34);
  assert.equal(result.truncated, false);
  assert.ok(JSON.stringify(result).length < 20000);
  assert.equal(result.summary.metCount, 34);
});
