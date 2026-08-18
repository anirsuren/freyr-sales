import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
await page.goto("http://localhost:3006/market-intel", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(2000);
const result = await page.evaluate(async () => {
  const r = await fetch("/api/market-intel/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ force: true, only: ["__mna_only__"], wait: true }),
  });
  return { status: r.status, body: (await r.text()).slice(0, 400) };
});
console.log(JSON.stringify(result, null, 1));
await browser.close();
