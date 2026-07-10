import { test } from "@playwright/test";
const BASE = "http://localhost:3001";
const OUT = "/private/tmp/claude-501/-Users-anirudhsuren-Downloads-freyr-sales/14e5e12a-2106-4423-9eb8-fa4052eb4820/scratchpad";
test.use({ viewport: { width: 1440, height: 950 } });

test("contact top", async ({ page }) => {
  await page.goto(`${BASE}/contacts/cont-012`);
  await page.waitForTimeout(1600);
  await page.screenshot({ path: `${OUT}/c_top.png` });
});

test("contact history", async ({ page }) => {
  await page.goto(`${BASE}/contacts/cont-001`);
  await page.waitForTimeout(1600);
  await page.evaluate(() => {
    const h = [...document.querySelectorAll("h2")].find((e) => /Interaction History/i.test(e.textContent || ""));
    (h as HTMLElement)?.scrollIntoView({ block: "start" });
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/c_hist.png` });
});
