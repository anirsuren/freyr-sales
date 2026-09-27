import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";

const mod = await import("../lib/ecsAwsCredentials.ts");

test("nothing to bridge on a laptop, with static keys, or without a Vertex project", () => {
  assert.equal(mod.armEcsAwsCredentialBridge({}), false);
  assert.equal(mod.armEcsAwsCredentialBridge({ AWS_CONTAINER_CREDENTIALS_RELATIVE_URI: "/v2/x", GOOGLE_CLOUD_PROJECT: "p", AWS_ACCESS_KEY_ID: "a", AWS_SECRET_ACCESS_KEY: "b" }), false);
  assert.equal(mod.armEcsAwsCredentialBridge({ AWS_CONTAINER_CREDENTIALS_RELATIVE_URI: "/v2/x" }), false);
});

test("the Fargate address is built from the relative URI, a full URI wins", () => {
  assert.equal(mod.ecsCredentialsUrl({ AWS_CONTAINER_CREDENTIALS_RELATIVE_URI: "/v2/credentials/abc" }), "http://169.254.170.2/v2/credentials/abc");
  assert.equal(mod.ecsCredentialsUrl({ AWS_CONTAINER_CREDENTIALS_FULL_URI: "http://localhost:8080/creds", AWS_CONTAINER_CREDENTIALS_RELATIVE_URI: "/v2/x" }), "http://localhost:8080/creds");
  assert.equal(mod.ecsCredentialsUrl({}), null);
});

test("renewal runs five minutes ahead of expiry, never sooner than a minute or later than 55", () => {
  const now = Date.parse("2026-09-26T12:00:00Z");
  assert.equal(mod.refreshDelayMs("2026-09-26T13:00:00Z", now), 55 * 60_000);
  assert.equal(mod.refreshDelayMs("2026-09-26T12:20:00Z", now), 15 * 60_000);
  assert.equal(mod.refreshDelayMs("2026-09-26T12:02:00Z", now), 60_000);
  assert.equal(mod.refreshDelayMs(undefined, now), 55 * 60_000);
});

test("credentials from the endpoint land where Google's library reads them", async () => {
  const server = createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ AccessKeyId: "AKIA-TEST", SecretAccessKey: "secret", Token: "session", Expiration: "2026-09-26T13:00:00Z" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    const creds = await mod.fetchTaskCredentials(`http://127.0.0.1:${port}/v2/credentials/x`);
    const env = {};
    mod.applyTaskCredentials(creds, env);
    assert.deepEqual(env, { AWS_ACCESS_KEY_ID: "AKIA-TEST", AWS_SECRET_ACCESS_KEY: "secret", AWS_SESSION_TOKEN: "session", AWS_REGION: "us-east-1" });
  } finally {
    server.close();
  }
});

test("an incomplete answer from the endpoint is refused", async () => {
  const server = createServer((req, res) => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ AccessKeyId: "only" })); });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    await assert.rejects(() => mod.fetchTaskCredentials(`http://127.0.0.1:${port}/x`), /incomplete/);
  } finally { server.close(); }
});
