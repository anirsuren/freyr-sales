/* READ-ONLY SWEEP: nothing disappears in dark mode.
 *
 * His standing rule after the donut-centre numbers went invisible: an SVG
 * <text> uses fill-current + a text-* token, never a hex. This checks the
 * rendered result rather than the source, so a token that resolves wrong is
 * caught too.
 *
 * ALPHA IS COMPOSITED, learned the hard way: a status pill is coloured text
 * on a 9%-opacity wash of the same hue. Reading that rgba's channels without
 * its alpha says "blue on blue, contrast zero" and flags every healthy pill
 * in the app. The background is composited down the ancestor chain before
 * anything is compared.
 *
 * Run: npm run sweep:dark   (review server on :3006)
 */
import { chromium } from "playwright";
import { asPerson } from "./auth.mjs";

const PAGES = ["/performance", "/opportunities", "/reports", "/goals", "/"];
const bad = [];
const browser = await chromium.launch();
const { page, ctx } = await asPerson(browser, "admin", { width: 1512, height: 1100 });

await page.goto("http://localhost:3006/performance", { waitUntil: "domcontentloaded", timeout: 300000 });
await page.evaluate(() => { try { localStorage.setItem("freyr.theme", "dark"); } catch {} });

for (const route of PAGES) {
  await page.goto(`http://localhost:3006${route}`, { waitUntil: "domcontentloaded", timeout: 300000 });
  await page.waitForTimeout(2400);
  if (!(await page.evaluate(() => document.documentElement.classList.contains("dark")))) {
    bad.push(`${route}: dark class never applied`);
    continue;
  }
  const found = await page.evaluate(() => {
    const parse = (c) => {
      const m = (c || "").match(/[\d.]+/g);
      if (!m) return null;
      return { r: +m[0], g: +m[1], b: +m[2], a: m[3] === undefined ? 1 : +m[3] };
    };
    const lum = (c) => (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
    /* Composite every translucent layer down onto the page's own surface,
       the way the screen does. */
    const bgOf = (el) => {
      const stack = [];
      let n = el;
      while (n) {
        const c = parse(getComputedStyle(n).backgroundColor);
        if (c && c.a > 0) { stack.push(c); if (c.a === 1) break; }
        n = n.parentElement;
      }
      if (!stack.length) return null;
      let out = stack.pop();
      while (stack.length) {
        const top = stack.pop();
        out = {
          r: top.r * top.a + out.r * (1 - top.a),
          g: top.g * top.a + out.g * (1 - top.a),
          b: top.b * top.a + out.b * (1 - top.a),
          a: 1,
        };
      }
      return out;
    };
    const out = [];
    for (const t of document.querySelectorAll("svg text")) {
      const txt = (t.textContent || "").trim();
      if (!txt) continue;
      const f = parse(getComputedStyle(t).fill);
      if (f && lum(f) < 0.25) out.push(`svg text "${txt.slice(0, 16)}" is near-black on dark`);
    }
    for (const el of document.querySelectorAll("main h1,main h2,main h3,main p,main span,main td,main th")) {
      if (el.children.length) continue;
      const txt = (el.textContent || "").trim();
      if (!txt) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 6) continue;
      const fg = parse(getComputedStyle(el).color);
      const bg = bgOf(el);
      if (!fg || !bg) continue;
      const d = Math.abs(lum(fg) - lum(bg));
      if (d < 0.08) out.push(`"${txt.slice(0, 20)}" contrast ${d.toFixed(2)} after compositing`);
    }
    return [...new Set(out)].slice(0, 8);
  });
  found.forEach((f) => bad.push(`${route}: ${f}`));
  console.log(`${route.padEnd(16)} ${found.length ? found.length + " issue(s)" : "clean"}`);
}

await ctx.close();
await browser.close();
console.log("\n--- DARK MODE ---");
console.log(bad.length ? bad.join("\n") : "clean");
process.exit(bad.length ? 1 : 0);
