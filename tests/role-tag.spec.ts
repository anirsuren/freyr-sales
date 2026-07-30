import { test, expect } from "@playwright/test";
const BASE = `http://127.0.0.1:${process.env.PORT || 3001}`;

test("the role shows as a tag, with one name everywhere", async ({ page }) => {
  await page.goto(`${BASE}/offerings`);
  // Open the account menu, top right.
  await page.getByRole("button", { name: /Anir|account|profile/i }).first().click();
  const tag = page.getByTitle(/Invites and approves teammates|Browses offerings|Runs the catalogue/);
  await expect(tag.first()).toBeVisible();
  console.log("account menu role tag:", (await tag.first().textContent())?.trim());

  // The retired vocabulary must be gone from the UI entirely.
  await expect(page.getByText("Workspace Admin")).toHaveCount(0);
  await expect(page.getByText("Catalog editor")).toHaveCount(0);
  await expect(page.getByText("Sales Representative")).toHaveCount(0);
});
