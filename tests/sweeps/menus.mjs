/* READ-ONLY SWEEP: every floating menu closes on Escape.
 *
 * Click-away was always built; Escape was the half that kept getting
 * forgotten, because each menu is hand-rolled (Anir has raised the dropdown
 * behaviour more than once). This walks the pages and presses Escape.
 *
 * Two things it deliberately does NOT flag, learned by getting them wrong:
 *
 *   inline disclosures  a table row that expands is aria-expanded too, and
 *                       Escape collapsing a row is not something anybody
 *                       expects. Only controls that raise an OVERLAY count —
 *                       a fixed backdrop, or a role of dialog/menu/listbox.
 *
 *   layered menus       FilterMenu steps BACK a layer on the first Escape by
 *                       design, so a menu is only stuck if it survives two.
 *
 * Run: npm run sweep:menus   (review server on :3006)
 */
import { chromium } from "playwright";
import { asPerson } from "./auth.mjs";

const PAGES = ["/performance", "/opportunities", "/offerings", "/customers", "/goals", "/reports"];
const stuck = [];
let checked = 0;

const browser = await chromium.launch();
const { page } = await asPerson(browser, "admin", { width: 1512, height: 1100 });

for (const route of PAGES) {
  const count = await (async () => {
    await page.goto(`http://localhost:3006${route}`, { waitUntil: "domcontentloaded", timeout: 300000 });
    await page.waitForTimeout(2200);
    return page.locator('main button[aria-expanded]').count();
  })();

  for (let i = 0; i < count; i++) {
    // Fresh page per menu: a stuck one's backdrop would swallow the next click.
    await page.goto(`http://localhost:3006${route}`, { waitUntil: "domcontentloaded", timeout: 300000 });
    await page.waitForTimeout(1500);
    const m = page.locator('main button[aria-expanded]').nth(i);
    if ((await m.getAttribute("aria-expanded").catch(() => null)) !== "false") continue;
    const label = ((await m.getAttribute("aria-label")) || (await m.innerText().catch(() => "")) || "")
      .replace(/\s+/g, " ").slice(0, 40);
    await m.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
    if ((await m.getAttribute("aria-expanded").catch(() => null)) !== "true") continue;

    // An OVERLAY, or just a row that grew?
    const isOverlay = await page.evaluate(() =>
      Boolean(
        document.querySelector('[class*="fixed inset-0"]') ||
        document.querySelector('[role="dialog"],[role="menu"],[role="listbox"]')
      )
    );
    if (!isOverlay) continue;

    checked += 1;
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    if ((await m.getAttribute("aria-expanded").catch(() => null)) === "true") {
      await page.keyboard.press("Escape"); // layered menus step back first
      await page.waitForTimeout(300);
      if ((await m.getAttribute("aria-expanded").catch(() => null)) === "true")
        stuck.push(`${route}: "${label}" survives two Escapes`);
    }
  }
  console.log(`${route.padEnd(18)} swept`);
}

await browser.close();
console.log(`\n${checked} overlay menus checked`);
console.log(stuck.length ? "--- STUCK ---\n" + stuck.join("\n") : "every one closes on Escape");
process.exit(stuck.length ? 1 : 0);
