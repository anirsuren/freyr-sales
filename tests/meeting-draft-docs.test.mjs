import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const rows = new Map();
const client = { from() { let id; return {
  select() { return this; }, eq(_key, value) { id=value; return this; },
  async maybeSingle() { return {data:rows.has(id)?{catalog:structuredClone(rows.get(id))}:null,error:null}; },
  async upsert(row) { rows.set(row.id,structuredClone(row.catalog)); return {error:null}; },
}; } };
const mocks = {
  '@supabase/supabase-js':{createClient:()=>client},
  './dataMode':{getDataMode:()=>'live'}, './env':{hasSupabase:()=>true},
  './mockDates':{mockDated:v=>v}, './mockFillLife':{}, './mockFillCast':{},
  './pipelineSeed':{SEED_OPPORTUNITIES:[]}, './sampleDocuments':{sampleDocPath:v=>v},
};
const module = {exports:{}};
new Function('require','module','exports',ts.transpileModule(readFileSync(new URL('../lib/meetings.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>{assert.ok(name in mocks,`Unexpected dependency ${name}`);return mocks[name];},module,module.exports);
const { createMeeting,updateMeeting,readMeetings,addMeetingDoc,removeMeetingDoc }=module.exports;
const draft={title:'Reserved memory fixture',type:'Discovery',customer:'Reserved memory customer',meetingAt:'2026-11-01',by:'Verified Rep'};
const doc={id:'doc-1',label:'Brief.pdf',docsPath:'reserved/brief.pdf',addedBy:'Forged Admin',addedAt:'1900-01-01'};
async function fresh(id){return (await readMeetings()).meetings.find(m=>m.id===id);}

test('create persists landed meeting files and stamps the actual author',async()=>{
 const m=await createMeeting({...draft,docs:[doc]});const saved=await fresh(m.id);
 assert.equal(saved.docs.length,1);assert.equal(saved.docs[0].label,'Brief.pdf');assert.equal(saved.docs[0].docsPath,doc.docsPath);
 assert.equal(saved.docs[0].addedBy,'Verified Rep');assert.notEqual(saved.docs[0].addedAt,doc.addedAt);
});
test('edit appends uploads without dropping documents added since the dialog opened',async()=>{
 const m=await createMeeting({...draft,docs:[doc]});
 await addMeetingDoc({id:m.id,label:'Concurrent.pdf',docsPath:'reserved/concurrent.pdf',by:'Other Rep'});
 const before=(await fresh(m.id)).docs;
 await updateMeeting({id:m.id,by:'Editor',patch:{docs:[{...doc,label:'Overwrite attempt'},{id:'doc-2',label:'Deck.pptx',docsPath:'reserved/deck.pptx',addedBy:'Fake'}]}});
 let saved=await fresh(m.id);assert.deepEqual(saved.docs.slice(0,2),before);assert.equal(saved.docs.length,3);assert.equal(saved.docs[2].addedBy,'Editor');
 await updateMeeting({id:m.id,by:'Editor',patch:{title:'Changed title',docs:[]}});
 saved=await fresh(m.id);assert.equal(saved.docs.length,3);assert.equal(saved.title,'Changed title');
 await removeMeetingDoc({id:m.id,docId:'doc-2'});assert.deepEqual((await fresh(m.id)).docs,before);
});
test('malformed and unlanded uploads never attach',async()=>{
 const m=await createMeeting({...draft,docs:[null,{}, {label:'Missing path'},{name:'Wrong shape',docsPath:'reserved/wrong.pdf'}, {...doc,id:'valid'}, {...doc,id:'valid'}]});
 assert.equal((await fresh(m.id)).docs.length,1);
 await updateMeeting({id:m.id,by:'Editor',patch:{docs:{label:'Invalid array'}}});assert.equal((await fresh(m.id)).docs.length,1);
});
