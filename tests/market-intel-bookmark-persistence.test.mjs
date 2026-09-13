import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
// Next supplies this marker at build time; isolate only that marker in Node.
const Module = createRequire(import.meta.url)('node:module');
const originalLoad = Module._load;
Module._load = function (name, ...args) {
  return name === 'server-only' ? {} : originalLoad.call(this, name, ...args);
};
const { saveMarketIntelBookmarkChanges } = await import('../lib/marketIntelBookmarks.ts');
Module._load = originalLoad;

test('Manage save merges concurrent edits and retains a draft on failed persistence', async () => {
 const originalFetch=globalThis.fetch;
 const oldUrl=process.env.NEXT_PUBLIC_SUPABASE_URL, oldKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://market-intel-test.invalid';
 process.env.SUPABASE_SERVICE_ROLE_KEY='isolated-test-key';
 let stored={catalog:{companyIds:['customer','competitor'],starredIds:['customer']},updated_at:'before'};
 let writes=0, fail=false;
 globalThis.fetch=async(input,init)=>{
   const url=new URL(String(input));
   assert.equal(url.hostname,'market-intel-test.invalid','Tests must never contact a real database');
   const method=init?.method||'GET';
   if(method==='GET')return Response.json(stored);
   assert.equal(method,'PATCH');writes++;
   if(fail)return Response.json({message:'Simulated database outage'}, {status:503});
   if(writes===1){stored={catalog:{companyIds:['customer','competitor','added-elsewhere'],starredIds:['customer']},updated_at:'concurrent'};return Response.json([]);}
   assert.equal(url.searchParams.get('updated_at'),'eq.concurrent');
   stored=JSON.parse(init.body);return Response.json([{id:stored.id}]);
 };
 try{
   const scope={workspaceId:'test-workspace',userId:'test-member'};
   const result=await saveMarketIntelBookmarkChanges(scope,[{id:'competitor',on:false,star:false}]);
   assert.deepEqual(result.companyIds,['customer','added-elsewhere']);
   assert.deepEqual(result.starredIds,['customer']);
   assert.equal(writes,2,'A changed row must be re-read before retrying');
   fail=true;
   await assert.rejects(()=>saveMarketIntelBookmarkChanges(scope,[{id:'new',on:true,star:false}]),/Simulated database outage/);
   assert.deepEqual(stored.catalog.companyIds,['customer','added-elsewhere']);
 }finally{
   globalThis.fetch=originalFetch;
   if(oldUrl===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=oldUrl;
   if(oldKey===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=oldKey;
 }
});
