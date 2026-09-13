import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const Module=createRequire(import.meta.url)('node:module');
const originalLoad=Module._load;
Module._load=function(name,...args){return name==='server-only'?{}:originalLoad.call(this,name,...args);};
const {addCompanyByLink,runMarketIntelRefresh}=await import('../lib/marketIntelRefresh.ts');
const {seedCompanies}=await import('../lib/marketIntelTracking.ts');
Module._load=originalLoad;

test('website-only tracking saves a real-source-shaped briefing; duplicates do not write or scrape',async()=>{
 const originalFetch=globalThis.fetch;
 const keys=['NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','PERPLEXITY_API_KEY','APIFY_API_TOKEN','ANTHROPIC_API_KEY'];
 const originalEnv=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://tracking-flow-test.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='test';
 for(const k of keys.slice(2))delete process.env[k];
 const catalog={companies:[],people:[],divisions:{}};seedCompanies(catalog);
 const rows=new Map([['market-intel:default',{catalog,updated_at:'initial'}]]);
 let writes=0,scrapes=0,failBriefing=false;
 const date=new Date().toISOString();
 globalThis.fetch=async(input,init)=>{
  const url=new URL(String(input)); const method=init?.method||'GET';
  if(url.hostname==='tracking-flow-test.invalid'){
   const id=url.searchParams.get('id')?.replace(/^eq\./,'');
   if(method==='GET'){if(id?.startsWith('like.')){const prefix=id.slice(5).replace(/%$/,'');return Response.json([...rows].filter(([k])=>k.startsWith(prefix)).map(([id,r])=>({id,...r})));}return Response.json(id?rows.get(id)||null:[]);}
   assert.ok(['POST','PATCH'].includes(method));writes++;
   const row=JSON.parse(init.body);const rowId=id||row.id;
   if(method==='PATCH')assert.equal(url.searchParams.get('updated_at'),`eq.${rows.get(rowId).updated_at}`);
   if(failBriefing && rowId.startsWith("market-intel-company:")) return Response.json({message:"Simulated persistence failure"},{status:503});
   rows.set(rowId,{catalog:row.catalog,updated_at:row.updated_at});return Response.json([{id:rowId}]);
  }
  scrapes++;
  if(url.hostname==='acmescience.test'){
   if(url.pathname!=='/' && url.pathname!=='/news/acme-science-announces-new-research-partnership')return new Response('',{status:404});
   const html=url.pathname==='/'?'<title>Acme Science</title><a href="/news/acme-science-announces-new-research-partnership">Acme Science announces new research partnership</a>':`<h1>Acme Science announces new research partnership</h1><meta property="og:type" content="article"><meta property="article:published_time" content="${date}">`;
   return new Response(html,{headers:{'content-type':'text/html'}});
  }
  if(url.hostname==='news.google.com')return new Response(`<rss><channel><item><title>Acme Science announces research partnership - Science Publisher</title><link>https://publisher.test/news/acme-partnership</link><pubDate>${new Date().toUTCString()}</pubDate><source>Science Publisher</source></item></channel></rss>`,{headers:{'content-type':'application/rss+xml'}});
  if(url.hostname==='www.google.com'&&url.pathname==='/s2/favicons')return new Response('',{status:404});
  throw new Error(`Unexpected network request: ${url.hostname}`);
 };
 try{
  const known=catalog.companies.find(c=>c.website);
  await assert.rejects(()=>addCompanyByLink({website:known.website},'customer',{divisions:['MPR']}),/already exists/);
  assert.equal(writes,0);assert.equal(scrapes,0);
  failBriefing=true;
  await assert.rejects(()=>addCompanyByLink({website:'acmescience.test'},'customer',{divisions:['MPR']}),/Nothing was added/);
  assert.ok(!rows.get('market-intel:default').catalog.companies.some(c=>c.id==='acme-science'));
  failBriefing=false;
  const result=await addCompanyByLink({website:'acmescience.test'},'customer',{divisions:['MPR']});
  assert.equal(result.name,'Acme Science');assert.equal(result.existing,false);
  assert.ok(rows.get('market-intel:default').catalog.companies.some(c=>c.id===result.id));
  const feed=[...rows.values()].map(r=>r.catalog?.company || r.catalog).find(c=>c.id===result.id&&Array.isArray(c.news));
  assert.ok(feed,'A briefing was persisted');assert.equal(feed.news.length,0,'Unverified news is not presented as accepted');assert.equal(feed.pendingNews[0].url,'https://publisher.test/news/acme-partnership');assert.ok(result.warnings.some(w=>w.includes('still being verified')));assert.ok(feed.site.some(i=>i.title==='Acme Science announces new research partnership'));
  const beforeWrites=writes,beforeScrapes=scrapes;
  await assert.rejects(()=>addCompanyByLink({website:'https://www.acmescience.test'},'customer',{divisions:['MPR']}),/already exists/);
  assert.equal(writes,beforeWrites);assert.equal(scrapes,beforeScrapes);
  // A recent global metadata write must not hide a company's overdue news.
  for(const c of rows.get('market-intel:default').catalog.companies)c.activeByDefault=c.id===result.id;
  const savedEntry=rows.get(`market-intel-company:${result.id}`).catalog.company;
  savedEntry.newsAt=new Date(0).toISOString();savedEntry.siteAt=new Date(0).toISOString();
  const firstRefresh=await runMarketIntelRefresh();
  assert.equal(firstRefresh.ran,true);assert.ok(scrapes>beforeScrapes,'Free news/site collection runs without an Apify token');
  const retried=rows.get(`market-intel-company:${result.id}`).catalog.company;assert.equal(retried.news.length,0);assert.equal(retried.pendingNews.length,1,'Unverified candidates survive the next refresh for another retry');
  const collectedScrapes=scrapes;
  await runMarketIntelRefresh();
  assert.equal(scrapes,collectedScrapes,'A second run skips this company’s fresh sources');
 }finally{
  globalThis.fetch=originalFetch;for(const k of keys){if(originalEnv[k]===undefined)delete process.env[k];else process.env[k]=originalEnv[k];}
 }
});
