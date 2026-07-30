import { test, expect } from "@playwright/test";
const BASE = `http://127.0.0.1:${process.env.PORT || 3001}`;

test("clicking a folder opens it", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(`${BASE}/offerings/of-001`);
  await page.getByRole("button", { name: /Proposals/ }).first().click();
  await expect(page).toHaveURL(/mf=Proposals/);
  await expect(page.getByText("RFP Response - Moderna")).toBeVisible();
  console.log("URL after click:", page.url());
  const breadcrumb = await page.getByRole("button", { name: "All materials" }).count();
  console.log("breadcrumb back-link present:", breadcrumb);
});
