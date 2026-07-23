import { createHmac } from "node:crypto";
import { expect, test, type BrowserContext } from "@playwright/test";

const PORT = Number(process.env.AUTH_TEST_PORT || 3011);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const SECRET = "freyr-auth-test-secret-2026-long-enough";
const SUBJECT = "auth-test-user";
const WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";

function sign(payload: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", SECRET)
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

function appSession(exp = Math.floor(Date.now() / 1000) + 3600): string {
  return sign({
    id: SUBJECT,
    name: "Auth Test User",
    email: "owner@example.com",
    roles: [],
    exp,
  });
}

function accessGrant(
  exp = Math.floor(Date.now() / 1000) + 3600,
  workspaceId = WORKSPACE_ID
): string {
  return sign({
    sub: SUBJECT,
    userId: "auth-test-app-user",
    email: "owner@example.com",
    role: "admin",
    workspaceId,
    exp,
  });
}

async function setAuthCookies(
  context: BrowserContext,
  options: { session?: string; access?: string } = {}
) {
  await context.addCookies([
    {
      name: "freyr_session",
      value: options.session ?? appSession(),
      url: BASE_URL,
      httpOnly: true,
      sameSite: "Lax",
    },
    {
      name: "freyr_access",
      value: options.access ?? accessGrant(),
      url: BASE_URL,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

test("unauthenticated pages redirect to login without exposing the page", async ({
  page,
}) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
  await expect(page.getByRole("heading", { name: "Sales Intelligence" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Good morning, Suren" })).toHaveCount(0);
});

test("unauthenticated APIs fail closed", async ({ request }) => {
  const response = await request.get("/api/customers");
  expect(response.status()).toBe(401);
  expect(await response.json()).toMatchObject({
    error: "Authentication required",
  });
});

test("headers from other identity providers cannot bypass Supabase auth", async ({
  request,
}) => {
  const easyAuth = Buffer.from(
    JSON.stringify({
      userId: SUBJECT,
      userDetails: "owner@example.com",
      claims: [],
    })
  ).toString("base64");
  const albClaims = Buffer.from(
    JSON.stringify({ email: "owner@example.com" })
  ).toString("base64url");
  const response = await request.get("/api/customers", {
    headers: {
      "x-ms-client-principal": easyAuth,
      "x-amzn-oidc-identity": SUBJECT,
      "x-amzn-oidc-data": `header.${albClaims}.signature`,
    },
  });
  expect(response.status()).toBe(401);
});

test("file-looking dynamic API paths cannot bypass middleware", async ({
  request,
}) => {
  const response = await request.get("/api/campaigns/arbitrary.png");
  expect(response.status()).toBe(401);
  expect(await response.json()).toMatchObject({
    error: "Authentication required",
  });
});

test("the login and session-establishment endpoints remain public", async ({
  page,
  request,
}) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Sign in securely" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Request access" })).toBeVisible();

  const response = await request.post("/api/auth/session", { data: {} });
  expect(response.status()).toBe(400);
  expect(await response.json()).toMatchObject({
    error: "Missing sign-in token.",
  });
});

test("the access refresh endpoint is public but still requires identity", async ({
  request,
}) => {
  const response = await request.post("/api/auth/access");
  expect(response.status()).toBe(401);
  expect(await response.json()).toMatchObject({
    error: "Authentication required",
  });
});

test("a valid signed session and approved access grant unlock the app", async ({
  context,
  page,
}) => {
  let refreshCalls = 0;
  await page.route("**/api/auth/access", async (route) => {
    refreshCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, role: "admin" }),
    });
  });
  await setAuthCookies(context);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("main")).toBeVisible();
  await expect.poll(() => refreshCalls).toBeGreaterThan(0);

  const response = await context.request.get("/api/customers");
  expect(response.ok()).toBeTruthy();
});

test("authentication alone never bypasses workspace approval", async ({
  context,
}) => {
  await context.addCookies([
    {
      name: "freyr_session",
      value: appSession(),
      url: BASE_URL,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const response = await context.request.get("/api/customers");
  expect(response.status()).toBe(403);
  expect(await response.json()).toMatchObject({
    error: "Workspace owner approval required",
  });
});

test("an approval grant from another workspace is rejected", async ({
  context,
}) => {
  await setAuthCookies(context, {
    access: accessGrant(
      Math.floor(Date.now() / 1000) + 3600,
      "00000000-0000-4000-8000-000000000099"
    ),
  });
  const response = await context.request.get("/api/customers");
  expect(response.status()).toBe(403);
});

test("expired or tampered sessions are rejected", async ({ context }) => {
  await setAuthCookies(context, {
    session: appSession(Math.floor(Date.now() / 1000) - 10),
  });
  expect((await context.request.get("/api/customers")).status()).toBe(401);

  await setAuthCookies(context, {
    session: `${appSession()}tampered`,
  });
  expect((await context.request.get("/api/customers")).status()).toBe(401);
});

test("logout clears both authentication and access cookies", async ({
  context,
  page,
}) => {
  await setAuthCookies(context);
  await page.goto("/api/auth/logout");
  await expect(page).toHaveURL(/\/login\?signedOut=1$/);

  const cookies = await context.cookies();
  expect(cookies.some((cookie) => cookie.name === "freyr_session")).toBeFalsy();
  expect(cookies.some((cookie) => cookie.name === "freyr_access")).toBeFalsy();

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
});

test("unsafe post-login redirects are discarded", async ({ request }) => {
  const response = await request.get(
    "/api/auth/resolve?next=%2F%5Cevil.example",
    { maxRedirects: 0 }
  );
  expect(response.status()).toBe(307);
  const location = response.headers().location;
  expect(location).toContain("/login?next=%2Fofferings");
  expect(location).not.toContain("evil.example");
});
