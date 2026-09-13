import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),Module=require('node:module'),load=Module._load;
const now=new Date().toISOString(),old=new Date(Date.now()-60*86400000).toISOString();
const company={id:'example',name:'Example Corp',posts:[{date:now,text:'Current post',url:'https://example.test/post'},{date:old,text:'Old post',url:'https://example.test/old'}],news:[{published:now,title:'Current news',source:'Publisher',url:'https://publisher.test/news'}],site:[{published:now,title:'Website launch',url:'https://example.test/launch'},{published:old,title:'Old website item',url:'https://example.test/old-site'}],fetchedAt:now,newsAt:now,siteAt:now};
Module._load=function(id,parent,...rest){if(id==='@/lib/marketIntelFeed')return{readMarketIntelFeed:async()=>({companies:{example:company},people:{}}),buildBriefing:()=>({signals:[]})};if(id==='@/lib/marketIntelTracking')return{readMarketIntelTracking:async()=>({companies:[],people:[]})};return load.call(this,id,parent,...rest);};
const {searchMarketIntel}=require('../lib/marketIntelAgent.ts');
Module._load=load;
test('company retrieval includes own website and filters explicit date window before generation',async()=>{const result=await searchMarketIntel('Example Corp','What changed in the past 30 days?');assert.match(result,/1 company posts, 1 outside news articles, 1 website updates/);assert.match(result,/Website launch/);assert.match(result,/https:\/\/example.test\/launch/);assert.doesNotMatch(result,/Old post|Old website item/);assert.match(result,/Last recorded collection timestamps/);});
test('unscoped retrieval retains older records with explicit sample coverage',async()=>{const result=await searchMarketIntel('Example Corp');assert.match(result,/Old post/);assert.match(result,/Old website item/);assert.match(result,/sample is never the total/);});
test('qualifications at the end of a stored summary reach the agent',async()=>{
 company.news[0].articleText='Original publisher evidence. '.repeat(20);
 company.news[0].summary='A newly announced licensing agreement. '.repeat(10)+'Rights exclude the retained home market; closing remains conditional.';
 const result=await searchMarketIntel('Example Corp');
 assert.match(result,/Rights exclude the retained home market; closing remains conditional/);
 assert.match(result,/Dates label publication, not necessarily the event date/);
 delete company.news[0].summary;delete company.news[0].articleText;
});

test('unverified AI summaries do not become factual evidence',async()=>{
 company.news[0].summary='Unsupported worldwide rights';
 const result=await searchMarketIntel('Example Corp');
 assert.doesNotMatch(result,/Unsupported worldwide rights/);
 assert.match(result,/Original article text unavailable/);
 delete company.news[0].summary;
});
