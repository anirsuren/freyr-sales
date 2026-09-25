import assert from "node:assert/strict";
import test from "node:test";
import { readAgentResponse, requestAgentResponse } from "../lib/agentStreamClient.ts";

test("streamed Agent reply preserves split words and hides follow-up metadata", async () => {
  const encoder = new TextEncoder();
  const events = [
    { type: "delta", text: "The pipe" },
    { type: "delta", text: "line is $36M.\n<fol" },
    { type: "delta", text: 'lowups>["What next?"]</followups>' },
    { type: "done", reply: "The pipeline is $36M.", suggestions: ["What next?"] },
  ].map((event) => `${JSON.stringify(event)}\n`).join("");
  const bytes = encoder.encode(events);
  const previews = [];
  const response = new Response(new ReadableStream({
    start(controller) {
      for (let i = 0; i < bytes.length; i += 3) controller.enqueue(bytes.slice(i, i + 3));
      controller.close();
    },
  }), { headers: { "content-type": "application/x-ndjson" } });

  const result = await readAgentResponse(response, (preview) => previews.push(preview));
  assert.equal(result.reply, "The pipeline is $36M.");
  assert.equal(previews.at(-1), "The pipeline is $36M.\n");
  assert.ok(previews.every((preview) => !preview.includes("<followups>")));
});

test("ordinary JSON responses still work when a tool call is needed", async () => {
  const response = Response.json({ reply: "A sourced answer.", suggestions: [] });
  assert.equal((await readAgentResponse(response, () => {})).reply, "A sourced answer.");
});

test("a transient pre-answer failure retries once with the same question", async () => {
  const originalFetch = globalThis.fetch;
  const bodies = [];
  globalThis.fetch = async (_url, options) => {
    bodies.push(options.body);
    return bodies.length === 1
      ? Response.json({ error: "temporarily unavailable" }, { status: 503 })
      : Response.json({ reply: "Recovered answer." });
  };
  try {
    const result = await requestAgentResponse({ message: "August results" }, new AbortController().signal, () => {});
    assert.equal(result.reply, "Recovered answer.");
    assert.deepEqual(bodies, ['{"message":"August results"}', '{"message":"August results"}']);
  } finally { globalThis.fetch = originalFetch; }
});

test("a broken stream is not replayed after answer text appears", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    let sent = false;
    return new Response(new ReadableStream({
      pull(controller) {
        if (!sent) {
          sent = true;
          controller.enqueue(new TextEncoder().encode('{"type":"delta","text":"Partial"}\n'));
        } else controller.error(new Error("stream stopped"));
      },
    }), { headers: { "content-type": "application/x-ndjson" } });
  };
  try {
    await assert.rejects(requestAgentResponse({ message: "test" }, new AbortController().signal, () => {}));
    assert.equal(calls, 1);
  } finally { globalThis.fetch = originalFetch; }
});
