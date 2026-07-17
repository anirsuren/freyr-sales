import { expect, test } from "@playwright/test";

test("health endpoint reports a reachable data layer", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBeTruthy();
  expect(await response.json()).toMatchObject({
    status: "healthy",
    database: "reachable",
  });
});

test("root opens the dashboard", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("main")).toBeVisible();
});

test("offerings repository is available", async ({ page }) => {
  await page.goto("/offerings");
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByText(/offerings/i).first()).toBeVisible();
});

test("security headers are present", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["content-security-policy"]).toContain("default-src 'self'");
});

test("live mode keeps the offering catalog and exposes only Offerings", async ({ request, page }) => {
  const clean = await request.post("/api/settings/data-mode", { data: { mode: "live" } });
  expect(clean.ok()).toBeTruthy();
  const customers = await request.get("/api/customers");
  expect((await customers.json()).customers.map((customer: { company_name: string }) => customer.company_name))
    .not.toContain("BioNex Therapeutics");
  const offerings = await request.get("/api/offerings");
  expect((await offerings.json()).offerings.length).toBeGreaterThanOrEqual(14);
  const temporaryName = `Persistence check ${Date.now()}`;
  const create = await request.post("/api/offerings", {
    data: { offering_name: temporaryName },
  });
  if (create.ok()) {
    const created = (await create.json()).offering;
    expect((await request.delete(`/api/offerings/${created.id}`)).ok()).toBeTruthy();
  } else {
    expect(create.status()).toBe(503);
  }
  const afterWrite = await request.get("/api/offerings");
  expect(
    (await afterWrite.json()).offerings.some(
      (offering: { offering_name: string }) => offering.offering_name === temporaryName
    )
  ).toBeFalsy();
  await page.goto("/customers");
  await expect(page).toHaveURL(/\/offerings$/);
  const nav = page.getByRole("navigation", { name: "Primary" });
  await expect(nav.getByRole("link", { name: "Offerings", exact: true })).toBeVisible();
  await expect(nav.getByRole("link")).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Settings", exact: true })).toBeVisible();
  await expect(page.getByText("Freya.Register", { exact: true })).toBeVisible();
  await page.goto("/settings?tab=workspace");
  const modeSwitch = page.getByRole("switch", {
    name: "Switch between real mode and mock mode",
  });
  await expect(modeSwitch).toHaveAttribute("aria-checked", "false");
  await modeSwitch.click();
  await expect(modeSwitch).toHaveAttribute("aria-checked", "true");
  await page.goto("/");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link")).toHaveCount(16);
});

test("onboarding exposes the production setup path", async ({ page }) => {
  await page.goto("/onboarding");
  await expect(page.getByRole("heading", { name: "Welcome to Freyr" })).toBeVisible();
  await expect(page.getByText("Import accounts and contacts")).toBeVisible();
  await expect(page.getByText("Invite the team and validate access")).toBeVisible();
});

test("clean workspace imports approved account and contact CSV", async ({ request }) => {
  await request.post("/api/settings/data-mode", { data: { mode: "live" } });
  const suffix = Date.now();
  const companyName = `Launch Biotech ${suffix}`;
  const response = await request.post("/api/import/crm", {
    multipart: {
      file: {
        name: "accounts.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(`company_name,website_url,contact_name,contact_email\n${companyName},https://launch.example,Alex Rivera,alex+${suffix}@launch.example\n`),
      },
    },
  });
  expect(response.ok()).toBeTruthy();
  expect(await response.json()).toMatchObject({ customers: 1, contacts: 1, skipped: 0 });
  const customers = await request.get("/api/customers");
  expect(
    (await customers.json()).customers.some(
      (customer: { company_name: string }) => customer.company_name === companyName
    )
  ).toBeTruthy();
  await request.post("/api/settings/data-mode", { data: { mode: "mock" } });
});
