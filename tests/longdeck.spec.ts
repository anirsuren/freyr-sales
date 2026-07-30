import { test, expect } from "@playwright/test";
const BASE = `http://127.0.0.1:${process.env.PORT || 3001}`;

test("the 68-slide deck opens", async ({ page }) => {
  test.setTimeout(180_000);
  page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE ERROR:", m.text().slice(0, 300)); });
  page.on("pageerror", (e) => console.log("PAGE ERROR:", String(e).slice(0, 400)));
  await page.goto(`${BASE}/offerings/of-001`);
  await page.getByText("Sales Deck - Long").first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(25_000);
  const err = await dialog.getByText(/Could not|error/i).count();
  const nodes = await dialog.locator(".material-pptx div").count();
  console.log("error shown:", err, "| rendered nodes:", nodes);
});
