import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url),
  Module = require("node:module"),
  oldLoad = Module._load;
Module._load = function (name, ...args) {
  return name === "server-only" ? {} : oldLoad.call(this, name, ...args);
};
const {
  enqueueCompany,
  runCompanyOnboarding,
  retryCompanyOnboarding,
} = require("../lib/marketIntelOnboarding.ts");
const { seedCompanies } = require("../lib/marketIntelTracking.ts");
const {
  collectedInCurrentCycle,
  nextMarketIntelCycle,
} = require("../lib/marketIntelCadence.ts");
require("../lib/marketIntelRefresh.ts");
Module._load = oldLoad;
test("queued onboarding survives independent reads, claims once, persists the briefing, and retries failures", async () => {
  const oldFetch = globalThis.fetch;
  const keys = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "APIFY_API_TOKEN",
    "PERPLEXITY_API_KEY",
    "ANTHROPIC_API_KEY",
  ];
  const env = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://onboarding-test.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test";
  for (const k of keys.slice(2)) delete process.env[k];
  const catalog = { companies: [], people: [], divisions: {} };
  seedCompanies(catalog);
  const rows = new Map([
    [
      "market-intel:default",
      { catalog, updated_at: "2020-01-01T00:00:00.000Z" },
    ],
  ]);
  let sourceCalls = 0,
    failSources = false;
  const leases = new Set();
  const stages = new Set();
  const previews = [];
  const sourceRequests = [];
  globalThis.fetch = async (input, init) => {
    const u = new URL(String(input));
    const method = init?.method || "GET";
    if (u.hostname === "onboarding-test.invalid") {
      const raw = u.searchParams.get("id") || "",
        id = raw.replace(/^eq\./, "");
      if (method === "GET") {
        if (raw.startsWith("like."))
          return Response.json(
            [...rows]
              .filter(([k]) => k.startsWith(raw.slice(5).replace(/%$/, "")))
              .map(([id, row]) => ({ id, ...row })),
          );
        return Response.json(rows.get(id) || null);
      }
      assert.ok(["POST", "PATCH"].includes(method));
      const body = JSON.parse(init.body),
        rowId = id || body.id;
      if (
        method === "PATCH" &&
        u.searchParams.get("updated_at") !== `eq.${rows.get(rowId)?.updated_at}`
      )
        return Response.json([]);
      if (rowId === "market-intel:default")
        for (const c of body.catalog.companies)
          if (c.onboarding?.lease) {
            leases.add(c.onboarding.lease);
            if (c.onboarding.stage) {
              assert.ok(Number.isFinite(Date.parse(c.onboarding.stageStartedAt)));
              stages.add(c.onboarding.stage);
            }
          }
      if (rowId.startsWith("market-intel-company:")) {
        const job = rows.get("market-intel:default").catalog.companies.find(c => `market-intel-company:${c.id}` === rowId)?.onboarding;
        if (job?.status === "collecting") previews.push({stage: job.stage, company: structuredClone(body.catalog.company)});
      }
      rows.set(rowId, { catalog: body.catalog, updated_at: body.updated_at });
      return Response.json([{ id: rowId }]);
    }
    sourceCalls++;
    sourceRequests.push(u.href);
    if (failSources) throw new Error("Fixture source unavailable");
    if (u.hostname === "queuedscience.test") {
      if (
        u.pathname !== "/" &&
        u.pathname !== "/news/queued-science-announces-new-research"
      )
        return new Response("", { status: 404 });
      return new Response(
        u.pathname === "/"
          ? '<title>Queued Science</title><a href="/news/queued-science-announces-new-research">Queued Science announces new research</a>'
          : `<h1>Queued Science announces new research</h1><meta property="og:type" content="article"><meta property="article:published_time" content="${new Date().toISOString()}">`,
      );
    }
    if (u.hostname === "news.google.com")
      return new Response(
        `<rss><channel><item><title>Queued Science expands research - Publisher</title><link>https://publisher.test/story</link><pubDate>${new Date().toUTCString()}</pubDate><source>Publisher</source></item></channel></rss>`,
      );
    if (u.hostname === "www.google.com")
      return new Response("", { status: 404 });
    throw new Error(`Unexpected request ${u.hostname}`);
  };
  try {
    const submissions = await Promise.allSettled(
      Array.from({ length: 2 }, () =>
        enqueueCompany(
          { name: "Queued Science", website: "queuedscience.test" },
          "competitor",
          { divisions: ["MPR"], addedBy: { id: "test" } },
        ),
      ),
    );
    assert.equal(submissions.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(submissions.filter((r) => r.status === "rejected").length, 1);
    const c = submissions.find((r) => r.status === "fulfilled").value;
    assert.equal(sourceCalls, 0);
    assert.equal(c.onboarding.status, "queued");
    const reread = await (
      await fetch(
        "https://onboarding-test.invalid/rest/v1/offering_catalog_state?id=eq.market-intel:default",
      )
    ).json();
    assert.equal(
      reread.catalog.companies.find((x) => x.id === c.id).onboarding.status,
      "queued",
    );
    await assert.rejects(
      () =>
        enqueueCompany({ website: "queuedscience.test" }, "competitor", {
          divisions: ["MPR"],
        }),
      /already exists/,
    );
    assert.equal(sourceCalls, 0);
    await Promise.all([runCompanyOnboarding(), runCompanyOnboarding()]);
    const done = rows
      .get("market-intel:default")
      .catalog.companies.find((x) => x.id === c.id);
    assert.equal(done.onboarding, undefined);
    assert.deepEqual([...stages], ["identity", "sources", "briefing", "saving"]);
    assert.ok(
      rows.get(`market-intel-company:${c.id}`).catalog.company.site.length,
    );
    assert.ok(previews.some(p => p.stage === "sources" && p.company.site?.length), "Website items are persisted while collection is still in progress");
    assert.ok(previews.filter(p => p.stage === "sources").every(p => p.company.news.length === 0), "Unverified external candidates are not published early");
    assert.equal(done.id, c.id);
    assert.equal(leases.size, 1, "Concurrent workers claimed only once");
    // Expired worker lease, as after a process restart, is recoverable.
    done.onboarding = {
      status: "collecting",
      lease: "dead-process",
      leaseUntil: 1,
      attempts: 1,
      updatedAt: "2020-01-01T00:00:00Z",
      requestedName: "Queued Science",
    };
    failSources = true;
    const beforeRecovery = sourceCalls;
    await runCompanyOnboarding();
    assert.equal(rows.get("market-intel:default").catalog.companies.find(x => x.id === c.id).onboarding, undefined);
    assert.ok(sourceRequests.slice(beforeRecovery).every(url => ["www.google.com", "news.google.com"].includes(new URL(url).hostname) || (new URL(url).hostname === "queuedscience.test" && ["/", "/apple-touch-icon.png", "/favicon.ico"].includes(new URL(url).pathname))), `Only free discovery and logo probes may retry; completed paid phases are reused: ${sourceRequests.slice(beforeRecovery).join(", ")}`);
    // A company without checkpoints still reports a real source failure.
    for (const key of rows.keys()) if (key.startsWith("market-intel:collection:")) rows.delete(key);
    const recovered = rows.get("market-intel:default").catalog.companies.find(x => x.id === c.id);
    recovered.onboarding = {status:"queued", attempts:0, updatedAt:new Date().toISOString(), requestedName:"Queued Science"};
    await runCompanyOnboarding();
    assert.equal(rows.get("market-intel:default").catalog.companies.find(x => x.id === c.id).onboarding.status, "failed");
    failSources = false;
    await retryCompanyOnboarding(c.id);
    await runCompanyOnboarding();
    assert.equal(
      rows
        .get("market-intel:default")
        .catalog.companies.find((x) => x.id === c.id).onboarding,
      undefined,
    );
    const { collectionPhase } = require('../lib/marketIntelCollectionStore.ts');
    let identityReads=0;
    await collectionPhase('identity-retry-test',{},'identity',async()=>{identityReads++;return {name:'Example',via:'search',cost:0};},async()=>{});
    const corrected=await collectionPhase('identity-retry-test',{},'identity',async()=>{identityReads++;return {name:'Example',via:'page',linkedinUrl:'https://www.linkedin.com/company/example',cost:0};},async()=>{});
    assert.equal(identityReads,2,'A search fallback must not prevent re-reading a now-accessible official homepage');
    assert.equal(corrected.linkedinUrl,'https://www.linkedin.com/company/example');
  } finally {
    globalThis.fetch = oldFetch;
    for (const k of keys) {
      if (env[k] === undefined) delete process.env[k];
      else process.env[k] = env[k];
    }
  }
});
test("new and existing companies join the same next daily batch", () => {
  const now = Date.parse("2026-09-11T20:00:00Z");
  assert.equal(nextMarketIntelCycle(now), Date.parse("2026-09-12T06:00:00Z"));
  for (const at of ["2026-09-11T06:15:00Z", "2026-09-11T19:59:00Z"]) {
    assert.equal(collectedInCurrentCycle(at, now), true);
    assert.equal(
      collectedInCurrentCycle(at, Date.parse("2026-09-12T06:00:00Z")),
      false,
    );
  }
});
