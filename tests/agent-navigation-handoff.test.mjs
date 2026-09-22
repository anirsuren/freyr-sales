import assert from "node:assert/strict";
import test from "node:test";

import {
  AGENT_DOCK_ACTIVE_KEY,
  consumeAgentNavigationHandoff,
  queueAgentNavigationHandoff,
} from "../lib/agentNavigationHandoff.ts";
import { userScopedStorageKey } from "../lib/userIdentity.ts";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test("agent navigation hands the active conversation to the dock once", () => {
  const storage = memoryStorage();
  queueAgentNavigationHandoff("person-1", "conversation-9", storage);

  assert.equal(
    storage.getItem(userScopedStorageKey(AGENT_DOCK_ACTIVE_KEY, "person-1")),
    "conversation-9"
  );
  assert.equal(consumeAgentNavigationHandoff("person-1", storage), true);
  assert.equal(consumeAgentNavigationHandoff("person-1", storage), false);
});

test("agent navigation handoffs stay isolated by user", () => {
  const storage = memoryStorage();
  queueAgentNavigationHandoff("person-1", "conversation-9", storage);

  assert.equal(consumeAgentNavigationHandoff("person-2", storage), false);
  assert.equal(consumeAgentNavigationHandoff("person-1", storage), true);
});
