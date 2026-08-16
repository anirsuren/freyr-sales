import { chromium } from "@playwright/test";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1512, height: 1100 } });
const errs = [];
p.on("pageerror", e => errs.push("PAGEERROR " + e.message.slice(0,110)));
p.on("console", m => { if (m.type() === "error") errs.push("CONSOLE " + m.text().slice(0,110)); });
const out = [];

await p.goto("http://localhost:3006/performance/org", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(11000);

const rows = p.locator("tbody tr.cursor-pointer");
let target = -1;
for (let i=0;i<await rows.count();i++)
  if ((await rows.nth(i).innerText().catch(()=> "")).includes("Renewals")) { target = i; break; }
await rows.nth(target).click(); await p.waitForTimeout(2200);

// A. no dead lane above the track when unscheduled
const lane = await p.evaluate(() => {
  const t = [...document.querySelectorAll("div")].find(n => /rounded-full/.test(n.className) && /h-2(\.5)?/.test(n.className) && /border-light/.test(n.className));
  const must = [...document.querySelectorAll("span")].some(n => n.textContent.startsWith("must be at"));
  return t ? { pt: getComputedStyle(t.parentElement).paddingTop, hasMustBe: must } : "not found";
});
out.push(`A lane: ${JSON.stringify(lane)} (want pt 0px when hasMustBe false)`);

// B. separators
const col2 = p.locator("text=/2 · Groups/").first().locator("xpath=ancestor::div[2]");
await p.locator("button[aria-expanded]:has-text('test')").first().click();
await p.waitForTimeout(1200);
const rules = await col2.locator("[class*='border-t']").count();
out.push(`B rules inside open group: ${rules} (want 2: panel top + between the 2 people)`);

// C. container encloses
const enc = await p.evaluate(() => {
  const btn = [...document.querySelectorAll("button[aria-expanded='true']")].find(n => n.innerText.includes("test"));
  const w = btn?.closest("div[class*='border-blue-primary']");
  if (!w) return "NO WRAPPER";
  return w.getBoundingClientRect().bottom >= w.lastElementChild.getBoundingClientRect().bottom - 1;
});
out.push(`C group container encloses panel: ${enc}`);

// D. bidirectional shine
await p.locator("button[aria-expanded]:has-text('test')").first().hover();
await p.waitForTimeout(500);
out.push(`D hover group -> table row lit: ${await p.locator("tr[data-linked='true']").count()} (want 1)`);
await p.mouse.move(4,4); await p.waitForTimeout(400);
out.push(`D hover off -> lit: ${await p.locator("tr[data-linked='true']").count()} (want 0)`);

// E. shift-multi-open
const col1 = p.locator("text=/1 · Organization/").first().locator("xpath=ancestor::div[2]");
const months = col1.locator("button[aria-expanded]");
await months.nth(4).click(); await p.waitForTimeout(500);
await months.nth(5).click({ modifiers: ["Shift"] }); await p.waitForTimeout(500);
out.push(`E shift-open months: ${await col1.locator("button[aria-expanded='true']").count()} (want 2)`);

// F. equal bar widths
const w = await col1.locator("button[aria-expanded] span[class*='overflow-hidden'][class*='rounded-full']").evaluateAll(ns => [...new Set(ns.slice(0,8).map(n => Math.round(n.getBoundingClientRect().width)))]);
out.push(`F distinct bar widths: ${JSON.stringify(w)} (want one value)`);

out.push(`ERRORS: ${errs.length ? errs.slice(0,3).join(" | ") : "none"}`);
console.log(out.join("\n"));
await b.close();
