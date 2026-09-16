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
const { getProductTourSteps, localTourIndexForCatalogStep } = load('lib/productTourCatalog.ts');
const { canAccessModule, canAccessModuleWith } = load('lib/moduleAccess.ts');
for (const role of ['admin','bd_owner','bd_member','sol_member']) {
  for (const offeringsOnly of [true,false]) test(`${role}, release=${offeringsOnly}: every tour destination is permitted`, () => {
    const steps = getProductTourSteps({role,offeringsOnly});
    assert.ok(steps.length >= 4);
    if (steps.some(s => s.id === "offerings-browser")) {
      assert.equal(steps[4].id, "offerings-browser");
      assert.equal(steps[3].nextLabel, undefined);
    }
    assert.equal(steps.at(-1).id, "settings-replay");
    assert.equal(steps.at(-1).nextLabel, "Finish tour");
    assert.equal(steps.at(-2).id, "settings-mock-mode");
    for (const step of steps) assert.ok(canAccessModule(step.route,role), step.route);
    for (let i=0;i<steps.length;i++) {
      assert.equal(localTourIndexForCatalogStep(steps,steps[i].catalogIndex),i);
      if (steps[i].nextLabel?.startsWith('Open ')) assert.equal(steps[i].nextLabel,`Open ${steps[i+1].pageName}`);
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
