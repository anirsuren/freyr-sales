import { chromium } from "@playwright/test";
const BASE = process.env.BASE || "http://localhost:3001";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });

// Aether Medical Devices deal (sess-007) — matches the screenshot Suren sent.
await page.goto(`${BASE}/deals/sess-007`);
await page.waitForTimeout(1200);
await page.screenshot({ path: "/tmp/freyr-shots/clarity-deal.png" });

await page.goto(`${BASE}/sequences`);
await page.waitForTimeout(1200);
await page.screenshot({ path: "/tmp/freyr-shots/clarity-sequences.png" });

await browser.close();
console.log("shots saved");
