import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
import test from 'node:test';
import assert from 'node:assert/strict';
const {collectLinkedInPostPages} = require('../lib/linkedinPostCollection.ts');
const {readTrackingResponse} = require('../lib/marketIntelTrackProgress.ts');
const {compatibleCompanyNames} = require('../lib/companyIdentity.ts');
const post=i=>({text:`Company update ${i}`,post_url:`https://linkedin.com/posts/example-${i}`,posted_at:{timestamp:Date.now()}});
test('the stored LinkedIn post retains its ending for the full-post view',()=>{
 const {toPost}=require('../lib/linkedinPostCollection.ts');
 const text='A detailed company update. '.repeat(100)+'Final qualification: this is a pilot, not general availability.';
 assert.equal(toPost({...post(1),text}).text,text);
});
test('LinkedIn reads additional pages until it reaches already collected posts',async()=>{
 const calls=[];
 const r=await collectLinkedInPostPages(async input=>{calls.push(input);return Array.from({length:100},(_,i)=>post((input.page_number-1)*100+i));},'example',{maxPosts:200,knownUrls:[post(125).post_url]});
 assert.equal(calls.length,2);assert.equal(r.items.length,200);assert.equal(r.truncated,false);assert.equal(r.cost,1);
 assert.ok(calls.every(c=>c.sort==='recent'));
});
test('LinkedIn does not mistake a repeated page for complete coverage',async()=>{
 const r=await collectLinkedInPostPages(async()=>Array.from({length:100},(_,i)=>post(i)),'example');
 assert.equal(r.items.length,100);assert.equal(r.truncated,true);
});
test('LinkedIn stops at the retention boundary, exhaustion and collection cap',async()=>{
 let calls=0;
 const old=await collectLinkedInPostPages(async()=>{calls++;return [post(1),{...post(2),posted_at:{timestamp:Date.now()-100*86400_000}}];},'example');
 assert.equal(calls,1);assert.equal(old.items.length,1);assert.equal(old.truncated,false);
 const capped=await collectLinkedInPostPages(async({page_number})=>Array.from({length:100},(_,i)=>post(page_number*100+i)),'example',{maxPosts:40});
 assert.equal(capped.items.length,40);assert.equal(capped.truncated,true);
});
test('streamed loading handles split chunks, progress and confirmed completion',async()=>{
 const events=[{type:'progress',value:{stage:'identity'}},{type:'heartbeat'},{type:'progress',value:{stage:'saving',name:'Example'}},{type:'complete',value:{company:{id:'example',name:'Example'}}}];
 const bytes=new TextEncoder().encode(events.map(e=>JSON.stringify(e)).join('\n')+'\n');
 const response=new Response(new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=7)c.enqueue(bytes.slice(i,i+7));c.close();}}),{headers:{'content-type':'application/x-ndjson'}});
 const stages=[];const result=await readTrackingResponse(response,p=>stages.push(p.stage));
 assert.deepEqual(stages,['identity','saving']);assert.equal(result.company.id,'example');
});
test('streamed failures and dropped connections never display success',async()=>{
 for(const text of ['{"type":"error","error":"Sources could not be verified"}\n','{"type":"progress","value":{"stage":"saving"}}\n']){
  await assert.rejects(()=>readTrackingResponse(new Response(text,{headers:{'content-type':'application/x-ndjson'}}),()=>{}));
 }
 await assert.rejects(()=>readTrackingResponse(Response.json({error:'Already exists'},{status:409}),()=>{}),/Already exists/);
});
test('company identity accepts corporate suffixes and acronyms but rejects conflicting sources',()=>{
 for(const [a,b] of [['Vertex','Vertex Pharmaceuticals'],['TCS','Tata Consultancy Services'],['GSK','GSK'],['Rimsys','Rimsys Inc.']])assert.equal(compatibleCompanyNames(a,b),true,`${a}: ${b}`);
 for(const [a,b] of [['Pfizer','GSK'],['ABC Solutions','XYZ Solutions'],['Alpha Pharma','Beta Pharma']])assert.equal(compatibleCompanyNames(a,b),false);
});
test('LinkedIn retains collected posts and cost if a later page fails',async()=>{
 const r=await collectLinkedInPostPages(async({page_number})=>{if(page_number===2)throw new Error('Provider unavailable');return Array.from({length:100},(_,i)=>post(i));},'example',{maxPosts:200});
 assert.equal(r.items.length,100);assert.equal(r.cost,.5);assert.equal(r.truncated,true);assert.match(r.error,/unavailable/);
});
test('one old pinned post cannot stop collection of recent pages',async()=>{
 let calls=0;const r=await collectLinkedInPostPages(async({page_number})=>{calls++;if(page_number===2)return [post(101)];return Array.from({length:100},(_,i)=>i?post(i):{...post(0),posted_at:{timestamp:Date.now()-100*86400_000}});},'example',{maxPosts:200});
 assert.equal(calls,2);assert.equal(r.items.length,100);
});
test('daily LinkedIn checks use a small first page and stop at existing coverage',async()=>{
 let calls=0;const r=await collectLinkedInPostPages(async input=>{calls++;assert.equal(input.limit,5);return Array.from({length:5},(_,i)=>post(i));},'example',{pageSize:5,knownUrls:[post(3).post_url]});
 assert.equal(calls,1);assert.equal(r.cost,.025);assert.equal(r.truncated,false);
});

test('a small probe without overlap refills page one before advancing by 100',async()=>{
 const calls=[];const r=await collectLinkedInPostPages(async input=>{calls.push([input.page_number,input.limit]);return Array.from({length:input.limit},(_,i)=>post(i));},'example',{pageSize:5,knownUrls:[post(70).post_url]});
 assert.deepEqual(calls,[[1,5],[1,100]]);assert.equal(r.items.length,100);assert.equal(r.truncated,false);
});
test('activity identity preserves a repost separately from its original and uses UTC time',async()=>{
 const {linkedInPostedAt}=require('../lib/linkedinPostCollection.ts');
 const original={...post(1),activity_urn:'7498691535874641920'};
 const repost={...post(1),activity_urn:'7499206564856127488'};
 const r=await collectLinkedInPostPages(async()=>[original,repost],'example');
 assert.equal(r.items.length,2);
 assert.equal(new Date(linkedInPostedAt(original)).toISOString(),'2026-08-27T10:43:01.104Z');
});

test('image-only posts are retained without inventing a caption',()=>{
 const {hasLinkedInPostContent}=require('../lib/linkedinPostCollection.ts');
 assert.equal(hasLinkedInPostContent({post_url:'https://linkedin.com/posts/example',text:'',media:{type:'image',items:[{url:'https://media.licdn.com/image'}]}}),true);
 assert.equal(hasLinkedInPostContent({post_url:'https://linkedin.com/posts/example',text:''}),false);
});
