import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),M=require('node:module'),old=M._load;
M._load=function(n,...a){return n==='server-only'?{}:old.call(this,n,...a)};
const {cachedArticleEvidence}=require('../lib/marketIntelArticleCache.ts');
M._load=old;
const evidence={url:'https://publisher.test/article',title:'Research announcement',text:'Verified article body',published:'2026-09-12',articleLinks:[]};
test('verified evidence survives separate calls and expires for a later refresh',async()=>{
 let time=0,reads=0;const rows=new Map();
 const store={read:async id=>rows.has(id)?{catalog:rows.get(id)}:null,write:async(id,v)=>{rows.set(id,v);return true;}};
 const reader=async()=>{reads++;return evidence};
 assert.deepEqual(await cachedArticleEvidence(evidence.url,reader,store,()=>time),evidence);
 time=600_000;await cachedArticleEvidence(evidence.url+'#section',reader,store,()=>time);assert.equal(reads,1);
 time=86400_001;await cachedArticleEvidence(evidence.url,reader,store,()=>time);assert.equal(reads,2);
});
test('unreadable articles are retried and a broken cache preserves successful evidence',async()=>{
 const rows=new Map();let reads=0;
 const store={read:async id=>rows.has(id)?{catalog:rows.get(id)}:null,write:async(id,v)=>{rows.set(id,v);return true;}};
 await cachedArticleEvidence(evidence.url,async()=>null,store);
 assert.equal(rows.size,0);
 assert.deepEqual(await cachedArticleEvidence(evidence.url,async()=>{reads++;return evidence},{read:async()=>{throw Error('offline')},write:async()=>{throw Error('offline')}}),evidence);assert.equal(reads,1);
});
test('partial text is refreshed after a short cooldown',async()=>{
 let time=0,reads=0;const rows=new Map();const store={read:async id=>rows.has(id)?{catalog:rows.get(id)}:null,write:async(id,v)=>{rows.set(id,v);return true;}};
 const reader=async()=>{reads++;return {...evidence,partial:true}};
 await cachedArticleEvidence(evidence.url,reader,store,()=>time);time=300_001;await cachedArticleEvidence(evidence.url,reader,store,()=>time);assert.equal(reads,2);
});
