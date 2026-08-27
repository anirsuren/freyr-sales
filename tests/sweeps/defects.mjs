/* READ-ONLY SWEEP. It navigates and measures; it never posts, saves or
   deletes. That is what makes it safe to run against the review server the
   banned write-suite is not (see the Jul 30 incident).

   Run: node --experimental-strip-types tests/sweeps/<file> (server on :3006)
*/
/* Real defects, not taste: console errors, failed requests, and the words
   that mean a value never arrived (NaN, undefined, [object Object], Invalid
   Date) leaking into what a rep reads. */
import {chromium} from 'playwright';
import {asPerson} from './auth.mjs';
const browser=await chromium.launch();
const {page}=await asPerson(browser,'admin',{width:1512,height:1100});
const bad=[];
page.on('console', m=>{ if(m.type()==='error'){ const t=m.text(); if(!/favicon|Download the React DevTools|Extra attributes from the server/i.test(t)) bad.push(`CONSOLE ${page.url().replace('http://localhost:3006','')}: ${t.slice(0,150)}`); }});
page.on('response', r=>{ if(r.status()>=400 && !r.url().includes('favicon')) bad.push(`HTTP ${r.status()} ${r.url().replace('http://localhost:3006','').slice(0,110)}`); });
const PAGES=['/','/performance','/opportunities','/goals','/reports','/customers','/offerings','/offerings/materials','/solutioning','/leads','/contracts','/revenue-accruals','/team','/market-intel','/components','/admin'];
for (const route of PAGES) {
  try{ await page.goto(`http://localhost:3006${route}`,{waitUntil:'domcontentloaded',timeout:300000}); await page.waitForTimeout(2200);}catch(e){bad.push(`${route}: LOAD FAILED`);continue;}
  const junk = await page.evaluate(()=>{
    const t=(document.querySelector('main')||document.body).innerText;
    const hits=[];
    for (const w of ['NaN','undefined','[object Object]','Invalid Date','null%','$NaN','Infinity']) {
      const n=(t.match(new RegExp(w.replace(/[$[\]]/g,'\\$&'),'g'))||[]).length;
      if(n) hits.push(`${w} x${n}`);
    }
    return hits;
  });
  if (junk.length) bad.push(`${route}: ${junk.join(', ')}`);
  console.log(`${route.padEnd(24)} ok`);
}
await browser.close();
console.log('\n--- DEFECTS ---');
console.log(bad.length? [...new Set(bad)].join('\n') : 'none');
process.exit(bad.length?1:0);
