import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  QA_CAMPAIGN, withAgentQaRequest, authorizeAgentQaActor, guardedQaVertexRequest,
  completeQaVertexRequest, assertAgentQaProvider, isAgentQaRequest,
} from "../lib/agentQaBudget.ts";

const previousDirectory = process.cwd();
const previousEnv = { ...process.env };
const directory = mkdtempSync(path.join(tmpdir(), "freyr-budget-test-"));
process.chdir(directory);
mkdirSync(".qa-backups");
const file = path.join(directory, ".qa-backups/agent-paid-campaign.json");
const read = () => JSON.parse(readFileSync(file, "utf8"));
const actor = "reserved-offline-budget-test";
const request = { url: "http://localhost:3006/api/agent/converse", headers: new Headers({ "x-freyr-qa-campaign": QA_CAMPAIGN }) };
const generation = () => ({ model: "gemini-3.5-flash", contents: "No network calls in this test", config: {
  maxOutputTokens: 1800, temperature: .2, thinkingConfig: { thinkingLevel: "MINIMAL", includeThoughts: false },
  httpOptions: { timeout: 45_000, retryOptions: { attempts: 5 } },
} });
const setup = () => {
  Object.assign(process.env, { NODE_ENV: "development", AUTH_MODE: "supabase", GOOGLE_CLOUD_PROJECT: "sound-fastness-480519-a6", GOOGLE_CLOUD_LOCATION: "global", NEXT_PUBLIC_SUPABASE_URL: "https://ebyoefeikqxxxxifgjxk.supabase.co" });
  writeFileSync(file, JSON.stringify({ campaign: QA_CAMPAIGN, status: "active", googleAccount: "anirudhsuren@gmail.com", identityVerified: true, guardVerified: true, limitMicrousd: 10_000_000, reservedMicrousd: 0, allowedActorIds: [actor], reservations: [] }));
};
const scoped = (run) => withAgentQaRequest(request, async () => { authorizeAgentQaActor(actor); return run(); });

test.after(() => {
  process.chdir(previousDirectory);
  for (const key of Object.keys(process.env)) if (!(key in previousEnv)) delete process.env[key];
  Object.assign(process.env, previousEnv);
  rmSync(directory, { recursive: true, force: true });
});

test("ordinary conversations do not require a ledger or change model parameters", async () => {
  const original = generation();
  assert.equal(await withAgentQaRequest({ ...request, headers: new Headers() }, () => guardedQaVertexRequest(original)), original);
  assert.equal(isAgentQaRequest(), false);
});

test("production, wrong project, remote host and missing authentication are blocked", async () => {
  for (const [key, value] of [["NODE_ENV", "production"], ["GOOGLE_CLOUD_PROJECT", "wrong-project"], ["AUTH_MODE", ""]]) {
    setup(); process.env[key] = value;
    await assert.rejects(scoped(() => guardedQaVertexRequest(generation())), /development environment/);
    assert.equal(read().reservedMicrousd, 0);
  }
  setup();
  await assert.rejects(withAgentQaRequest({ ...request, url: "https://freyrsales.dev.freyrapps.com/api/agent/converse" }, async () => {}), /development environment/);
});

test("identity pending and unregistered accounts fail before a paid request", async () => {
  setup(); const ledger = read(); ledger.identityVerified = false; writeFileSync(file, JSON.stringify(ledger));
  await assert.rejects(scoped(async () => {}), /awaits verified/);
  setup();
  await assert.rejects(withAgentQaRequest(request, async () => authorizeAgentQaActor("real-user")), /disposable/);
  assert.equal(read().reservedMicrousd, 0);
});

test("reserve before transport, preserve generation settings, disable hidden SDK retries", async () => {
  setup(); const original = generation();
  await scoped(async () => {
    const bounded = await guardedQaVertexRequest(original);
    assert.equal(read().reservations.length, 1);
    assert.equal(read().reservations[0].inputTokens, 1_048_576);
    assert.equal(read().reservations[0].outputCeiling, 1800 + 65_536);
    assert.equal(bounded.config.httpOptions.retryOptions.attempts, 1);
    assert.equal(original.config.httpOptions.retryOptions.attempts, 5);
    for (const key of ["maxOutputTokens", "temperature", "thinkingConfig"]) assert.deepEqual(bounded.config[key], original.config[key]);
    assert.equal(bounded.contents, original.contents);
  });
});

test("successful settlement charges all input, thoughts and output with margin exactly once", async () => {
  setup();
  await scoped(async () => {
    const bounded = await guardedQaVertexRequest(generation());
    completeQaVertexRequest(bounded, { promptTokenCount: 10000, candidatesTokenCount: 1000, thoughtsTokenCount: 500, totalTokenCount: 11500, cachedContentTokenCount: 9000 });
    assert.equal(read().reservedMicrousd, Math.ceil((10000 * 1.5 + 1500 * 9) * 1.25));
    const settled = read().reservedMicrousd;
    completeQaVertexRequest(bounded, { promptTokenCount: 0, totalTokenCount: 0 });
    assert.equal(read().reservedMicrousd, settled);
  });
});

test("missing or inconsistent final metadata never refunds an interrupted call", async () => {
  setup();
  await scoped(async () => {
    const bounded = await guardedQaVertexRequest(generation()); const held = read().reservedMicrousd;
    for (const metadata of [undefined, { promptTokenCount: 1000 }, { promptTokenCount: 1000, candidatesTokenCount: 30, totalTokenCount: 1000 }, { promptTokenCount: -1, totalTokenCount: 0 }]) completeQaVertexRequest(bounded, metadata);
    assert.equal(read().reservedMicrousd, held);
    assert.equal(read().reservations[0].settled, undefined);
  });
});

test("errors and restarts retain reservations; the next call cannot cross the ceiling", async () => {
  setup();
  for (let index = 0; index < 3; index++) await scoped(() => guardedQaVertexRequest(generation()));
  const held = read().reservedMicrousd;
  await assert.rejects(scoped(() => guardedQaVertexRequest(generation())), /ceiling reached/);
  assert.equal(read().reservedMicrousd, held);
  assert.ok(held <= 9_000_000);
});

test("unknown model, grounding, candidates, caches and unbounded output fail closed", async () => {
  for (const modify of [r => r.model = "other", r => r.config.tools = [{ googleSearch: {} }], r => r.config.candidateCount = 2, r => r.config.cachedContent = "cache", r => delete r.config.maxOutputTokens]) {
    setup(); const attempt = generation(); modify(attempt);
    await assert.rejects(scoped(() => guardedQaVertexRequest(attempt)), /blocked|bounded/);
    assert.equal(read().reservedMicrousd, 0);
  }
});

test("fallback providers are rejected only in QA context, including asynchronous jobs", async () => {
  setup(); assert.doesNotThrow(() => assertAgentQaProvider("anthropic"));
  await scoped(async () => {
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(isAgentQaRequest(), true);
    assert.throws(() => assertAgentQaProvider("anthropic"), /fallback/);
    assert.throws(() => assertAgentQaProvider("openai"), /fallback/);
    assert.doesNotThrow(() => assertAgentQaProvider("vertex"));
  });
  assert.equal(isAgentQaRequest(), false);
});

test("a stale lock or corrupted ledger blocks transport", async () => {
  setup(); writeFileSync(`${file}.lock`, "held");
  await assert.rejects(scoped(() => guardedQaVertexRequest(generation())), /EEXIST/);
  assert.equal(read().reservedMicrousd, 0); rmSync(`${file}.lock`);
  const corrupted = read(); corrupted.reservedMicrousd = 1000; writeFileSync(file, JSON.stringify(corrupted));
  await assert.rejects(scoped(async () => {}), /invalid/);
});
