/** Guarded development browser regression: disposable account; business API writes and external transport are blocked. No external sends. */
import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHmac } from "node:crypto";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
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
const journal = ".qa-backups/popup-dismissal-test-fixture.json";
if (existsSync(journal))
  assert.equal(JSON.parse(readFileSync(journal, "utf8")).status, "cleaned");
const id = randomUUID(),
  workspace = process.env.FREYR_WORKSPACE_ID,
  email = `reserved-popup-regression-${Date.now()}@freyrsolutions.com`;
let authId, browser;
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
const save = () =>
  writeFileSync(journal, JSON.stringify({ ...plan, authId }, null, 2), {
    mode: 0o600,
  });
save();
try {
  const auth = await db.auth.admin.createUser({
    email,
    password: randomBytes(32).toString("hex"),
    email_confirm: true,
    user_metadata: { full_name: "Reserved Popup Regression" },
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
        display_name: "Reserved Popup Regression",
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
          exp: now + 14400,
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
          exp: now + 14400,
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
  await context.route("**/*", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname !== "localhost") return route.abort();
    if(url.pathname.startsWith("/api/") && url.pathname !== "/api/auth/access" && !["GET","HEAD","OPTIONS"].includes(request.method())) {
      console.log("BLOCKED_WRITE", request.method(), url.pathname);
      return route.fulfill({status:409,json:{error:"Read-only popup audit: writes disabled"}});
    }
    return route.continue();
  });
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
  await context.route('**/materials/read-status',r=>r.fulfill({json:{ok:true}}));
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const go = path => page.goto(`http://localhost:3006${path}`, {waitUntil:'domcontentloaded', timeout:60000});
  const modal = () => page.locator('[role="dialog"][aria-modal="true"]').last();
  async function check(trigger, label) {
    await trigger.click();
    await page.waitForTimeout(100);
    assert.equal(await trigger.getAttribute('aria-expanded'), 'true', `${label}: opens`);
    const count = await page.locator('[aria-modal=true]').count();
    await modal().locator(':scope > div').first().click({position:{x:12,y:12}});
    assert.equal(await page.locator('[aria-modal=true]').count(), count, `${label}: outside click keeps form`);
    assert.equal(await trigger.getAttribute('aria-expanded'), 'false', `${label}: outside click closes picker`);
    await trigger.click();
    await page.waitForTimeout(100);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('[aria-modal=true]').count(), count, `${label}: Escape keeps form`);
    assert.equal(await trigger.getAttribute('aria-expanded'), 'false', `${label}: Escape closes picker`);
    console.log(`PASS: ${label}, outside click and Escape preserve the form`);
  }
  // Existing development records are READ ONLY; every business-write request
  // is intercepted above. Test only unsaved fields and always discard them.
  await go('/opportunities/opp-mt6d9mjl-urv8t?tab=contracts');
  await page.getByRole('button',{name:'Add contract',exact:true}).first().click();
  await page.getByRole('button',{name:'Contract owner',exact:true}).waitFor();
  for(const label of ['Contract owner','Contract status'])
    await check(page.getByRole('button',{name:label,exact:true}),label);
  await page.getByRole('button',{name:'Contract status',exact:true}).click();
  await page.getByRole('option').first().click();
  assert.equal(await page.getByRole('button',{name:'Contract status',exact:true}).getAttribute('aria-expanded'),'false','Selecting an option closes its menu');
  assert.ok(await modal().isVisible(),'Selecting an option preserves the form');
  const dates=modal().locator('button[aria-haspopup="dialog"]');
  for(let i=0;i<2;i++)await check(dates.nth(i),`Contract date ${i+1}`);
  await page.getByRole('button',{name:'Contract owner',exact:true}).click();
  await page.getByRole('button',{name:'Contract status',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Contract owner',exact:true}).getAttribute('aria-expanded'),'false');
  assert.equal(await page.getByRole('button',{name:'Contract status',exact:true}).getAttribute('aria-expanded'),'true');
  await page.keyboard.press('Escape');
  await go('/offerings/of-002?tab=materials');
  await page.getByRole('button',{name:'Add material',exact:true}).click();
  await check(page.getByRole('button',{name:'Folder',exact:true}),'Upload folder');
  await go('/components/fdl-041-applications');
  await page.getByTitle('Change the date on V2.3.0',{exact:true}).click();
  await check(page.getByRole('button',{name:'Date for V2.3.0',exact:true}),'Stacked version calendar');
  await go('/admin/groups');
  await page.getByRole('button',{name:'New group',exact:true}).click();
  await check(page.getByRole('combobox',{name:'People in the group',exact:true}),'Inline group people (resizing form)');
  await page.mouse.click(4,4);
  assert.equal(await page.locator('[aria-modal=true]').count(),0,'A genuine backdrop click still closes the form');
  await go('/performance/people');
  await page.getByRole('button',{name:'Log a result',exact:true}).first().click();
  await check(modal().getByRole('button',{name:'Whose number is it?',exact:true}),'Goal person');
  await go('/mock-mode/customers/cust-011?tab=account-plan');
  await page.getByRole('button',{name:'Edit plan',exact:true}).click();
  const planOwner = page.getByRole('button',{name:'Plan owner',exact:true});
  await check(planOwner, 'Mock account plan owner');
  await planOwner.click();
  await page.getByRole('listbox').last().click({position:{x:5,y:5}});
  assert.equal(await planOwner.getAttribute('aria-expanded'), 'true', 'Inside menu padding must not count as outside focus');
  await planOwner.focus();
  await page.keyboard.press('Tab');
  // Tab enters the search field first; Shift+Tab twice leaves the picker.
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await planOwner.getAttribute('aria-expanded'), 'false', 'Keyboard focus outside closes the picker');
  await check(page.getByRole('button',{name:'Owner for action 1',exact:true}), 'Mock account action owner');
  console.log('PASS: inline menu padding and keyboard focus dismissal');
  await go('/mock-mode/reports/customer-offering-heat-map');
  await page.getByRole('button',{name:'Show the heat map full screen',exact:true}).click();
  await page.getByTitle('Aether Medical Devices × Agent.Via: Lead',{exact:true}).click();
  await page.getByRole('button',{name:'Open this activity',exact:true}).click();
  const fullScreen = page.locator('.matrix-pop-in');
  const fullScreenTriggers = fullScreen.locator('button[aria-haspopup]');
  for(let i=0;i<await fullScreenTriggers.count();i++) {
    const trigger=fullScreenTriggers.nth(i);
    await trigger.click();
    const panel=page.locator('[role=listbox]:visible,[role=dialog]:not([aria-modal]):visible').last();
    await panel.waitFor();
    await page.waitForTimeout(250);
    assert.ok(await panel.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+20));}), 'Full-screen picker appears above its editor');
    await page.keyboard.press('Escape');
    assert.equal(await trigger.getAttribute('aria-expanded'),'false');
    assert.ok(await page.getByRole('button',{name:'Close full screen',exact:true}).isVisible());
  }
  console.log('PASS: all seven full-screen activity pickers remain accessible and dismissible');
  await page.screenshot({path:'.qa-backups/popup-dismissal-regression.png'});
  console.log('PASS: core popup dismissal regressions. No business records saved.');
} finally {
  await browser?.close();
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
