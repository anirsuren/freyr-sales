import { chromium } from "@playwright/test";

const BASE = process.env.BASE || "http://localhost:3001";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

async function say(text, wait = 6500) {
  await page.getByLabel("Message the agent").fill(text);
  await page.getByRole("button", { name: "Send" }).click();
  await page.waitForTimeout(wait);
}

await page.goto(`${BASE}/agent`);
await page.waitForTimeout(800);
await say("what should i do");
await say("what are the 2 pending pitches");
await say("show me the first one");
await page.waitForTimeout(800);
await page.screenshot({ path: "/tmp/freyr-shots/agent-fixed.png", fullPage: false });
await browser.close();
console.log("shot saved");
