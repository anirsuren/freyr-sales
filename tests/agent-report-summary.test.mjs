import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url),
  Module = require("node:module"),
  load = Module._load;
let customers = [],
  opportunities = [],
  reads = [],
  denied = new Set();
const actor = {
  userId: "rep",
  name: "Rep",
  role: "admin",
  workspaceId: "fixture",
  subject: "signed",
};
const offerings = [
  { id: "a", offering_name: "Offering A", offering_category: "Category" },
  { id: "b", offering_name: "Offering B", offering_category: "Category" },
];
const customer = (id, usage = []) => ({
  id,
  company_name: `Customer ${id}`,
  owner_user_id: "rep",
  offering_usage: usage,
  offerings_in_use: [],
});
const usage = (id, engagements = [], lines = []) => ({
  offering_id: id,
  revenue_lines: lines,
  engagement_versions: engagements,
});
const engagement = (extra = {}) => ({
  id: "eng",
  version: 1,
  linked: true,
  activity: "pilot",
  status: "under_progress",
  dollar_value: 20,
  currency: "EUR",
  opportunity_ids: [],
  ...extra,
});
const opportunity = (extra = {}) => ({
  id: "opp",
  name: "Deal",
  customerId: "one",
  customer: "Customer one",
  offeringIds: ["a"],
  offeringLabels: [],
  value: 99,
  currency: "USD",
  status: "Won",
  ...extra,
});
const mocks = {
  "server-only": {},
  "./materialAccess": {},
  "./viewerAccess": {},
  "./leads": {},
  "./contracts": {},
  "./solutioning": {},
  "./performance": {},
  "./marketIntelBookmarks": {},
  "./marketIntelTracking": {},
  "./moduleAccessServer": { canOpenModule: async (path) => !denied.has(path) },
  "./offerings": {
    initializeLiveOfferings: async () => {},
    listOfferings: () => offerings,
  },
  "./opportunities": {
    readOpportunities: async () => {
      reads.push("opportunities");
      return { opportunities };
    },
  },
  "./db": {
    getDb: () => ({
      customers: {
        list: async () => {
          reads.push("customers");
          return customers;
        },
      },
      pitchSessions: { list: async () => [] },
      contacts: { list: async () => [] },
      interactions: { list: async () => [] },
    }),
  },
};
Module._load = function (name, ...args) {
  return mocks[name] || load.call(this, name, ...args);
};
const { readAgentWorkspace } = require("../lib/agentWorkspace.ts");
Module._load = load;
const reset = () => {
  customers = [];
  opportunities = [];
  reads = [];
  denied = new Set();
};
const read = async (mine = false) =>
  JSON.parse(await readAgentWorkspace(actor, "reports", "", mine));
const heat = (result) =>
  result.records.find((r) => r.id === "customer-offering-heat-map");

test("reports and source module gates prevent data reads", async () => {
  for (const path of ["/reports", "/customers", "/offerings"]) {
    reset();
    denied.add(path);
    await readAgentWorkspace(actor, "reports");
    assert.deepEqual(reads, []);
  }
});
test("portfolio uses recorded USD revenue lines and licence counts", async () => {
  reset();
  customers = [
    customer("one", [
      usage(
        "a",
        [],
        [
          {
            id: "line",
            revenue_type: "license",
            amount: 150,
            num_licenses: 5,
            start_date: null,
            end_date: null,
          },
        ],
      ),
    ]),
  ];
  const result = await read();
  const portfolio = result.records[0];
  assert.equal(portfolio.currency, "USD");
  assert.equal(portfolio.revenue, 150);
  assert.equal(portfolio.licensedSeats, 5);
  assert.equal(portfolio.revenueLineCount, 1);
  assert.equal(portfolio.activeRevenueLines, 1);
  assert.equal(portfolio.byOffering.length, 2);
});
test("selected Report row wins over opportunity; explicit currency retained", async () => {
  reset();
  customers = [customer("one", [usage("a", [engagement()])])];
  opportunities = [opportunity()];
  const result = await read();
  const h = heat(result);
  assert.equal(h.selectedReportCells, 1);
  assert.equal(h.byActivity.pilot, 1);
  assert.deepEqual(h.valueByCurrency, { EUR: 20 });
  assert.equal(h.coveragePercent, 50);
});
test("unselected history blocks automatic fallback and stays empty", async () => {
  reset();
  customers = [customer("one", [usage("a", [engagement({ linked: false })])])];
  opportunities = [opportunity()];
  const h = heat(await read());
  assert.equal(h.populatedCells, 0);
  assert.equal(h.unselectedHistoryCells, 1);
  assert.equal(h.emptyCells, 2);
});
test("no history permits exact opportunity fallback including offering line identities", async () => {
  reset();
  customers = [customer("one")];
  opportunities = [
    opportunity({
      offeringIds: [],
      lines: [{ offeringId: "a", value: 40 }],
      currency: "INR",
    }),
  ];
  const h = heat(await read());
  assert.equal(h.derivedCells, 1);
  assert.equal(h.byActivity.contract, 1);
  assert.deepEqual(h.valueByCurrency, { INR: 40 });
});
test("mixed currencies within a derived cell are flagged, never summed as dollars", async () => {
  reset();
  customers = [customer("one")];
  opportunities = [opportunity(), opportunity({ id: "eur", currency: "EUR" })];
  const h = heat(await read());
  assert.equal(h.mixedCurrencyCells, 1);
  assert.deepEqual(h.valueByCurrency, {});
});
test("denied opportunity source is not read; partial fallback clearly labelled", async () => {
  reset();
  customers = [customer("one")];
  opportunities = [opportunity()];
  denied.add("/opportunities");
  const h = heat(await read());
  assert.equal(h.pipelineFallbackAvailable, false);
  assert.equal(h.populatedCells, 0);
  assert.deepEqual(reads, ["customers"]);
});
test("mineOnly uses stable ownership instead of matching a misleading display name", async () => {
  reset();
  customers = [
    customer("one"),
    { ...customer("two"), owner: "Rep", owner_user_id: "different" },
  ];
  const h = heat(await read(true));
  assert.equal(h.customers, 1);
  assert.equal(h.totalCells, 2);
});
test("per-customer cells retain canonical links and paginate independently of full aggregates", async () => {
  reset();
  customers = Array.from({ length: 75 }, (_, i) => customer(String(i)));
  const r = await read();
  assert.equal(heat(r).customers, 75);
  assert.equal(r.total, 77);
  assert.equal(r.truncated, true);
  assert.equal(r.records[2].url, "/customers/0");
  assert.equal(r.records[2].reportUrl, "/reports/customer-offering-heat-map");
});
