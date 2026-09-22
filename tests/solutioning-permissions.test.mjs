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

const { validateNewSolutioningRequest, validateSolutioningCreation, canAssignSolutioning } = load('lib/solutioningValidation.ts');
const { SALES_TEAM, MOCK_SOLUTIONING_TEAM, canonicalMockTeammate } = load('lib/salesTeam.ts');
const access = load('lib/moduleAccess.ts');
test('Mock Solutioning assignees use canonical roster names', () => {
  for (const name of MOCK_SOLUTIONING_TEAM) {
    assert.ok(SALES_TEAM.includes(name), `${name} must exist on the team roster`);
    assert.equal(canonicalMockTeammate(name), name);
  }
  for (const oldName of ['Elena Rossi', 'Omar Haddad', 'Nina Kowalski', 'Marcus Chen', 'Grace Liu']) {
    assert.ok(MOCK_SOLUTIONING_TEAM.includes(canonicalMockTeammate(oldName)));
  }
});
test('assignment belongs to Solutioning Owners, with admin override', () => {
  assert.equal(canAssignSolutioning('sol_member', ['sol_owner']), true);
  assert.equal(canAssignSolutioning('admin', []), true);
  assert.equal(canAssignSolutioning('bd_member', ['admin']), true);
  for (const role of ['bd_owner', 'bd_member', 'sol_member']) {
    assert.equal(canAssignSolutioning(role, [role]), false);
  }
});
test('admin bypasses restrictive module maps for every operation', () => {
  for (const name of ['canAccessModuleWith', 'canWriteModuleWith', 'canCreateModuleWith', 'canDeleteModuleWith']) {
    for (const route of ['/solutioning', '/meetings', '/customers', '/opportunities', '/admin']) {
      assert.equal(access[name](route, 'admin', { solution_requests:'none', solutioning:'none', meetings:'none', customers:'none', opportunities:'none', admin:'none' }), true, name + route);
    }
  }
});
test('new requests require a real date, today or later, and brief', () => {
  const check = (due, details = 'Customer needs a proposal') => validateNewSolutioningRequest({neededBy:due,details}, '2026-09-16');
  for (const due of [undefined, '', 'invalid', '2026-02-30', '2026-09-15', '2026-09-17garbage']) assert.throws(() => check(due));
  assert.throws(() => check('2026-09-17', '   '));
  assert.doesNotThrow(() => check('2026-09-16'));
  assert.doesNotThrow(() => check('2026-09-17'));
});
test('work linked to an existing request can start without re-entering its brief or due date', () => {
  for (const type of ['submission', 'presentation']) {
    assert.doesNotThrow(() => validateSolutioningCreation({ type, requestId: 'sr-1', neededBy: '2026-08-24' }, '2026-09-22'));
    assert.throws(() => validateSolutioningCreation({ type, neededBy: '2026-08-24' }, '2026-09-22'));
  }
  assert.throws(() => validateSolutioningCreation({ type: 'request', requestId: 'sr-1', neededBy: '2026-08-24' }, '2026-09-22'));
});
