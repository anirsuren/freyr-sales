import { chromium } from "@playwright/test";

const BASE = process.env.BASE || "http://localhost:3001";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });

const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));

await page.goto(`${BASE}/agent`);
await page.waitForTimeout(1000);

const box = page.getByLabel("Message the agent");

// Type like a human, char by char.
await box.click();
await page.keyboard.type("what should I focus on today?", { delay: 20 });
await page.waitForTimeout(300);

const val = await box.inputValue();
const btn = page.getByRole("button", { name: "Send" });
const disabled = await btn.isDisabled();
console.log("textarea value:", JSON.stringify(val));
console.log("send disabled:", disabled);

// Try pressing Enter (the other send path).
await box.press("Enter");
await page.waitForTimeout(4000);

const userBubble = await page.getByText("what should I focus on today?").count();
const thinking = await page.getByText(/thinking/i).count();
console.log("user message rendered count:", userBubble);
console.log("thinking-or-done:", thinking);
console.log("console errors:", errors.length ? errors : "none");
await browser.close();
