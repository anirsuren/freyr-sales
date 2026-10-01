import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const mod = { exports: {} }; cache.set(file, mod);
  const req = name => {
    if (name === './env') return { hasSupabase: () => false };
    if (name === '@supabase/supabase-js') return { createClient() { throw Error('No persistence in tour tests'); } };
    if (!name.startsWith('.')) throw Error(`Unexpected dependency ${name}`);
    return load(path.resolve(path.dirname(file), `${name}.ts`));
  };
  const compiled = ts.transpileModule(fs.readFileSync(file,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require','module','exports',compiled)(req, mod, mod.exports);
  return mod.exports;
}
const { getProductTourSteps, localTourIndexForCatalogStep, tourChaptersOf, PRODUCT_TOUR_STEPS, TOUR_CHAPTERS } = load('lib/productTourCatalog.ts');
const { canAccessModule, canAccessModuleWith } = load('lib/moduleAccess.ts');
for (const role of ['admin','bd_owner','bd_member','sol_member']) {
  for (const offeringsOnly of [true,false]) test(`${role}, release=${offeringsOnly}: every tour destination is permitted`, () => {
    const steps = getProductTourSteps({role,offeringsOnly,features:{whatsapp:true}});
    assert.ok(steps.length >= 4);
    // The app-wide chrome comes first, on the home page, with no page change between.
    assert.deepEqual(steps.slice(0,4).map(s=>s.id), ['top-search','account-menu','notifications-bell','sidebar-modules']);
    assert.ok(steps.slice(0,4).every(s=>s.route===steps[0].route && s.nextLabel===undefined || s===steps[3]));
    // The agent chapter follows, ending on the WhatsApp showcase.
    const agent = steps.filter(s=>s.chapter==='Your agent').map(s=>s.id);
    assert.deepEqual(agent.slice(-2), ['agent-dock','whatsapp-agent']);
    assert.equal(steps.at(-1).id, "settings-replay");
    assert.equal(steps.at(-1).nextLabel, "Finish tour");
    assert.equal(steps.at(-2).id, "settings-mock-mode");
    for (const step of steps) assert.ok(canAccessModule(step.route,role), step.route);
    for (let i=0;i<steps.length;i++) {
      assert.equal(localTourIndexForCatalogStep(steps,steps[i].catalogIndex),i);
      if (steps[i].nextLabel?.startsWith('Open ')) {
        // Between Settings tabs the label names the tab; elsewhere, the page.
        const next = steps[i+1];
        const tab = next.eyebrow.startsWith('Settings · ') ? next.eyebrow.slice('Settings · '.length) : next.pageName;
        const samePage = next.route.split('?')[0] === steps[i].route.split('?')[0];
        assert.equal(steps[i].nextLabel, `Open ${samePage ? tab : next.pageName}`);
      }
    }
    if(role === 'sol_member') assert.ok(steps.some(s=>s.id==='solutioning-requests'));
  });
}
test('custom privileges override the role defaults without promising denied pages', () => {
  const all = getProductTourSteps({role:'admin',offeringsOnly:false});
  const access = { offerings: 'read', customers: 'read', solutioning: 'none' };
  const routes = [...new Set(all.map(s=>s.route))].filter(route=>canAccessModuleWith(route,'bd_member',access));
  const steps = getProductTourSteps({role:'bd_member',offeringsOnly:false,allowedRoutes:routes});
  assert.ok(steps.some(s=>s.route==='/customers'));
  for (const s of steps) assert.ok(canAccessModuleWith(s.route,'bd_member',access),s.route);
  assert.ok(!steps.some(s=>s.route==='/solutioning'));
});
test('an account without catalogue access starts global controls on its available settings page', () => {
  const steps = getProductTourSteps({role:'bd_member',offeringsOnly:true,allowedRoutes:['/settings?tab=workspace']});
  assert.ok(steps.slice(0,4).every(s=>s.route==='/settings?tab=workspace'));
  assert.ok(!steps.some(s=>s.route==='/offerings'));
});

test('page overviews never fall back to a transient input or header', () => {
  const steps = getProductTourSteps({role:'admin',offeringsOnly:false});
  for (const step of steps.filter(step => step.targets[0] === '[data-tour="page-content"]')) {
    assert.deepEqual(step.targets, ['[data-tour="page-content"]', '#main-content'], step.id);
  }
  const assistant = steps.find(step => step.id === 'agent-workspace');
  assert.deepEqual(assistant.targets, ['[data-tour="page-content"]', '#main-content']);
});

test('steps saved before Oct 1 keep their catalog indexes', () => {
  const before = ['top-search','account-menu','notifications-bell','sidebar-modules','offerings-browser','agent-workspace','components-browser','customers-browser','team-roster','reports-revenue','performance-goals','market-intel','settings-mock-mode','settings-replay','pipeline-board','forecast-summary','contacts-browser','sessions-browser','sequences-timeline','campaigns-workflow','voice-overview','tasks-queue','analytics-growth','activity-feed','solutioning-requests'];
  before.forEach((id, index) => assert.equal(PRODUCT_TOUR_STEPS[index].id, id));
  assert.equal(new Set(PRODUCT_TOUR_STEPS.map(s=>s.id)).size, PRODUCT_TOUR_STEPS.length);
});

test('the WhatsApp stop needs a workspace number', () => {
  const without = getProductTourSteps({role:'bd_member',offeringsOnly:true});
  assert.ok(!without.some(s=>s.id==='whatsapp-agent'));
  const withIt = getProductTourSteps({role:'bd_member',offeringsOnly:true,features:{whatsapp:true}});
  const stop = withIt.find(s=>s.id==='whatsapp-agent');
  assert.ok(stop);
  assert.equal(stop.kind, 'showcase');
  assert.equal(stop.route, withIt[0].route);
});

test('admin-only stops reach admins only', () => {
  for (const role of ['bd_member','bd_owner','sol_member']) {
    const ids = getProductTourSteps({role,offeringsOnly:true}).map(s=>s.id);
    assert.ok(!ids.includes('settings-access'), role);
    assert.ok(!ids.includes('admin-console'), role);
  }
  const admin = getProductTourSteps({role:'admin',offeringsOnly:true}).map(s=>s.id);
  assert.ok(admin.includes('settings-access'));
  assert.ok(admin.includes('admin-console'));
});

test('every role walks the settings it has', () => {
  for (const role of ['admin','bd_owner','bd_member','sol_member']) {
    const ids = getProductTourSteps({role,offeringsOnly:true}).map(s=>s.id);
    for (const id of ['settings-profile','settings-appearance','settings-integrations','settings-mock-mode','settings-replay']) assert.ok(ids.includes(id), `${role} ${id}`);
    // Notifications settings only exist in the in-progress workspace.
    assert.ok(!ids.includes('settings-notifications'), role);
  }
});

test('a role gets the wording written for it', () => {
  const member = getProductTourSteps({role:'bd_member',offeringsOnly:false});
  const owner = getProductTourSteps({role:'bd_owner',offeringsOnly:false});
  const memberGoals = member.find(s=>s.id==='performance-goals');
  const ownerGoals = owner.find(s=>s.id==='performance-goals');
  if (memberGoals && ownerGoals) assert.notEqual(memberGoals.description, ownerGoals.description);
  const admin = getProductTourSteps({role:'admin',offeringsOnly:false});
  assert.match(admin.find(s=>s.id==='sidebar-modules').description, /admin/);
});

test('chapters are contiguous and in tour order', () => {
  for (const role of ['admin','bd_owner','bd_member','sol_member']) {
    const steps = getProductTourSteps({role,offeringsOnly:true,features:{whatsapp:true}});
    const chapters = tourChaptersOf(steps);
    assert.equal(new Set(chapters.map(c=>c.chapter)).size, chapters.length, role);
    const order = chapters.map(c=>TOUR_CHAPTERS.indexOf(c.chapter));
    assert.deepEqual(order, [...order].sort((a,b)=>a-b), role);
    assert.equal(chapters.reduce((n,c)=>n+c.count,0), steps.length);
  }
});
