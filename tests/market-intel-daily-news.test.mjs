import {createRequire} from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
require('../scripts/qa/stub-server-only.cjs');
const {scrapeFreshNews}=require('../lib/perplexityNews.ts');

for(const unavailable of [false,true])test(`daily news combines independent sources; provider unavailable=${unavailable}`,async()=>{
 const original=globalThis.fetch;
 const saved={NEXT_PUBLIC_SUPABASE_URL:process.env.NEXT_PUBLIC_SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY:process.env.SUPABASE_SERVICE_ROLE_KEY};
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://daily-news-test.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='isolated';
 const rows=new Map();let searches=0;
 globalThis.fetch=async(input,init={})=>{
  const u=new URL(String(input));
  if(u.hostname==='news.google.com')return new Response(`<rss><channel><item><title>Example announces a research platform</title><link>https://publisher.test/platform</link><pubDate>${new Date().toUTCString()}</pubDate><source>Publisher</source></item></channel></rss>`);
  if(u.hostname==='api.perplexity.ai'){
   searches++;
   if(unavailable)return Response.json({error:'unavailable'},{status:503});
   return Response.json({usage:{cost:{total_cost:.006}},search_results:[{title:'New partnership will accelerate clinical research',url:'https://second.test/partnership',date:new Date().toISOString()}],choices:[{message:{content:JSON.stringify({items:[{sourceIndex:1,summary:'Example announced a partnership.'}]})}}]});
  }
  if(u.hostname==='api.apify.com'){
   if(u.pathname.endsWith('/runs')){assert.match(JSON.parse(init.body).queries,/after:/);return Response.json({data:{id:'web-run',defaultDatasetId:'web-data'}});}
   if(u.pathname.includes('/actor-runs/'))return Response.json({data:{status:'SUCCEEDED',defaultDatasetId:'web-data',usageTotalUsd:.02}});
   return Response.json([{organicResults:[{title:'Example expands clinical research services',url:'https://third.test/expansion',date:new Date().toISOString()}]}]);
  }
  if(['publisher.test','second.test','third.test'].includes(u.hostname))return new Response(`<meta name="pubdate" content="${new Date().toISOString()}"><h1>${u.hostname==='publisher.test'?'Example announces a research platform':'New partnership will accelerate clinical research'}</h1><article>${'Example announced a new research partnership and platform. '.repeat(12)}</article>`);
  assert.equal(u.hostname,'daily-news-test.invalid','No real database or provider access');
  const id=u.searchParams.get('id')?.replace(/^eq\./,'');
  if(!init.method||init.method==='GET')return Response.json(rows.get(id)||null);
  const body=JSON.parse(init.body);const key=id||body.id;rows.set(key,body);return Response.json([{id:key}]);
 };
 try{
  const result=await scrapeFreshNews({name:'Example',site:'example.test'},'test-key',{webSearchToken:'test-token'});
  assert.ok(result.news.some(n=>n.url==='https://third.test/expansion'),'Google web discovery feeds the daily article reader');
  assert.ok(result.cost>=.02,'Web discovery cost is retained even if Perplexity fails');
  assert.ok(searches>0,'A nonempty RSS result must not skip the other news index');
  assert.ok(result.news.some(n=>n.url==='https://publisher.test/platform'),'A provider failure must retain the successful RSS result');
  assert.equal(result.failed,unavailable);
  if(!unavailable)assert.ok(result.news.some(n=>n.url==='https://second.test/partnership'));
 }finally{globalThis.fetch=original;for(const [k,v]of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});
