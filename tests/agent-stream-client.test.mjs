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


test("a burst of tiny tokens paints progressively without one render per token", async () => {
  const events = Array.from({ length: 2000 }, () => ({ type: "delta", text: "x" }));
  events.push({ type: "done", reply: "x".repeat(2000) });
  const response = new Response(events.map(event => JSON.stringify(event)).join("\n"), {
    headers: { "content-type": "application/x-ndjson" },
  });
  const previews = [];
  const result = await readAgentResponse(response, text => previews.push(text));
  assert.equal(previews[0], "x", "first token appears immediately");
  assert.equal(previews.at(-1), result.reply, "no final tokens lost");
  assert.ok(previews.length <= 3, `Unexpected ${previews.length} paints for one token burst`);
});

test("tool reset discards a queued preamble and leaves no late paints", async () => {
  const events = [
    { type: "delta", text: "Planning" },
    { type: "delta", text: " preamble to discard" },
    { type: "reset" },
    { type: "delta", text: "Actual answer." },
    { type: "done", reply: "Actual answer." },
  ];
  const response = new Response(events.map(event => JSON.stringify(event)).join("\n"), {
    headers: { "content-type": "application/x-ndjson" },
  });
  const previews = [];
  await readAgentResponse(response, text => previews.push(text));
  assert.deepEqual(previews, ["Planning", "", "Actual answer."]);
  await new Promise(resolve => setTimeout(resolve, 70));
  assert.deepEqual(previews, ["Planning", "", "Actual answer."]);
});

test("slow streaming still paints before the terminal event", async () => {
  let stream;
  const response = new Response(new ReadableStream({ start(controller) { stream = controller; } }), {
    headers: { "content-type": "application/x-ndjson" },
  });
  const previews = [], encoder = new TextEncoder();
  const send = event => stream.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
  const reading = readAgentResponse(response, text => previews.push(text));
  send({ type: "delta", text: "First " });
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.deepEqual(previews, ["First "]);
  send({ type: "delta", text: "second." });
  await new Promise(resolve => setTimeout(resolve, 70));
  assert.equal(previews.at(-1), "First second.", "pending text paints while request is still open");
  send({ type: "done", reply: "First second." });
  stream.close();
  assert.equal((await reading).reply, "First second.");
});
