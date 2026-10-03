import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Module = require("node:module");
const load = Module._load;
let role = "bd_member", access = null, users = 0, maps = 0;
const mocks = {
  "./currentUser": { getCurrentUser: async () => { users++; return { role }; } },
  "./viewerAccess": { viewerAccessMap: async () => { maps++; return access; } },
};
Module._load = function (name, ...args) {
  return mocks[name] || load.call(this, name, ...args);
};
const { canOpenModule, canOpenModules } = require("../lib/moduleAccessServer.ts");
Module._load = load;
const paths = ["/agent", "/offerings", "/customers", "/contacts", "/team",
  "/components", "/opportunities", "/contracts", "/leads", "/goals",
  "/reports", "/market-intel", "/solutioning", "/meetings", "/pipeline",
  "/forecast", "/tasks", "/campaigns", "/sequences"];

test("batch keeps every individual access decision across roles and privilege maps", async () => {
  for (role of ["admin", "bd_owner", "bd_member", "sol_member"]) {
    for (access of [null, {}, { offerings: "view", customers: "none", opportunities: "edit" }]) {
      const individual = await Promise.all(paths.map(async path => [path, await canOpenModule(path)]));
      users = maps = 0;
      assert.deepEqual([...await canOpenModules(paths)], individual);
      assert.equal(users, 1, "one identity resolution per batch");
      assert.equal(maps, 1, "one privilege resolution per batch");
    }
  }
});

test("a later batch observes changed privileges and does not reuse another user's access", async () => {
  role = "bd_member"; access = { offerings: "view" };
  assert.equal((await canOpenModules(["/offerings"])).get("/offerings"), true);
  access = { offerings: "none" };
  assert.equal((await canOpenModules(["/offerings"])).get("/offerings"), false);
  role = "admin";
  assert.equal((await canOpenModules(["/offerings"])).get("/offerings"), true);
});
