import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

/**
 * EVERY ACTION LANDS ON A DOOR THAT EXISTS. The agent's actions are thin maps
 * onto the app's own routes, so the one way they rot is a route renaming an
 * op or a path while the map still points at the old name. Found the hard way
 * on Sep 27: the agent announced "the system requires assigning individual
 * people" because it had no map at all for an op the route had carried for
 * weeks. This reads both sides as text and refuses the mismatch.
 */
const actions = readFileSync(new URL("../lib/agentActions.ts", import.meta.url), "utf8");

/** { key, path, op? } for every action's call(). */
function inventory() {
  const out = [];
  /* Split on the key line itself, so an action that opens with a comment block
     is still counted and still checked. */
  const blocks = actions.split(/\n    key: "/).slice(1);
  for (const block of blocks) {
    const key = block.slice(0, block.indexOf('"'));
    const call = block.match(/call:\s*\(p\)\s*=>\s*\(\{([\s\S]*?)\}\)\s*,?\n/);
    if (!call) { out.push({ key, path: null }); continue; }
    const path = call[1].match(/path:\s*(?:"([^"]+)"|`([^`]+)`)/);
    const op = call[1].match(/op:\s*"([a-z-]+)"/);
    out.push({ key, path: path ? (path[1] ?? path[2]) : null, op: op ? op[1] : null, method: (call[1].match(/method:\s*"([A-Z]+)"/) ?? [])[1] });
  }
  return out;
}

function routeFile(path) {
  const clean = path.replace(/\$\{[^}]+\}/g, "[id]").replace(/^\//, "");
  const candidates = [
    `../app/${clean}/route.ts`,
    `../app/${clean.replace(/\/\[id\]$/, "/[id]")}/route.ts`,
  ];
  for (const c of candidates) { const u = new URL(c, import.meta.url); if (existsSync(u)) return readFileSync(u, "utf8"); }
  return null;
}

test("every action's call() points at a route file that exists", () => {
  const missing = inventory().filter((a) => a.path && !routeFile(a.path)).map((a) => `${a.key} -> ${a.path}`);
  assert.deepEqual(missing, []);
});

test("every action's op is one the route actually dispatches", () => {
  const bad = [];
  for (const a of inventory()) {
    if (!a.path || !a.op) continue;
    const src = routeFile(a.path);
    if (!src) continue;
    const ops = new Set([...src.matchAll(/(?:case|op ===)\s*"([a-z-]+)"/g)].map((m) => m[1]));
    if (!ops.has(a.op)) bad.push(`${a.key}: op "${a.op}" not in ${a.path}`);
  }
  assert.deepEqual(bad, []);
});

test("every action's method is one the route exports", () => {
  const bad = [];
  for (const a of inventory()) {
    if (!a.path || !a.method) continue;
    const src = routeFile(a.path);
    if (!src) continue;
    if (!new RegExp(`export async function ${a.method}\\b`).test(src)) bad.push(`${a.key}: ${a.method} ${a.path}`);
  }
  assert.deepEqual(bad, []);
});

test("the action count is what the audit left", () => {
  const n = inventory().length;
  assert.ok(n >= 67, `expected at least 67 actions, found ${n}`);
});
