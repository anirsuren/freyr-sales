import { expect, test } from "@playwright/test";

test("live deployment fails health checks without durable storage", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(503);
  expect(await response.json()).toMatchObject({
    status: "unhealthy",
    database: "not_configured",
    dataMode: "live",
    durableStorageConfigured: false,
  });
});

test("locked live mode exposes only the offering workspace", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/offerings$/);
  const nav = page.getByRole("navigation", { name: "Primary" });
  await expect(nav.getByRole("link", { name: "Offerings", exact: true })).toBeVisible();
  await expect(nav.getByRole("link")).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Settings", exact: true })).toBeVisible();
  await expect(page.getByText("Freya.Register", { exact: true })).toBeVisible();
});

test("the full offering catalog and master lists render in live mode", async ({ page }) => {
  for (const path of [
    "/offerings",
    "/offerings/of-001",
    "/offerings/customer-types",
    "/offerings/offering-categories",
    "/offerings/offering-types",
  ]) {
    await page.goto(path);
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(path.replaceAll("/", "\\/")));
  }
  await page.goto("/offerings/of-001");
  await expect(page.getByRole("link", { name: "Use in a pitch" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add to a customer" })).toHaveCount(0);
});

test("live catalog reads work but writes fail closed without storage", async ({ request }) => {
  const catalog = await request.get("/api/offerings");
  expect(catalog.ok()).toBeTruthy();
  expect((await catalog.json()).offerings.length).toBeGreaterThanOrEqual(14);

  const create = await request.post("/api/offerings", {
    data: { offering_name: "Must not persist" },
  });
  expect(create.status()).toBe(503);
  expect(await create.json()).toMatchObject({
    error: "Live offering changes require the configured Supabase database.",
  });
});

test("runtime mode switching is disabled in a locked deployment", async ({ request }) => {
  const response = await request.post("/api/settings/data-mode", {
    data: { mode: "mock" },
  });
  expect(response.status()).toBe(409);
  expect(await response.json()).toMatchObject({
    error: "Data mode is controlled by the deployment configuration.",
  });
});
