import assert from "node:assert/strict";
import test from "node:test";
import { readAgentResponse } from "../lib/agentStreamClient.ts";

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
