import { chromium } from "@playwright/test";
const BASE = process.env.BASE || "http://localhost:3001";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });

await page.goto(`${BASE}/dashboard`);
await page.waitForTimeout(1500);
await page.screenshot({ path: "/tmp/freyr-shots/audit-dashboard.png" });

await page.goto(`${BASE}/pipeline`);
await page.waitForTimeout(1500);
await page.screenshot({ path: "/tmp/freyr-shots/audit-pipeline.png" });

await browser.close();
console.log("shots saved");
