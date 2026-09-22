import test from "node:test";
import assert from "node:assert/strict";
import { visibleResponseText } from "../lib/vertex.ts";

test("Vertex responses never expose model thoughts", () => {
  const response = {
    candidates: [
      {
        content: {
          parts: [
            { thought: true, text: "I should inspect the workspace first." },
            { text: "Here is the answer the user should see." },
          ],
        },
      },
    ],
  };

  assert.equal(
    visibleResponseText(response),
    "Here is the answer the user should see."
  );
});

test("Vertex visible text preserves multiple answer parts", () => {
  const response = {
    candidates: [
      {
        content: {
          parts: [{ text: "First sentence. " }, { text: "Second sentence." }],
        },
      },
    ],
  };

  assert.equal(
    visibleResponseText(response),
    "First sentence. Second sentence."
  );
});
