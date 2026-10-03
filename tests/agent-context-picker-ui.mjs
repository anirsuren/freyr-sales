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
const journal = ".qa-backups/agent-context-redesign-fixture.json";
if (existsSync(journal))
  assert.equal(JSON.parse(readFileSync(journal, "utf8")).status, "cleaned");
const id = randomUUID(),
  workspace = process.env.FREYR_WORKSPACE_ID,
  email = `reserved-agent-mentions-${Date.now()}@freyrsolutions.com`;
let authId,
  browser,
  captured,
  conversations = [], page, phase="setup", imageResponses=[];
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
  appendFileSync('.qa-backups/agent-context-redesign-journal.jsonl', JSON.stringify({at:new Date().toISOString(),...plan,authId})+'\n',{mode:0o600});
  writeFileSync(journal, JSON.stringify({ ...plan, authId }, null, 2), {
    mode: 0o600,
  });
};
save();
try {
  const auth = await db.auth.admin.createUser({
    email,
    password: randomBytes(32).toString("hex"),
    email_confirm: true,
    user_metadata: { full_name: "Reserved Mention QA" },
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
        display_name: "Reserved Mention QA",
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
    const req=route.request(),u=new URL(req.url());
    if(u.hostname!=='localhost')return route.abort();
    if(!['GET','HEAD'].includes(req.method())&&u.pathname!=='/api/auth/access')return route.fulfill({status:409,json:{error:'Guarded QA blocks writes'}});
    return route.continue();
  });
  await context.route("**/api/profile/photo/team", route=>route.fulfill({json:{ok:true,photos:{'anant puranik':'/avatars/anant-puranik.png'}}}));
  await context.route("**/api/presence", (route) =>
    route.fulfill({ json: { ok: true } }),
  );
  await context.route("**/api/onboarding/whatsapp", (route) =>
    route.fulfill({ json: { resolved: true, skipped: true } }),
  );
  await context.route("**/api/profile/whatsapp", (route) =>
    route.fulfill({
      json: { configured: false, canSend: false, link: null, pending: null },
    }),
  );
  const identity={kind:'company',text:'Reserved Incyte',logoUrl:'/logos/real/incyte.png'};
  const owner={kind:'owner',text:'Anant Puranik'};
  const location={kind:'location',text:'Boston, USA'};
  const date={kind:'date',text:'Oct 5, 2026'};
  await context.route("**/api/agent/entities", (route) =>
    route.fulfill({
      json: {
        companies: [{id:"reserved-customer",name:"Reserved Incyte",logoUrl:"/logos/real/incyte.png",subtitleFacts:[location],facts:[owner]}],
        offerings: [
          { id: "reserved-offering", name: "Regulatory Intelligence", facts:[owner] },
        ],
        materials: [
          {
            id: "reserved-offering:reserved-pdf",
            name: "Regulatory buyer evidence.pdf",
            subtitle: "Regulatory Intelligence",
            details: ["PDF", "2.0 MB", "Success story / case study"],
            description: "Buyer evidence for procurement",fileType:"PDF",
            subtitleFacts:[{kind:'offering',text:'Regulatory Intelligence'}],
            facts:[{kind:'format',text:'PDF'},{kind:'size',text:'2.0 MB'},{kind:'type',text:'Success story / case study'},{...owner,kind:'uploader'},{kind:'division',text:'MDV'}],
          },
        ],
        contacts: [
          {
            id: "reserved-john-a",
            name: "John QA",
            subtitle: "Alpha Biotech · Procurement",
          },
          {
            id: "reserved-john-b",
            name: "John QA",
            subtitle: "Beta Biotech · Regulatory",
            logoUrl: "/avatars/anant-puranik.png",
            subtitleFacts:[{...identity,text:'Beta Biotech'},{kind:'role',text:'Regulatory'}],
            facts:[location,{kind:'email',text:'john@example.com'}],
          },
        ],
        people:[{id:'reserved-teammate',name:'Reserved Teammate',logoUrl:'/avatars/anant-puranik.png',subtitleFacts:[{kind:'email',text:'reserved@example.com'}],facts:[{kind:'role',text:'BD Owner'}]}],
        marketCompanies:[{id:'reserved-intel',name:'Reserved Intel Buyer',logoUrl:'/logos/real/incyte.png',subtitleFacts:[location],facts:[{kind:'type',text:'Competitor'},...['MPR','MDV','CON'].map(text=>({kind:'division',text}))]}],
        marketItems:[{id:'https://example.com/news',name:'Reserved buyer news',subtitleFacts:[identity,{kind:'source',text:'Buyer news source'}],facts:[{kind:'format',text:'Article'},date]}],
        trackedPeople:[{id:'https://www.linkedin.com/in/reserved/',name:'Reserved Tracked Person',logoUrl:'/avatars/anant-puranik.png',subtitleFacts:[identity],facts:[location]}],
        deals:[{id:'reserved-deal',name:'Reserved Opportunity',subtitleFacts:[identity],facts:[owner,{kind:'value',text:'USD 1,000'},date]}],
        components:[{id:'reserved-component',name:'Reserved Component',facts:[{kind:'version',text:'Version 1'},{kind:'features',text:'2 features'}]}],
        solutioning:[{id:'reserved-request',name:'Reserved Request',subtitleFacts:[identity],facts:[owner,date]}],
        leads:[{id:'reserved-lead',name:'John Lead QA',subtitleFacts:[{kind:'company',text:'Pfizer',logoUrl:'/logos/real/incyte.png'},{kind:'role',text:'Director'}],facts:[{kind:'status',text:'New'},owner,location]}],
        contracts:[{id:'reserved-contract',name:'Reserved Contract',subtitleFacts:[identity],facts:[owner,date]}],
        goals:[{id:'reserved-goal',name:'Reserved Goal',facts:[{kind:'target',text:'Target: 10'},{kind:'verification',text:'Verified'}]}],
        reports:[{id:'reserved-report',name:'Reserved Report',subtitle:'Pipeline reporting'}],
      },
    }),
  );
  await context.route("**/api/agent/conversations", async (route) => {
    if (route.request().method() === "PUT")
      conversations = route.request().postDataJSON().conversations || [];
    await route.fulfill({ json: { conversations, ok: true } });
  });
  await context.route("**/api/agent/converse", async (route) => {
    captured = route.request().postDataJSON();
    await route.fulfill({
      json: {
        ok: true,
        reply: "Reserved stub: selected records received.",
        suggestions: [],
      },
    });
  });

  page=await context.newPage();page.setDefaultTimeout(15000);
  const evidence=[];

  const inspect=async(surface)=>{
    const editor=page.getByRole('combobox',{name:'Message the agent'}).first();
    await page.locator('[role=combobox][contenteditable=true]').first().waitFor();
    const open=async()=>{await page.getByRole('button',{name:/^Add context/}).click();await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='Search records and sales assets')};
    const search=page.getByRole('searchbox',{name:'Search records and sales assets'});
    const category=async(name)=>{
      const before=await search.inputValue();
      await page.getByRole('navigation',{name:'Context categories'}).getByRole('button',{name,exact:true}).click();
      assert.equal(await search.evaluate(e=>e===document.activeElement),true,`${surface}/${name}: search keeps focus`);
      assert.equal(await search.inputValue(),before,'Category keeps the query');
    };
    phase=surface+': inline composer';
    const row=editor.locator('..').locator('..');
    const alignment=await row.evaluate(el=>{const selectors=['[aria-label="Add files"]','[aria-label="Message the agent"]','[aria-label="Add context"]','[aria-label="Send"]'];return selectors.map(s=>{const r=el.querySelector(s).getBoundingClientRect();return {y:r.y+r.height/2,height:r.height}})});
    assert.ok(Math.max(...alignment.map(x=>x.y))-Math.min(...alignment.map(x=>x.y))<3,'Empty composer controls align on one row');
    await editor.fill('Compare the selected materials');
    await page.screenshot({path:`.qa-backups/agent-composer-inline-${surface}.png`});
    assert.ok((await editor.boundingBox()).height<45,'Short message stays on one line');
    await editor.fill('');
    phase=surface+': empty-search Backspace';await editor.click();await editor.pressSequentially('/');
    await search.waitFor();await page.keyboard.press('Backspace');
    assert.equal(await page.getByRole('dialog',{name:'Add context'}).count(),0);
    assert.equal(await editor.innerText(),'');assert.equal(await editor.evaluate(e=>e===document.activeElement),true);
    await editor.pressSequentially('Before  after');
    await editor.evaluate(el=>{const r=document.createRange();r.setStart(el.firstChild,7);r.collapse(true);const s=window.getSelection();s.removeAllRanges();s.addRange(r)});
    await page.keyboard.type('/');await search.waitFor();await page.keyboard.type('A');await page.keyboard.press('Backspace');
    assert.equal(await search.inputValue(),'');assert.equal(await page.getByRole('dialog',{name:'Add context'}).count(),1,'Backspace first erases search text');
    await category('Contacts');await page.keyboard.press('Backspace');
    assert.equal(await page.getByRole('dialog',{name:'Add context'}).count(),0);assert.equal(await editor.innerText(),'Before  after');
    await page.keyboard.type('here');assert.equal(await editor.innerText(),'Before here after','Caret returns to deleted slash position');
    await open();await page.keyboard.press('Backspace');assert.equal(await editor.innerText(),'Before here after','Button-opened picker cannot delete draft text');await search.press('Escape');
    await editor.fill('');
    phase=surface+': category focus';await editor.click();await editor.pressSequentially('/');
    await search.fill('John');await category('Contacts');
    await page.keyboard.type(' QA');assert.equal(await search.inputValue(),'John QA');
    await category('All records');await category('Contacts');
    await page.keyboard.press('Enter');
    assert.equal(await editor.locator('[data-entity="contact:reserved-john-a"]').count(),1,'Enter after category click selects the first result');
    await editor.fill('');
    phase=surface+': slash shortcut';await editor.click();await editor.pressSequentially('/');
    await search.waitFor();await search.fill('Regulatory buyer');await search.press('Enter');
    assert.equal(await editor.locator('[data-entity="material:reserved-offering:reserved-pdf"]').count(),1);
    assert.ok(!(await editor.innerText()).includes('/'),'Selected record replaces the shortcut');
    await editor.fill('');await editor.pressSequentially('Compare /');await search.waitFor();await search.press('Escape');
    assert.equal(await editor.innerText(),'Compare /','Cancel preserves original draft');
    await editor.fill('');await editor.pressSequentially('Compare x/y data');
    assert.equal(await page.getByRole('dialog',{name:'Add context'}).count(),0);
    // Place caret between the existing words. Opening/searching must preserve it.
    await editor.evaluate(el=>{const r=document.createRange();r.setStart(el.firstChild,8);r.collapse(true);const s=window.getSelection();s.removeAllRanges();s.addRange(r)});
    await open();await search.waitFor();await page.screenshot({path:`.qa-backups/agent-context-redesign-${surface}-all.png`});assert.equal(await search.evaluate(e=>e===document.activeElement),true);
    await category('Leads');await search.fill('Pfizer');
    const lead=page.getByRole('option').first();assert.match(await lead.innerText(),/John Lead QA/);assert.match(await lead.innerText(),/Pfizer/);
    assert.equal(await lead.locator('[data-fact-kind=company] img').count(),1);
    assert.equal(await lead.locator('[data-fact-kind=location]').count(),0,'lower priority metadata not cluttering lead');
    await lead.hover();assert.equal(await lead.evaluate(e=>getComputedStyle(e).animationName),'goalRowSheen');
    const families=await lead.evaluate(e=>({picker:getComputedStyle(e).fontFamily,app:getComputedStyle(document.querySelector('.font-preset-scope')).fontFamily}));assert.equal(families.picker,families.app);
    await page.screenshot({path:`.qa-backups/agent-context-redesign-${surface}-leads.png`});
    await page.getByRole('button',{name:'Multi-select',exact:true}).click();await search.press('Enter');
    await category('Sales materials');await search.fill('Regulatory buyer');await search.press('Enter');
    assert.equal(await page.getByRole('region',{name:'Selected records'}).getByRole('button',{name:/Remove /}).count(),2);
    const material=page.getByRole('option').first();assert.equal(await material.locator('[data-fact-kind=format]').innerText(),'PDF');assert.equal(await material.locator('[data-fact-kind=size]').innerText(),'2.0 MB');
    assert.equal(await material.locator('[data-fact-kind=division]').innerText(),'MDV');
    const preview=material.locator('a[target=_blank]');assert.equal(await preview.count(),1);await material.hover();await page.waitForFunction(()=>{const e=document.querySelector('[role=option]:hover a[target=_blank]');return e&&getComputedStyle(e).opacity==='1'});
    const previewURL = new URL(await preview.getAttribute('href'), 'http://localhost:3006');
    await context.route(url=>url.pathname===previewURL.pathname,route=>route.fulfill({contentType:'text/html',body:'Reserved preview'}));
    const popped=context.waitForEvent('page');await preview.click();const popup=await popped;await popup.close();assert.equal(await page.getByRole('region',{name:'Selected records'}).getByRole('button',{name:/Remove /}).count(),2);
    await page.screenshot({path:`.qa-backups/agent-context-redesign-${surface}.png`});
    await page.getByRole('button',{name:'Add selected (2)',exact:true}).click();
    assert.equal(await editor.locator('[data-entity]').count(),2);assert.equal(await editor.evaluate(e=>e.firstChild.textContent),'Compare ');assert.match(await editor.evaluate(e=>e.lastChild.textContent),/data$/);
    assert.deepEqual(await editor.locator('[data-entity]').evaluateAll(es=>es.map(e=>e.dataset.entity)),['lead:reserved-lead','material:reserved-offering:reserved-pdf']);
    await open();await category('Contacts');await search.fill('John');assert.equal(await page.getByRole('option').count(),2);await search.press('ArrowDown');await search.press('Enter');assert.equal(await editor.locator('[data-entity="contact:reserved-john-b"]').count(),1);
    await open();await search.fill('no result exists');await search.press('Enter');assert.equal(await page.getByRole('dialog',{name:'Add context'}).count(),1);await search.press('Escape');assert.equal(await page.getByRole('dialog',{name:'Add context'}).count(),0);
    await open();await page.getByRole('button',{name:'Multi-select',exact:true}).click();await search.fill('Reserved Goal');await search.press('Enter');await page.getByRole('button',{name:'Clear selected',exact:true}).click();assert.equal(await page.getByRole('region',{name:'Selected records'}).count(),0);await page.getByRole('button',{name:'Cancel',exact:true}).click();
    await open();await page.mouse.click(800,55);assert.equal(await page.getByRole('dialog',{name:'Add context'}).count(),0);
    await editor.fill('');await open();await category('Market Intel companies');await search.fill('Reserved Intel Buyer');assert.equal(await page.getByRole('option').locator('[data-fact-kind=division]').count(),3);await search.press('Escape');
    phase=surface+': category coverage';
    // Every category remains reachable without horizontal scrolling.
    await open();
    for(const name of ['Sales materials','Offerings','FDL components','Customers','Contacts','Team','Leads','Opportunities','Solutioning','Contracts','Goals','Reports','Market Intel companies','Market Intel articles','Tracked people']){
      await category(name);await search.fill('');assert.ok(await page.getByRole('option').count()>0,`${surface}: ${name}`);
    }
    await search.press('Escape');
    if(surface==='full-light'){
      phase=surface+': capacity';
      await open();await page.getByRole('button',{name:'Multi-select',exact:true}).click();
      const rows=page.getByRole('option');
      for(let i=0;i<12;i++)await rows.nth(i).getByRole('button').first().click();
      assert.equal(await page.getByRole('region',{name:'Selected records'}).getByRole('button',{name:/Remove /}).count(),12);
      assert.equal(await rows.nth(12).getByRole('button').first().isDisabled(),true);
      await page.getByRole('region',{name:'Selected records'}).getByRole('button',{name:/Remove /}).first().click();
      assert.equal(await rows.nth(12).getByRole('button').first().isDisabled(),false);
      await search.press('Escape');
    }
    evidence.push({surface,leadPersonPrimary:true,companyLogo:true,materialFormatSizeDivision:true,font:families,exactIds:true,multiCategory:true,caret:true,keyboard:true,previewNewTab:true,cancelClearOutside:true,slashShortcut:true,inlineComposer:true,emptySearchBackspace:true,categorySearchFocus:true,enterAfterCategory:true,literalPathSlash:true,categoriesChecked:15,capacityVerified:surface==='full-light'});
  };
  await page.goto('http://localhost:3006/agent',{waitUntil:'domcontentloaded'});await inspect('full-light');
  await page.goto('http://localhost:3006/offerings',{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>{document.documentElement.classList.add('dark');localStorage.setItem('freyr.theme','dark')});
  phase='open dock';await page.getByRole('button',{name:'Open your agent',exact:true}).click();await inspect('dock-dark');
  phase='narrow';await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:/^Add context/}).click();
  const dialog=page.getByRole('dialog',{name:'Add context'});const box=await dialog.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=390);
  await dialog.getByRole('button',{name:'Browse',exact:true}).click();await dialog.getByRole('button',{name:'Leads',exact:true}).click();
  assert.match(await dialog.getByRole('option').innerText(),/John Lead QA/);
  await page.screenshot({path:'.qa-backups/agent-context-redesign-narrow.png'});
  await dialog.getByRole('button',{name:'Close record picker'}).click();
  assert.equal(captured,undefined,'No Agent question sent');
  writeFileSync('.qa-backups/agent-context-redesign-evidence.json',JSON.stringify({at:new Date().toISOString(),mode:'Authenticated reserved Admin; UI entity catalogue and Agent transport stubbed; real local component and CSS',evidence,paidCalls:0},null,2));
  console.log('PASS redesigned context browser full/light, dock/dark, narrow; identity, selection, search, caret, preview and dismissal. No Agent sends.');
} catch(error) { console.log(JSON.stringify({phase,url:page?.url(),error:error.message.split('Call log:')[0]}));await page?.screenshot({path:'.qa-backups/agent-context-redesign-failure.png'}).catch(()=>{});throw error;
} finally {
  await browser?.close();
  for(const cid of plan.catalogIds||[]){const r=await db.from('offering_catalog_state').delete().eq('id',cid);if(r.error)throw r.error;const check=await db.from('offering_catalog_state').select('id').eq('id',cid);if(check.error)throw check.error;assert.equal(check.data.length,0)}
  for (const [table, column] of [
    ["user_onboarding_states", "user_id"],
    ["app_users", "id"],
  ]) {
    const removed = await db.from(table).delete().eq(column, id);
    if (removed.error) throw removed.error;
    const remaining = await db.from(table).select(column).eq(column, id);
    if (remaining.error) throw remaining.error;
    assert.equal(remaining.data.length, 0);
  }
  if (authId) {
    const removed = await db.auth.admin.deleteUser(authId);
    if (removed.error) throw removed.error;
    assert.equal((await db.auth.admin.getUserById(authId)).data?.user, null);
  }
  plan.status = "cleaned";
  save();
  console.log("PASS: disposable fixtures removed and verified.");
}
