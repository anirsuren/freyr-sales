/** Guarded development browser regression: disposable account; fixture index
 * and agent/conversation transport stay in browser memory. No external sends. */
import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHmac } from "node:crypto";
import { mkdirSync, existsSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
const project = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname;
assert.equal(project, "ebyoefeikqxxxxifgjxk.supabase.co");
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
mkdirSync(".qa-backups", { recursive: true });
const journal = ".qa-backups/agent-responsiveness-fixture.json";
if (existsSync(journal))
  assert.equal(JSON.parse(readFileSync(journal, "utf8")).status, "cleaned");
const id = randomUUID(),
  workspace = process.env.FREYR_WORKSPACE_ID,
  email = `reserved-agent-responsiveness-${Date.now()}@freyrsolutions.com`;
let authId,
  browser,
  captured,
  conversations = [];
const plan = {
  project,
  id,
  email,
  workspace,
  role: "admin",
  accountSnapshot: null,
  onboardingSnapshot: null,
  status: "planned",
};
const save = () => {
  appendFileSync('.qa-backups/agent-responsiveness-journal.jsonl',JSON.stringify({at:new Date().toISOString(),...plan,authId})+'\n',{mode:0o600});
  writeFileSync(journal,JSON.stringify({...plan,authId},null,2),{mode:0o600});
};
save();
try {
  const auth = await db.auth.admin.createUser({
    email,
    password: randomBytes(32).toString("hex"),
    email_confirm: true,
    user_metadata: { full_name: "Reserved Responsiveness QA" },
  });
  if (auth.error) throw auth.error;
  authId = auth.data.user.id;
  plan.status = "created";
  save();
  for (const [table, row] of [
    [
      "app_users",
      {
        id,
        workspace_id: workspace,
        email,
        display_name: "Reserved Responsiveness QA",
        app_role: "admin",
        active: true,
        auth_provider: "supabase",
        provider_subject: authId,
        entra_object_id: authId,
        account_type: "test",
        approved_at: new Date().toISOString(),
      },
    ],
    [
      "user_onboarding_states",
      {
        workspace_id: workspace,
        user_id: id,
        version: 2,
        role_snapshot: "admin",
        status: "skipped",
        current_step: 0,
        skipped_at: new Date().toISOString(),
      },
    ],
  ]) {
    const inserted = await db.from(table).insert(row);
    if (inserted.error) throw inserted.error;
  }
  const verified = await db
    .from("app_users")
    .select(
      "id,email,display_name,app_role,workspace_id,provider_subject,active,account_type",
    )
    .eq("id", id)
    .single();
  if (verified.error) throw verified.error;
  const member = verified.data;
  assert.equal(member.email, email);
  assert.equal(member.provider_subject, authId);
  assert.equal(member.account_type, "test");
  assert.equal(member.active, true);
  assert.equal(member.workspace_id, workspace);
  const sign = (payload, secret) => {
    assert.ok(secret, "Local authentication signing configuration required");
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${encoded}.${createHmac("sha256", secret).update(encoded).digest("base64url")}`;
  };
  const now = Math.floor(Date.now() / 1000),
    jar = {
      freyr_session: sign(
        {
          id: authId,
          name: member.display_name,
          email,
          roles: [],
          exp: now + 900,
        },
        process.env.AUTH_SESSION_SECRET || process.env.AUTH_COOKIE_SECRET,
      ),
      freyr_access_v2: sign(
        {
          sub: authId,
          userId: id,
          email,
          displayName: member.display_name,
          role: member.app_role,
          workspaceId: workspace,
          exp: now + 900,
        },
        process.env.AUTH_COOKIE_SECRET,
      ),
    };
  browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 950 },
  });
  await context.addCookies(
    Object.entries(jar).map(([name, value]) => ({
      name,
      value,
      domain: "localhost",
      path: "/",
    })),
  );

  const authCheck=await context.request.post('http://localhost:3006/api/auth/access');
  assert.equal(authCheck.status(),200);assert.equal((await authCheck.json()).role,'admin');
  plan.catalogIds=[`member-profile:${workspace}:${id}`,`agent-conversations:${workspace}:${id}`];
  const snapshot=await db.from('offering_catalog_state').select('id,catalog').in('id',plan.catalogIds);
  if(snapshot.error)throw snapshot.error;assert.equal(snapshot.data.length,0);plan.catalogSnapshot=[];save();
  await context.route('**/*',route=>{
    const r=route.request(),u=new URL(r.url());
    if(u.hostname!=='localhost')return route.abort();
    if(!['GET','HEAD'].includes(r.method())&&u.pathname!=='/api/auth/access')return route.fulfill({status:409,json:{error:'Guarded QA blocks writes'}});
    return route.continue();
  });
  for(const endpoint of ['presence','onboarding/whatsapp','profile/whatsapp'])await context.route(`**/api/${endpoint}`,route=>route.fulfill({json:{ok:true,resolved:true,skipped:true,configured:false,canSend:false,link:null,pending:null}}));
  const entities=Array.from({length:4000},(_,i)=>({id:`reserved-${i}`,name:`Reserved customer ${i}`}));
  await context.route('**/api/agent/entities',route=>route.fulfill({json:{companies:entities,materials:[{id:'reserved-offering:pdf',name:'Reserved commercial proposal.pdf',subtitle:'QA only'}]}}));
  const richReply=Array.from({length:35},(_,i)=>`**Scope ${i}:** Reserved customer ${i} requires qualified implementation pricing, confirmed integrations and cited exclusions. Validate the evidence before committing to the requested implementation.`).join('\n\n');
  const messages=Array.from({length:16},(_,i)=>({role:i%2?'agent':'user',text:i%2?richReply:'Reserved historical question.',ts:Date.now()-100000+i*1000}));
  conversations=Array.from({length:130},(_,i)=>({id:`reserved-thread-${i}`,title:i?'Reserved history '+i:'Reserved active history',updated:Date.now()-i*1000,messages:i?[]:messages}));
  await context.route('**/api/agent/conversations',async route=>{
    if(route.request().method()==='PUT')conversations=route.request().postDataJSON().conversations||[];
    return route.fulfill({json:{ok:true,conversations}});
  });
  let responseMode='json';const burstReply='Reserved complete streamed answer. '+richReply;
  await context.route('**/api/agent/converse',route=>{
    captured=route.request().postDataJSON();assert.equal(captured.stream,true);
    if(responseMode==='json')return route.fulfill({json:{reply:richReply,suggestions:[]}});
    const events=Array.from(burstReply,char=>({type:'delta',text:char}));events.push({type:'done',reply:burstReply,suggestions:[]});
    return route.fulfill({contentType:'application/x-ndjson',body:events.map(e=>JSON.stringify(e)).join('\n')+'\n'});
  });
  await context.addInitScript(()=>{
    window.__qaInputFrames=[];
    document.addEventListener('input',()=>{const start=performance.now();requestAnimationFrame(()=>{window.__qaInputFrames.push(performance.now()-start);if(window.__qaInputFrames.length>300)window.__qaInputFrames.shift()})},true);
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));page.setDefaultTimeout(20000);
  await page.goto('http://localhost:3006/agent',{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Reserved active history',exact:true}).click();
  let editor=page.getByRole('combobox',{name:'Message the agent'}).first();await page.locator('[role=combobox][contenteditable=true]').first().waitFor();
  await editor.click();await page.evaluate(()=>{window.__qaInputFrames=[]});
  const typed='Compare scope, exclusions and pricing for the selected regulatory sales materials.';
  const before=Date.now();await editor.pressSequentially(typed);const fullTypingMs=Date.now()-before;
  assert.equal(await editor.innerText(),typed);
  const timings=await page.evaluate(()=>window.__qaInputFrames.slice());assert.ok(timings.length>10);
  const sorted=timings.toSorted((a,b)=>a-b),p95=sorted[Math.floor(sorted.length*.95)];assert.ok(p95<150,`Input p95 ${p95}ms`);console.log(JSON.stringify({check:'typing',fullTypingMs,p95}));
  await editor.fill('');await page.getByRole('button',{name:'New chat',exact:true}).click();
  await editor.pressSequentially('Reserved fallback timing check.');
  const sent=Date.now();await page.getByRole('button',{name:'Send',exact:true}).first().click();
  await page.waitForFunction(()=>{const last=[...document.querySelectorAll('.agent-reply-wrap')].at(-1);return last?.textContent?.includes('Scope 34:')&&last.textContent.endsWith('Validate the evidence before committing to the requested implementation.')});
  const fallbackMs=Date.now()-sent;console.log(JSON.stringify({check:'fallback',fallbackMs}));assert.ok(fallbackMs<2200,`Fallback took ${fallbackMs}ms`);
  await editor.pressSequentially('/Reserved commercial');await page.getByRole('option').first().waitFor();await editor.press('Enter');
  assert.equal(await editor.locator('[data-entity="material:reserved-offering:pdf"]').count(),1);await editor.fill('');
  responseMode='stream';await editor.pressSequentially('Reserved streaming timing check.');const burstStart=Date.now();await editor.press('Enter');
  await page.getByText('Reserved complete streamed answer.',{exact:false}).first().waitFor();
  await page.waitForFunction(()=>{const last=[...document.querySelectorAll('.agent-reply-wrap')].at(-1);return last?.textContent?.includes('Reserved complete streamed answer.')&&last.textContent.endsWith('Validate the evidence before committing to the requested implementation.')});
  const streamMs=Date.now()-burstStart;console.log(JSON.stringify({check:'stream',streamMs}));assert.ok(streamMs<2200,`Burst stream took ${streamMs}ms`);
  const themes=[];
  for(const dark of [true,false]) {
    await page.evaluate(dark=>document.documentElement.classList.toggle('dark',dark),dark);
    const paint=await page.locator('[data-agent-composer-footer]').evaluate(el=>({background:getComputedStyle(el).backgroundColor,image:getComputedStyle(el).backgroundImage}));
    assert.equal(paint.background,dark?'rgb(28, 28, 30)':'rgb(255, 255, 255)');assert.equal(paint.image,'none');themes.push({dark,footer:paint});
    await page.screenshot({path:`.qa-backups/agent-responsiveness-full-${dark?'dark':'light'}.png`});
  }
  // Same shared composer, renderer and fallback reveal in the floating chat.
  await page.goto('http://localhost:3006/offerings',{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Open your agent',exact:true}).click();
  await page.locator('[data-agent-dock-header]').evaluate(el=>el.parentElement.style.height='850px');
  editor=page.getByRole('combobox',{name:'Message the agent'}).first();await editor.waitFor();
  await editor.pressSequentially('Reserved dock streaming timing check.');await editor.press('Enter');
  await page.getByText('Reserved complete streamed answer.',{exact:false}).last().waitFor();
  await editor.pressSequentially('This input must remain responsive after the long answer.');
  assert.equal(await editor.innerText(),'This input must remain responsive after the long answer.');
  assert.deepEqual(errors,[]);
  for(const dark of [true,false]) {
    await page.evaluate(dark=>document.documentElement.classList.toggle('dark',dark),dark);
    const paint=await page.locator('[data-agent-dock-header]').evaluate(el=>({background:getComputedStyle(el).backgroundColor,image:getComputedStyle(el).backgroundImage}));
    assert.equal(paint.background,dark?'rgb(28, 28, 30)':'rgb(255, 255, 255)');assert.equal(paint.image,'none');themes.push({dark,dockHeader:paint});
    // Overlap the menu and dock and check the actual hit target, not just z-index numbers.
    await page.getByRole('button',{name:'Account menu',exact:true}).click();
    const menu=page.getByRole('menu',{name:'Account menu',exact:true});await menu.waitFor();
    const overlaps=await menu.evaluate(el=>{
      const dock=document.querySelector('[data-agent-dock-header]').parentElement;
      const m=el.getBoundingClientRect(),d=dock.getBoundingClientRect();
      const x=Math.max(m.left,d.left)+8,y=Math.max(m.top,d.top)+8;
      return {overlap:x<Math.min(m.right,d.right)&&y<Math.min(m.bottom,d.bottom),menuOnTop:el.contains(document.elementFromPoint(x,y))};
    });
    assert.equal(overlaps.overlap,true,'Menu/dock overlap required');assert.equal(overlaps.menuOnTop,true,'Account menu must paint above Agent dock');
    themes.push({dark,accountMenu:overlaps});
    await page.screenshot({path:`.qa-backups/agent-responsiveness-dock-${dark?'dark':'light'}.png`});
    await page.keyboard.press('Escape');await menu.waitFor({state:'hidden'});
  }
  const evidence={at:new Date().toISOString(),mode:'real role UI with memory-only Agent/history/entity fixtures',role:'admin',indexSize:entities.length,historyConversations:130,historyMessages:messages.length,typing:{chars:typed.length,elapsedMs:fullTypingMs,inputToFrameMs:timings,p95},fallbackMs,streamMs,dock:true,mention:true,themes,errors};
  writeFileSync('.qa-backups/agent-responsiveness-evidence.json',JSON.stringify(evidence,null,2),{mode:0o600});console.log(JSON.stringify(evidence));
} finally {
  await browser?.close();
  for(const cid of plan.catalogIds||[]){const r=await db.from('offering_catalog_state').delete().eq('id',cid);if(r.error)throw r.error;const check=await db.from('offering_catalog_state').select('id').eq('id',cid);if(check.error)throw check.error;assert.equal(check.data.length,0)}
  for(const [table,column] of [['user_onboarding_states','user_id'],['app_users','id']]){const r=await db.from(table).delete().eq(column,id);if(r.error)throw r.error;const check=await db.from(table).select(column).eq(column,id);if(check.error)throw check.error;assert.equal(check.data.length,0)}
  if(authId){const r=await db.auth.admin.deleteUser(authId);if(r.error)throw r.error;assert.equal((await db.auth.admin.getUserById(authId)).data?.user,null)}
  plan.status='cleaned';save();console.log('PASS reserved account/Auth/scoped cleanup verified; no paid Agent calls, business writes or sends.');
}
