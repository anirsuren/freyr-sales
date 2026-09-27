import test from "node:test";
import assert from "node:assert/strict";

/* No Supabase env: the store keeps proposals in memory, which is what these
   tests want. */
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const store = await import("../lib/agentActionStore.ts");
const scope = { workspaceId: "ws-test", userId: "user-test" };

test("a new proposal in the same conversation supersedes the open one; other conversations stay open", async () => {
  const a = await store.addProposal(scope, { id: "a", action: "assign_goal", params: {}, summary: "A", channel: "web", conversationId: "chat-1" });
  const b = await store.addProposal(scope, { id: "b", action: "assign_goal", params: {}, summary: "B", channel: "whatsapp", conversationId: "wa-1" });
  const c = await store.addProposal(scope, { id: "c", action: "assign_goal", params: {}, summary: "C", channel: "web", conversationId: "chat-1" });
  const pending = await store.pendingProposals(scope);
  assert.deepEqual(pending.map((p) => p.id).sort(), ["b", "c"]);
  assert.equal((await store.getProposal(scope, a.id)).status, "cancelled");
  assert.equal((await store.getProposal(scope, b.id)).status, "proposed");
  assert.equal((await store.getProposal(scope, c.id)).status, "proposed");
});

test("an expired proposal reads as expired and is no longer pending", async () => {
  const d = await store.addProposal(scope, { id: "d", action: "star_company", params: {}, summary: "D", channel: "web", conversationId: "chat-2" });
  await store.updateProposal(scope, d.id, { expiresAt: Date.now() - 1 });
  assert.equal((await store.getProposal(scope, d.id)).status, "expired");
  assert.ok(!(await store.pendingProposals(scope)).some((p) => p.id === d.id));
});

test("updates land on the right proposal and pending is newest first", async () => {
  const e = await store.addProposal(scope, { id: "e", action: "create_lead", params: {}, summary: "E", channel: "web", conversationId: "chat-3" });
  await new Promise((r) => setTimeout(r, 5));
  const f = await store.addProposal(scope, { id: "f", action: "create_lead", params: {}, summary: "F", channel: "web", conversationId: "chat-4" });
  await store.updateProposal(scope, e.id, { status: "done", result: "did E" });
  assert.equal((await store.getProposal(scope, e.id)).result, "did E");
  const pending = await store.pendingProposals(scope);
  assert.equal(pending[0].id, f.id);
  assert.equal(await store.getProposal(scope, "nope"), null);
});
