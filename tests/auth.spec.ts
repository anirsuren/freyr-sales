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

function appSession(
  exp = Math.floor(Date.now() / 1000) + 3600,
  email = "owner@freyrsolutions.com",
  name = "Auth Test User"
): string {
  return sign({
    id: SUBJECT,
    name,
    email,
    roles: [],
    exp,
  });
}

function accessGrant(
  exp = Math.floor(Date.now() / 1000) + 3600,
  workspaceId = WORKSPACE_ID,
  email = "owner@freyrsolutions.com",
  displayName = "Auth Test User",
  role = "admin"
): string {
  return sign({
    sub: SUBJECT,
    userId: "auth-test-app-user",
    email,
    displayName,
    role,
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
      name: "freyr_access_v2",
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
  await expect(page.getByRole("heading", { name: "Good morning, Anir" })).toHaveCount(0);
});

test("the login page advertises Freyr-domain auto-join (no invitation)", async ({
  page,
}) => {
  // AUTO_APPROVE_EMAIL_DOMAINS=freyrsolutions.com in this harness: colleagues
  // must be told their company email IS their account — the invitation-only
  // copy would read as a locked door (Suren: seamless, SSO-like onboarding).
  await page.goto("/login");
  await expect(
    page.getByText(/@freyrsolutions\.com email is already your account/)
  ).toBeVisible();
  await expect(
    page.getByText(/Freyr colleagues join automatically/)
  ).toBeVisible();
  await expect(page.getByText(/invitation-only/)).toHaveCount(0);
});

test("a Freyr address is taken straight to setting a password", async ({ page }) => {
  // The whole point of email-first: a first-time colleague types their work
  // address and is asked for the one missing thing — a password. No tab to
  // pick, no "create account" contradicting "you already have an account".
  await page.goto("/login");
  await page.getByLabel("Work email").fill("newjoiner@freyrsolutions.com");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText(/Your account is ready/i)).toBeVisible();
  await expect(page.getByLabel("Choose a password")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Set password and continue" })
  ).toBeVisible();
  // The address stays visible with a way back, so a typo is never a dead end.
  await expect(page.getByText("newjoiner@freyrsolutions.com")).toBeVisible();
  await page.getByRole("button", { name: "Change" }).click();
  await expect(page.getByLabel("Work email")).toBeVisible();
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
      userDetails: "owner@freyrsolutions.com",
      claims: [],
    })
  ).toString("base64");
  const albClaims = Buffer.from(
    JSON.stringify({ email: "owner@freyrsolutions.com" })
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

test("the login, registration, and session-establishment endpoints remain public", async ({
  page,
  request,
}) => {
  await page.goto("/login");
  // Email-first: a colleague is never asked to choose between "sign in" and
  // "create account" — one address field decides for them.
  await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create account" })).toHaveCount(0);
  // With AUTO_APPROVE_EMAIL_DOMAINS configured, the email hint explains the
  // company-domain fast path instead of the invitation-only wording.
  await expect(
    page.getByText(/@freyrsolutions\.com address gets in automatically/i)
  ).toBeVisible();

  const registration = await request.post("/api/auth/register", {
    data: {
      name: "Malformed User",
      email: "outside@@example.com",
      password: "test-password-123",
    },
  });
  expect(registration.status()).toBe(400);

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

test("the verified session identity replaces stale demo profile data", async ({
  context,
  page,
}) => {
  await setAuthCookies(context, {
    session: appSession(
      Math.floor(Date.now() / 1000) + 3600,
      "owner@freyrsolutions.com",
      "Auth Test User"
    ),
  });
  await page.addInitScript(() => {
    localStorage.setItem(
      "freyr_profile",
      JSON.stringify({
        name: "Wrong Demo User",
        email: "wrong@example.com",
        title: "Wrong title",
      })
    );
  });

  await page.goto("/dashboard");
  await expect(
    page.locator("aside").getByText("Auth Test User", { exact: true })
  ).toBeVisible();
  await page.getByRole("button", { name: "Account menu" }).click();
  await expect(
    page.getByRole("menu", { name: "Account menu" }).getByText(
      "owner@freyrsolutions.com",
      { exact: true }
    )
  ).toBeVisible();

  await page.goto("/settings?tab=profile");
  await expect(page.getByLabel("Full name")).toHaveValue("Auth Test User");
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue(
    "owner@freyrsolutions.com"
  );
  // The name is editable — members rename themselves via the server-verified
  // profile API (the canonical directory write; nothing client-trusted). The
  // email remains identity-managed and locked.
  await expect(page.getByLabel("Full name")).toBeEditable();
  await expect(page.getByLabel("Email", { exact: true })).toHaveAttribute(
    "readonly",
    ""
  );
  await expect(page.getByText("Wrong Demo User")).toHaveCount(0);
});

test("the canonical workspace name overrides mutable provider metadata", async ({
  context,
  page,
}) => {
  const expiration = Math.floor(Date.now() / 1000) + 3600;
  await setAuthCookies(context, {
    session: appSession(
      expiration,
      "owner@freyrsolutions.com",
      "Suren Dheen"
    ),
    access: accessGrant(
      expiration,
      WORKSPACE_ID,
      "owner@freyrsolutions.com",
      "Anir Suren"
    ),
  });

  await page.goto("/dashboard");
  const sidebar = page.locator("aside");
  await expect(
    sidebar.getByText("Anir Suren", { exact: true })
  ).toBeVisible();
  await expect(
    sidebar.getByText("Suren Dheen", { exact: true })
  ).toHaveCount(0);
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

test("v2 access grants without a canonical display name are rejected", async ({
  context,
}) => {
  await setAuthCookies(context, {
    access: sign({
      sub: SUBJECT,
      userId: "auth-test-app-user",
      email: "owner@freyrsolutions.com",
      role: "admin",
      workspaceId: WORKSPACE_ID,
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  });
  expect((await context.request.get("/api/customers")).status()).toBe(403);
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

test("a valid external email with an approved access grant unlocks the app", async ({
  context,
}) => {
  const email = "advisor@partner.org";
  const expiration = Math.floor(Date.now() / 1000) + 3600;
  await setAuthCookies(context, {
    session: appSession(expiration, email),
    access: accessGrant(expiration, WORKSPACE_ID, email),
  });
  expect((await context.request.get("/api/customers")).status()).toBe(200);
});

test("a valid external email without an access grant remains blocked", async ({
  context,
}) => {
  await context.addCookies([
    {
      name: "freyr_session",
      value: appSession(
        Math.floor(Date.now() / 1000) + 3600,
        "advisor@partner.org"
      ),
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

test("registration rejects malformed email addresses", async ({
  request,
}) => {
  const rejected = [
    "ownerfreyrsolutions.com",
    "@freyrsolutions.com",
    "owner@",
    "owner@@freyrsolutions.com",
    "owner @freyrsolutions.com",
    "owner@freyrsolutions.com.",
    "owner@example.com extra",
  ];
  for (const email of rejected) {
    const response = await request.post("/api/auth/register", {
      data: {
        name: "Domain Test",
        email,
        password: "test-password-123",
      },
    });
    expect(response.status(), email).toBe(400);
  }
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
  expect(cookies.some((cookie) => cookie.name === "freyr_access_v2")).toBeFalsy();

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

test("auth redirects never expose an inbound proxy or ECS hostname", async ({
  request,
}) => {
  const response = await request.get(
    "/api/auth/resolve?next=%2Fdashboard",
    {
      headers: {
        host: "ip-10-42-10-164.ec2.internal:8080",
        "x-forwarded-host": "evil.example",
        "x-forwarded-proto": "https",
      },
      maxRedirects: 0,
    }
  );

  expect(response.status()).toBe(307);
  const location = response.headers().location;
  expect(location).toBe(`${BASE_URL}/login?next=%2Fdashboard`);
  expect(location).not.toContain("ec2.internal");
  expect(location).not.toContain("evil.example");

  const logout = await request.get("/api/auth/logout", {
    headers: {
      host: "ip-10-42-10-164.ec2.internal:8080",
      "x-forwarded-host": "evil.example",
      "x-forwarded-proto": "https",
    },
    maxRedirects: 0,
  });
  expect(logout.status()).toBe(307);
  expect(logout.headers().location).toBe(`${BASE_URL}/login?signedOut=1`);
});

test("proxy headers cannot authorize a cross-origin browser mutation", async ({
  request,
}) => {
  const rejected = await request.post("/api/auth/session", {
    headers: {
      origin: "https://evil.example",
      "x-forwarded-host": "evil.example",
      "x-forwarded-proto": "https",
    },
    data: {},
  });
  expect(rejected.status()).toBe(403);
  expect(await rejected.json()).toMatchObject({
    error: "Cross-origin mutation rejected",
  });

  const canonical = await request.post("/api/auth/session", {
    headers: { origin: BASE_URL },
    data: {},
  });
  expect(canonical.status()).toBe(400);
  expect(await canonical.json()).toMatchObject({
    error: "Missing sign-in token.",
  });
});
