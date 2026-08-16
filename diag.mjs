import { chromium } from "@playwright/test";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1512, height: 1100 } });
await p.goto("http://localhost:3006/performance/org", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(12000);
const rows = p.locator("tbody tr.cursor-pointer");
for (let i=0;i<await rows.count();i++)
  if ((await rows.nth(i).innerText().catch(()=> "")).includes("Renewals")) { await rows.nth(i).click(); break; }
await p.waitForTimeout(2500);
const col1 = p.locator("text=/1 · Organization/").first().locator("xpath=ancestor::div[2]");
await col1.locator("button[aria-expanded]").nth(4).click();
await p.waitForTimeout(1200);
const d = await p.evaluate(() => {
  const col = [...document.querySelectorAll("b")].find(n => n.textContent === "1 · Organization").closest("div").parentElement;
  const btns = [...col.querySelectorAll("button[aria-expanded]")].slice(0,6);
  return btns.map(btn => {
    const bar = btn.querySelector("span[class*='overflow-hidden'][class*='rounded-full']");
    const wrap = btn.parentElement;
    return {
      m: btn.innerText.split("\n")[0].slice(0,9),
      open: btn.getAttribute("aria-expanded"),
      bar: bar ? Math.round(bar.getBoundingClientRect().width) : null,
      btnW: Math.round(btn.getBoundingClientRect().width),
      wrapCls: (wrap.className||"").toString().slice(0,60),
    };
  });
});
console.log(JSON.stringify(d, null, 1));
// timeline lane
const lane = await p.evaluate(() => {
  const must = [...document.querySelectorAll("span")].find(n => n.textContent.startsWith("must be at"));
  const anyTrack = [...document.querySelectorAll("div")].find(n => /h-2(\.5)?/.test(n.className) && /rounded-full/.test(n.className));
  return { hasMustBe: !!must, trackCls: anyTrack ? anyTrack.className.slice(0,70) : "none",
           parentPt: anyTrack ? getComputedStyle(anyTrack.parentElement).paddingTop : "n/a" };
});
console.log(JSON.stringify(lane));
await b.close();
