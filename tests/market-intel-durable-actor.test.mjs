import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const Module=require('node:module'),oldLoad=Module._load;
Module._load=function(name,...args){return name==='server-only'?{}:oldLoad.call(this,name,...args);};
const {runDurableMarketIntelActor}=require('../lib/marketIntelActor.ts');
Module._load=oldLoad;
test('a status timeout and a replay retrieve the original paid run without another POST', async()=>{
 const oldFetch=globalThis.fetch, oldUrl=process.env.NEXT_PUBLIC_SUPABASE_URL,oldKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://actor-test.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='fixture';
 const rows=new Map();let starts=0,polls=0;
 globalThis.fetch=async(input,init)=>{
  const u=new URL(String(input)),method=init?.method||'GET';
  if(u.hostname==='actor-test.invalid'){
   const id=u.searchParams.get('id')?.replace(/^eq\./,'');
   if(method==='GET')return Response.json(rows.get(id)||null);
   const body=JSON.parse(init.body),key=id||body.id;
   if(method==='PATCH' && u.searchParams.get('updated_at')!==`eq.${rows.get(key)?.updated_at}`)return Response.json([]);
   rows.set(key,{catalog:body.catalog,updated_at:body.updated_at});return Response.json([{id:key}]);
  }
  assert.equal(u.hostname,'api.apify.com');
  if(method==='POST'){starts++;return Response.json({data:{id:'paid-run',defaultDatasetId:'saved-data'}});}
  if(u.pathname.includes('actor-runs/paid-run')){if(++polls===1)throw Error('Connection interrupted');return Response.json({data:{status:'SUCCEEDED',defaultDatasetId:'saved-data',usageTotalUsd:.01}});}
  if(u.pathname.includes('datasets/saved-data'))return Response.json([{post_url:'https://linkedin.com/feed/update/1'}]);
  throw Error('Unexpected request');
 };
 try{
  await assert.rejects(()=>runDurableMarketIntelActor('fixture~actor',{company:'Example'},'test'),/Connection interrupted/);
  assert.equal(starts,1);assert.equal([...rows.values()][0].catalog.runId,'paid-run');
  const recovered=await runDurableMarketIntelActor('fixture~actor',{company:'Example'},'test');assert.equal(recovered.length,1);assert.equal(starts,1);
  const replay=await runDurableMarketIntelActor('fixture~actor',{company:'Example'},'test');assert.equal(replay.length,1);assert.equal(replay.collectionCostUsd,0);assert.equal(starts,1);assert.equal(polls,2);
 }finally{globalThis.fetch=oldFetch;if(oldUrl===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=oldUrl;if(oldKey===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=oldKey;}
});

test('an accepted POST with a lost response is reconciled by provider inputs without a duplicate charge',async()=>{
 const oldFetch=globalThis.fetch,oldUrl=process.env.NEXT_PUBLIC_SUPABASE_URL,oldKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://actor-test.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='fixture';
 const rows=new Map();let starts=0;
 globalThis.fetch=async(input,init)=>{
  const u=new URL(String(input)),method=init?.method||'GET';
  if(u.hostname==='actor-test.invalid'){
   const id=u.searchParams.get('id')?.replace(/^eq\./,'');
   if(method==='GET')return Response.json(rows.get(id)||null);
   const body=JSON.parse(init.body),key=id||body.id;
   rows.set(key,{catalog:body.catalog,updated_at:body.updated_at});return Response.json([{id:key}]);
  }
  assert.equal(u.hostname,'api.apify.com');
  if(method==='POST'){starts++;throw Error('Response lost after acceptance');}
  if(u.pathname.includes('/acts/'))return Response.json({data:{items:[{id:'accepted-run',startedAt:new Date().toISOString(),defaultKeyValueStoreId:'inputs',defaultDatasetId:'dataset'}]}});
  if(u.pathname.includes('/records/INPUT'))return Response.json({company:'Second Example',providerDefault:true});
  if(u.pathname.includes('/actor-runs/'))return Response.json({data:{status:'SUCCEEDED',defaultDatasetId:'dataset',usageTotalUsd:.02}});
  if(u.pathname.includes('/datasets/'))return Response.json([{title:'Recovered source'}]);
  throw Error('Unexpected request');
 };
 try{
  await assert.rejects(()=>runDurableMarketIntelActor('fixture~actor',{company:'Second Example'},'test'),/Response lost/);
  const recovered=await runDurableMarketIntelActor('fixture~actor',{company:'Second Example'},'test');
  assert.equal(recovered[0].title,'Recovered source');assert.equal(starts,1);
 }finally{globalThis.fetch=oldFetch;if(oldUrl===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=oldUrl;if(oldKey===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=oldKey;}
});
