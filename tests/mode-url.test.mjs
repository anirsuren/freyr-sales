import test from "node:test";
import assert from "node:assert/strict";

import {
  addMockModePrefix,
  isMockModePath,
  replaceAppBrowserUrl,
  stripMockModePrefix,
} from "../lib/modeUrl.ts";

test("mock-mode labels every internal app path exactly once", () => {
  assert.equal(addMockModePrefix("/components"), "/mock-mode/components");
  assert.equal(
    addMockModePrefix("/offerings/of-019?tab=reports"),
    "/mock-mode/offerings/of-019?tab=reports"
  );
  assert.equal(
    addMockModePrefix("/mock-mode/components"),
    "/mock-mode/components"
  );
  assert.equal(addMockModePrefix("https://example.com"), "https://example.com");
});

test("mock and live addresses compare as the same application route", () => {
  assert.equal(stripMockModePrefix("/mock-mode/components"), "/components");
  assert.equal(
    stripMockModePrefix("/mock-mode/offerings/of-019?tab=reports"),
    "/offerings/of-019?tab=reports"
  );
  assert.equal(stripMockModePrefix("/mock-mode?tab=x"), "/?tab=x");
  assert.equal(stripMockModePrefix("/components"), "/components");
});

test("only a complete mock-mode path segment counts as the label", () => {
  assert.equal(isMockModePath("/mock-mode/components"), true);
  assert.equal(isMockModePath("/mock-mode"), true);
  assert.equal(isMockModePath("/mock-model"), false);
  assert.equal(isMockModePath("/mock-modeled/components"), false);
});

test("browser URL replacement preserves Next state and the active mock label", () => {
  const nextState = { __NA: true, tree: ["route"] };
  let replacement = null;
  globalThis.window = {
    location: {
      href: "https://sales.test/mock-mode/performance/people?logGoal=g1",
      origin: "https://sales.test",
      pathname: "/mock-mode/performance/people",
    },
    history: {
      state: nextState,
      replaceState(state, _unused, url) {
        replacement = { state, url };
      },
    },
  };

  replaceAppBrowserUrl("/performance/people");
  assert.deepEqual(replacement, {
    state: nextState,
    url: "https://sales.test/mock-mode/performance/people",
  });
  delete globalThis.window;
});
