import { test, expect } from "@playwright/test";
const BASE = `http://127.0.0.1:${process.env.PORT || 3001}`;

test("time zone control exists and timestamps carry an exact time", async ({ page }) => {
  await page.goto(`${BASE}/settings?tab=profile`);
  await expect(page.getByLabel("Time zone")).toBeVisible();
  await expect(page.getByText(/Times read in/)).toBeVisible();
  // The picker offers Automatic plus real zones.
  const options = await page.getByLabel("Time zone").locator("option").allTextContents();
  expect(options.some((o) => /Automatic/.test(o))).toBe(true);
  expect(options.some((o) => /Kolkata/.test(o))).toBe(true);

  // And a relative timestamp exposes the absolute one.
  await page.goto(`${BASE}/sessions/sess-001`);
  const stamp = page.locator("time[title]").first();
  await expect(stamp).toBeVisible();
  const title = await stamp.getAttribute("title");
  expect(title).toMatch(/\d{1,2} \w{3} \d{4}/);
  console.log("exact time shown on hover:", title);
});
