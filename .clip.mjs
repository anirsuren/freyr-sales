import { chromium } from "@playwright/test";
import fs from "node:fs";
const SP = process.env.SP;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, deviceScaleFactor: 2 });
await ctx.addCookies([
  { name: "freyr_session", value: fs.readFileSync(`${SP}/sess.txt`,"utf8").trim(), domain: "localhost", path: "/" },
  { name: "freyr_access_v2", value: fs.readFileSync(`${SP}/grant.txt`,"utf8").trim(), domain: "localhost", path: "/" },
]);
const page = await ctx.newPage();
page.setDefaultTimeout(120000);
await page.goto("http://localhost:3006/opportunities", { waitUntil: "domcontentloaded", timeout: 300000 }).catch(e=>console.log("nav",e.message));
await page.waitForSelector('button:has-text("New opportunity")', { timeout: 300000 });
await page.waitForTimeout(2000);
await page.locator('button', { hasText: "New opportunity" }).first().click();
await page.waitForTimeout(1500);
// open every room so the last one is at the bottom of a long scroll
for (const name of ["Where it stands", "Goals this deal feeds", "Activities"]) {
  await page.locator('[role="dialog"] >> text=' + name).first().click().catch(()=>{});
  await page.waitForTimeout(500);
}
const m = await page.evaluate(() => {
  const dlg = document.querySelector('[role="dialog"]');
  const body = dlg.querySelector('.overflow-y-auto');
  const footer = dlg.querySelector('.sticky.bottom-0');
  const rooms = [...dlg.querySelectorAll('section, div')].filter(el => el.textContent?.startsWith("Activities"));
  const last = rooms[rooms.length - 1];
  body.scrollTop = body.scrollHeight;
  const r = last?.getBoundingClientRect();
  const f = footer?.getBoundingClientRect();
  const b = body.getBoundingClientRect();
  return {
    bodyRect: { top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height) },
    scroll: { top: Math.round(body.scrollTop), height: Math.round(body.scrollHeight), client: Math.round(body.clientHeight) },
    footer: f ? { top: Math.round(f.top), bottom: Math.round(f.bottom), h: Math.round(f.height) } : null,
    lastRoom: r ? { top: Math.round(r.top), bottom: Math.round(r.bottom) } : null,
    overlapPx: r && f ? Math.round(r.bottom - f.top) : null,
  };
});
console.log(JSON.stringify(m, null, 1));
await page.waitForTimeout(400);
await page.screenshot({ path: `${SP}/clip-before.png`, clip: await page.locator('[role="dialog"]').first().boundingBox() });
await browser.close();
