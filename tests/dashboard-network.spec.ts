import { expect, test } from "@playwright/test";

test("dashboard does not issue failing same-origin requests", async ({ page }) => {
  const failures: string[] = [];
  page.on("response", (response) => {
    if (
      response.url().startsWith("http://127.0.0.1:3001/") &&
      response.status() >= 400
    ) {
      failures.push(`${response.status()} ${response.request().method()} ${response.url()}`);
    }
  });
  await page.goto("/dashboard");
  await page.waitForLoadState("networkidle");
  expect(failures).toEqual([]);
});
