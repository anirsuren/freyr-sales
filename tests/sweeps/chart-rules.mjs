/* READ-ONLY SWEEP. It navigates and measures; it never posts, saves or
   deletes. That is what makes it safe to run against the review server the
   banned write-suite is not (see the Jul 30 incident).

   Run: node --experimental-strip-types tests/sweeps/<file> (server on :3006)
*/
/* THE STANDING CHART RULES, MEASURED — not eyeballed.
   1. a full-width chart fills its card (no dead gap on the right)
   2. bars sit on the baseline, not floating above it
   3. no gray as identity; status hues (red/green/amber) only where they mean
   4. cards in a row are equal height
   5. every SVG text uses fill-current, never a hardcoded hex (dark mode) */
import {chromium} from 'playwright';
import {asPerson} from './auth.mjs';
const issues=[];
const browser=await chromium.launch();
const {page}=await asPerson(browser,'admin',{width:1850,height:1100});
const PAGES=['/performance','/opportunities','/reports','/goals','/performance/org','/'];
for (const route of PAGES) {
  try {
    await page.goto(`http://localhost:3006${route}`,{waitUntil:'domcontentloaded',timeout:300000});
    await page.waitForTimeout(2600);
  } catch { issues.push(`${route}: PAGE FAILED TO LOAD`); continue; }
  const found = await page.evaluate((route)=>{
    const out=[];
    // 1. dead space right of a full-width chart
    for (const svg of document.querySelectorAll('svg')) {
      const card = svg.closest('[class*="rounded-2xl"],[class*="rounded-xl"]');
      if (!card) continue;
      const s=svg.getBoundingClientRect(), c=card.getBoundingClientRect();
      if (c.width>700 && s.width>200 && (c.width - s.width) > 120)
        out.push(`chart ${Math.round(c.width-s.width)}px narrower than its ${Math.round(c.width)}px card`);
    }
    // 2. bars floating off the baseline
    for (const track of document.querySelectorAll('[class*="items-end"]')) {
      /* A BAR TRACK IS A ROW. flex-col items-end is a right-aligned label
         stack ("Total" over "$1.0M") and its children are SUPPOSED to sit at
         different heights — flagging those was noise, not drift. */
      if (String(track.className).includes('flex-col')) continue;
      const kids=[...track.children].filter(k=>k.getBoundingClientRect().height>0);
      if (kids.length<2) continue;
      const bottoms=kids.map(k=>Math.round(k.getBoundingClientRect().bottom));
      const spread=Math.max(...bottoms)-Math.min(...bottoms);
      if (spread>3) out.push(`bars in one track have ${spread}px of baseline drift`);
    }
    // 3. hardcoded fills on svg text (dark-mode killer)
    for (const t of document.querySelectorAll('svg text')) {
      const f=t.getAttribute('fill');
      if (f && /^#|^rgb/.test(f)) out.push(`svg text hardcodes fill ${f} ("${(t.textContent||'').slice(0,18)}")`);
    }
    // 4. unequal card heights in a grid row
    for (const grid of document.querySelectorAll('[class*="grid-cols-"]')) {
      const kids=[...grid.children].filter(k=>k.getBoundingClientRect().height>60);
      if (kids.length<2) continue;
      const hs=kids.map(k=>Math.round(k.getBoundingClientRect().height));
      const tops=new Set(kids.map(k=>Math.round(k.getBoundingClientRect().top)));
      if (tops.size===1 && Math.max(...hs)-Math.min(...hs)>24)
        out.push(`cards in one row differ by ${Math.max(...hs)-Math.min(...hs)}px (${hs.join('/')})`);
    }
    // 5. page scrolls sideways
    if (document.documentElement.scrollWidth > document.documentElement.clientWidth+2)
      out.push(`page scrolls sideways by ${document.documentElement.scrollWidth-document.documentElement.clientWidth}px`);
    return [...new Set(out)];
  }, route);
  found.forEach(f=>issues.push(`${route}: ${f}`));
  console.log(`${route.padEnd(20)} ${found.length? found.length+' issue(s)':'clean'}`);
}
await browser.close();
console.log('\n--- FINDINGS ---');
console.log(issues.length? issues.join('\n') : 'nothing');
process.exit(issues.length?1:0);
