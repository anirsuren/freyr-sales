import {createRequire} from 'node:module';
import test from 'node:test';import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const Module=require('node:module'),loadModule=Module._load;
Module._load=function(name,...args){return name==='server-only'?{}:loadModule.call(this,name,...args)};
const {requestMarketIntelWebSearch,requestRenderedNewsPage,requestMarketIntelSourceSearch}=require('../lib/marketIntelSearch.ts');

test('web search replays use the shared cache and retain real provider cost',async()=>{
 const original=globalThis.fetch;const env={url:process.env.NEXT_PUBLIC_SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY};
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://readers-test.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='isolated-test';
 const rows=new Map();let runs=0,reads=0,renders=0,sourceSearches=0;
 globalThis.fetch=async(input,init={})=>{
  const u=new URL(String(input));
  if(u.hostname==='api.openai.com'){
   sourceSearches++;const body=JSON.parse(init.body);assert.equal(body.max_tool_calls,2);assert.equal(body.model,'gpt-5-mini');assert.equal(body.store,false);
   return Response.json({id:'response-1',usage:{input_tokens:8500,input_tokens_details:{cached_tokens:1000},output_tokens:500},output:[{type:'web_search_call',status:'completed',action:{sources:[{url:'https://publisher.test/verified?utm_source=openai'}]}},{type:'web_search_call',status:'completed',action:{type:'search',sources:[{url:'https://second.test/article'}]}},{type:'message',content:[{type:'output_text',text:'https://invented.test/not-a-source'}]}]});
  }
  if(u.hostname==='api.apify.com'){
   if(u.pathname.includes('/actor-runs/'))return Response.json({data:{id:'run-1',status:'SUCCEEDED',usageTotalUsd:.0283,defaultDatasetId:'data-1'}});
   if(u.pathname.endsWith('/runs')){runs++;return Response.json({data:{id:'run-1',status:'SUCCEEDED',usageTotalUsd:.0283,defaultDatasetId:'data-1'}});}
   assert.ok(u.pathname.includes('/datasets/data-1/'));reads++;return Response.json([{organicResults:[{title:'Example announces a platform',url:'https://publisher.test/a'}]}]);
  }
  if(u.hostname==='api.firecrawl.dev'){renders++;assert.equal(JSON.parse(init.body).proxy,'enhanced');return Response.json({success:true,data:{rawHtml:'<title>Access denied</title>',metadata:{statusCode:403,title:'Access denied',creditsUsed:1}}});}
  assert.equal(u.hostname,'readers-test.invalid','Tests cannot access a real database');
  const id=u.searchParams.get('id')?.replace(/^eq\./,'');
  if(!init.method||init.method==='GET')return Response.json(rows.get(id)||null);
  const body=JSON.parse(init.body);const key=id||body.id;rows.set(key,body);return Response.json([{id:key}]);
 };
 try{
  const a=await requestMarketIntelWebSearch(['Example news'],'test','Example');
  const b=await requestMarketIntelWebSearch(['Example news'],'test','Example');
  assert.equal(runs,1);assert.equal(reads,1);assert.equal(a.cost,.0283);assert.equal(b.cost,0);assert.deepEqual(a.pages,b.pages);
  const ledger=[...rows].find(([k])=>k.includes('search-spend'))[1].catalog;
  assert.equal(ledger.spent,.0283);assert.deepEqual(ledger.reservations,{});
  const oldRenderLimit=process.env.MARKET_INTEL_RENDER_DAILY_CREDIT_LIMIT;
  process.env.MARKET_INTEL_RENDER_DAILY_CREDIT_LIMIT='1';
  try {
  assert.equal(await requestRenderedNewsPage('https://publisher.test/blocked','test'),null);
  assert.equal(await requestRenderedNewsPage('https://publisher.test/blocked','test'),null);
  assert.equal(renders,1,'Challenge pages are cached as failures, not repeatedly bought or accepted as articles');
  const credits=[...rows].find(([k])=>k.includes('render-credits'))[1].catalog;
  assert.equal(credits.reservedCredits,1);assert.equal(credits.requests[0].creditsUsed,1);
  assert.equal(await requestRenderedNewsPage('https://publisher.test/second-blocked','test'),null);
  assert.equal(renders,2,'The old local credit cap must not block authorized provider requests');
  } finally { if(oldRenderLimit===undefined)delete process.env.MARKET_INTEL_RENDER_DAILY_CREDIT_LIMIT;else process.env.MARKET_INTEL_RENDER_DAILY_CREDIT_LIMIT=oldRenderLimit; }
  const source=await requestMarketIntelSourceSearch('Example news','test','Example');
  assert.deepEqual(source.urls,['https://publisher.test/verified','https://second.test/article']);assert.ok(Math.abs(source.cost-.0229)<1e-9);
  assert.equal((await requestMarketIntelSourceSearch('Example news','test','Example')).cost,0);assert.equal(sourceSearches,1);
  rows.set('market-intel:config',{catalog:{perplexityDailyLimitUsd:0},updated_at:'capped'});
  await assert.rejects(()=>requestMarketIntelWebSearch(['Another company news'],'test','Another'),/Daily paid-search limit/);
  await assert.rejects(()=>requestMarketIntelSourceSearch('Another news','test','Another'),/Daily paid-search limit/);assert.equal(sourceSearches,1);
  assert.equal(runs,1);
 }finally{globalThis.fetch=original;for(const [key,value] of Object.entries({NEXT_PUBLIC_SUPABASE_URL:env.url,SUPABASE_SERVICE_ROLE_KEY:env.key})){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});

for (const originFailure of [false,true]) test(`temporary ${originFailure?'origin':'renderer'} failures retry after cooldown instead of hiding a source for a day`,async()=>{
 const original=globalThis.fetch;const env={url:process.env.NEXT_PUBLIC_SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY};
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://retry-reader-test.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='isolated-test';
 const rows=new Map();let renders=0;
 globalThis.fetch=async(input,init={})=>{
  const u=new URL(String(input));
  if(u.hostname==='api.firecrawl.dev'){renders++;return renders===1?(originFailure?Response.json({success:true,data:{metadata:{statusCode:503}}}):Response.json({success:false},{status:500})):Response.json({success:true,data:{rawHtml:'<title>Example release</title><article>Verified source text</article>',metadata:{statusCode:200,creditsUsed:1}}});}
  assert.equal(u.hostname,'retry-reader-test.invalid');
  const id=u.searchParams.get('id')?.replace(/^eq\./,'');
  if(!init.method||init.method==='GET')return Response.json(rows.get(id)||null);
  const body=JSON.parse(init.body);rows.set(id||body.id,body);return Response.json([{id:id||body.id}]);
 };
 try{
  const url='https://publisher.test/transient';
  assert.equal(await requestRenderedNewsPage(url,'test'),null);
  assert.equal(await requestRenderedNewsPage(url,'test'),null);assert.equal(renders,1);
  const cached=[...rows].find(([key])=>key.includes('search-cache:render:'))[1];
  cached.catalog.at=new Date(Date.now()-6*60_000).toISOString();
  assert.match(await requestRenderedNewsPage(url,'test'),/Verified source text/);assert.equal(renders,2);
  await requestRenderedNewsPage(url,'test');assert.equal(renders,2);
 }finally{globalThis.fetch=original;for(const [key,value] of Object.entries({NEXT_PUBLIC_SUPABASE_URL:env.url,SUPABASE_SERVICE_ROLE_KEY:env.key})){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});

test('a discovered neighbouring page leads to the actual company article',async()=>{
 const {hydrateCompanyNews}=require('../lib/companyWebsiteNews.ts');const original=globalThis.fetch;
 globalThis.fetch=async(input)=>{
  const u=new URL(String(input));assert.equal(u.hostname,'publisher.test');
  const current=u.pathname==='/news/example';
  return new Response(`<meta property="article:published_time" content="${new Date().toISOString()}"><h1>${current?'Example announces its new research platform':'Another business launches a different product'}</h1><article>${(current?'Example announced a research platform. ':'Another business announced a new product. ').repeat(20)}</article>${current?'':'<aside><a href="/news/example">Example announces its new research platform</a></aside>'}`);
 };
 try{
  const result=await hydrateCompanyNews([{url:'https://publisher.test/news/neighbour',title:'Another business launches a different product',source:'Publisher',published:null,excerpt:'Next story: Example announces its new research platform'}],'Example','example.test');
  assert.deepEqual(result.map(n=>n.url),['https://publisher.test/news/example']);
  assert.ok(result[0].published);assert.equal(result[0].publisherUrl,result[0].url);
  assert.match(result[0].articleText,/Example announced/);assert.ok(result[0].articleReadAt);
 }finally{globalThis.fetch=original;}
});

test('publisher tracking redirects cannot disguise an official product page as external news',async()=>{
 const {hydrateCompanyNews}=require('../lib/companyWebsiteNews.ts');const original=globalThis.fetch;
 globalThis.fetch=async()=>{
  const response=new Response(`<h1>Example market access platform</h1><main>${'Example helps regulatory teams plan market entry. '.repeat(20)}</main>`);
  Object.defineProperty(response,'url',{value:'https://example.test/products/market-access'});
  return response;
 };
 try{
  const news=await hydrateCompanyNews([{url:'https://publisher.test/tracking-link',title:'Example market access platform',published:null,source:'Publisher'}],'Example','example.test');
  assert.deepEqual(news,[]);
 }finally{globalThis.fetch=original;}
});

test('prose article content excludes related cards but retains their discovery links',async()=>{
 const {resolveArticleEvidence}=require('../lib/marketIntelSummarize.ts');const original=globalThis.fetch;
 globalThis.fetch=async()=>new Response(`<h1>Different Company launches a clinical service</h1><main><div class="prose"><p>${'Different Company launched its clinical service for sponsors. '.repeat(12)}</p></div><section><h2>You May Also Like</h2><a href="/news/example-announcement">Example releases a new clinical research platform</a></section></main>`);
 try{
  const evidence=await resolveArticleEvidence('https://publisher.test/news/prose-boundary');
  assert.ok(evidence);assert.doesNotMatch(evidence.text,/Example|You May Also Like/);
  assert.equal(evidence.articleLinks[0].url,'https://publisher.test/news/example-announcement');
 }finally{globalThis.fetch=original;}
});

test('HTTP 200 bot challenges cannot become article evidence',async()=>{
 const {resolveArticleEvidence}=require('../lib/marketIntelSummarize.ts');const original=globalThis.fetch;const key=process.env.FIRECRAWL_API_KEY;
 delete process.env.FIRECRAWL_API_KEY;
 globalThis.fetch=async()=>new Response(`<title>Making sure you're not a bot!</title><body>${'This server requires browser verification. '.repeat(20)}</body>`);
 try{assert.equal(await resolveArticleEvidence('https://publisher.test/news/bot-challenge'),null);}
 finally{globalThis.fetch=original;if(key!==undefined)process.env.FIRECRAWL_API_KEY=key;}
});

test('the article dateline wins over recent dates in related stories',async()=>{
 const {visiblePublicationDate}=require('../lib/companyWebsiteNews.ts');
 const html='<header><h1>Example launches a platform</h1><ul class="entry-meta"><li itemprop="datePublished"><time datetime="2026-05-05T17:25:00+05:30">May 5, 2026</time></li></ul></header><aside><time class="latest-post-date">September 12, 2026</time></aside>';
 assert.equal(visiblePublicationDate(html),'2026-05-05');
});

test('a standalone abbreviated dateline and markdown body are read without navigation',async()=>{
 const {resolveArticleEvidence}=require('../lib/marketIntelSummarize.ts');const original=globalThis.fetch;
 globalThis.fetch=async()=>new Response(`<div>Other headlines and markets</div><h1>Example expands its clinical research platform</h1><div><span>Aug. 18, 2026</span></div><div class="markdown-content"><p>${'Example released three new workflows with human oversight. '.repeat(12)}</p></div>`);
 try{const item=await resolveArticleEvidence('https://publisher.test/news/markdown-dateline');assert.equal(item.published,'2026-08-18');assert.doesNotMatch(item.text,/Other headlines/);}
 finally{globalThis.fetch=original;}
});

test('short related article cards do not replace the story containing the main heading',async()=>{
 const {resolveArticleEvidence}=require('../lib/marketIntelSummarize.ts');const original=globalThis.fetch;
 globalThis.fetch=async()=>new Response(`<meta name="pubdate" content="2026-08-18T12:45:05Z"><div><h1>Example announces its clinical research platform</h1><div><h2>New workflows</h2>${'Example introduced a new platform with human review. '.repeat(15)}</div></div><section><article><h4>Other Company</h4>September 12</article></section>`);
 try{const item=await resolveArticleEvidence('https://publisher.test/news/related-card-boundary');assert.match(item.text,/Example introduced/);assert.doesNotMatch(item.text,/Other Company/);assert.equal(item.published,'2026-08-18T12:45:05.000Z');}
 finally{globalThis.fetch=original;}
});

test('explicit publication labels work without h1 or schema metadata',async()=>{
 const {resolveArticleEvidence}=require('../lib/marketIntelSummarize.ts');const original=globalThis.fetch;
 globalThis.fetch=async()=>new Response(`<title>Example launches a clinical platform</title><div>September 12, 2026</div><h3>Example launches a clinical platform</h3><i>Press Release Date 08-18-2026</i><div class="views-field-body">${'Example launched its platform. '.repeat(20)}</div>`);
 try{const item=await resolveArticleEvidence('https://publisher.test/news/labeled-publication-date');assert.equal(item.published,'2026-08-18');assert.doesNotMatch(item.text,/September 12/);}
 finally{globalThis.fetch=original;}
});

test('share widgets embedded in a headline do not become part of the article title',async()=>{
 const {resolveArticleEvidence}=require('../lib/marketIntelSummarize.ts');const original=globalThis.fetch;
 globalThis.fetch=async()=>new Response(`<h1>Example launches a platform<button>Post Button</button><iframe>Twitter Widget Iframe</iframe></h1><article>${'Example launched a clinical research platform. '.repeat(15)}</article>`);
 try{const item=await resolveArticleEvidence('https://publisher.test/news/heading-widgets');assert.equal(item.title,'Example launches a platform');}
 finally{globalThis.fetch=original;}
});

test('rendered widget document titles do not get appended to the publisher title',async()=>{
 const {resolveArticleEvidence}=require('../lib/marketIntelSummarize.ts');const original=globalThis.fetch;
 globalThis.fetch=async()=>new Response(`<title>Example launches a platform</title><article>${'Example launched a clinical research platform. '.repeat(15)}</article><div><title>Post Button</title><title>Twitter Widget Iframe</title></div>`);
 try{const item=await resolveArticleEvidence('https://publisher.test/news/multiple-document-titles');assert.equal(item.title,'Example launches a platform');}
 finally{globalThis.fetch=original;}
});

test('briefings summarize articles beyond twelve and combine distinct developments',async()=>{
 const {digestCompany}=require('../lib/marketIntelSummarize.ts');const original=globalThis.fetch;
 const saved={ANTHROPIC_API_KEY:process.env.ANTHROPIC_API_KEY,AGENT_FORCE_MOCK:process.env.AGENT_FORCE_MOCK};
 process.env.ANTHROPIC_API_KEY='isolated';delete process.env.AGENT_FORCE_MOCK;
 let calls=0;
 globalThis.fetch=async(input,init={})=>{
  const u=new URL(String(input));
  if(u.hostname==='digest.test'){assert.notEqual(u.pathname,'/12','Previously read publisher evidence must survive a later network failure');return new Response(`<h1>Example announcement ${u.pathname}</h1><article>${(u.pathname==='/0'?'Example launched a platform. ':'Example announced a new clinical research development. ').repeat(15)}</article>`);}
  assert.equal(u.hostname,'api.anthropic.com');calls++;
  const prompt=JSON.parse(init.body).messages[0].content;let answer;
  if(calls<3){const articles=JSON.parse(prompt.split('NEWS ITEMS (JSON): ')[1].split('\n\nRECENT LINKEDIN')[0]);answer={tldr:calls===1?'Example launched a platform.':'Example entered a partnership.',summaries:articles.map(a=>({i:a.i,summary:`Verified ${a.title}.`}))};}
  else{assert.match(prompt,/launched a platform/);assert.match(prompt,/entered a partnership/);answer={tldr:'Example launched a platform and entered a partnership.'};}
  return Response.json({id:'test',type:'message',role:'assistant',model:'test',content:[{type:'text',text:JSON.stringify(answer)}],usage:{input_tokens:1,output_tokens:1},stop_reason:'end_turn'});
 };
 try{const result=await digestCompany({name:'Example',posts:[],news:Array.from({length:13},(_,i)=>({title:`Announcement ${i}`,source:'Publisher',url:`https://digest.test/${i}`,...(i===12?{articleText:'Example entered a partnership.',articleReadAt:new Date().toISOString()}:{} )}))});assert.equal(result.summaries.size,13);assert.match(result.summaries.get(12),/Announcement 12/);assert.match(result.tldr,/partnership/);assert.equal(calls,3);}
 finally{globalThis.fetch=original;for(const [k,v]of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});

test('deduplicated language editions retain every verified publisher URL',()=>{
 const{dedupeCompanyNews}=require('../lib/companyWebsiteNews.ts');
 const base={title:'Example announces a clinical research platform',source:'Publisher',published:'2026-09-10'};
 const en='https://publisher.test/en/news/123';const fr='https://publisher.test/fr/news/123';
 const result=dedupeCompanyNews([{...base,url:en},{...base,url:fr,articleText:'Read publisher evidence',articleReadAt:'2026-09-12T10:00:00Z'},{...base,url:'https://another-publisher.test/news/456'}]);
 assert.equal(result.length,2,'Different publishers remain distinct');assert.equal(result[0].url,en);assert.deepEqual(result[0].alternateUrls,[fr]);assert.equal(result[0].articleText,'Read publisher evidence');
 assert.deepEqual(dedupeCompanyNews([...result,{...base,url:fr}])[0].alternateUrls,[fr]);
});


test('long article endings reach the briefing and large evidence batches stay bounded',async()=>{
 const {digestCompany}=require('../lib/marketIntelSummarize.ts');const original=globalThis.fetch;
 const saved={ANTHROPIC_API_KEY:process.env.ANTHROPIC_API_KEY,AGENT_FORCE_MOCK:process.env.AGENT_FORCE_MOCK};
 process.env.ANTHROPIC_API_KEY='isolated';delete process.env.AGENT_FORCE_MOCK;
 let calls=0,seen=0;
 globalThis.fetch=async(input,init={})=>{
  assert.equal(new URL(String(input)).hostname,'api.anthropic.com');calls++;
  const prompt=JSON.parse(init.body).messages[0].content;let answer;
  if(prompt.includes('NEWS ITEMS (JSON): ')){
   const articles=JSON.parse(prompt.split('NEWS ITEMS (JSON): ')[1].split('\n\nRECENT LINKEDIN')[0]);
   assert.ok(articles.reduce((n,a)=>n+a.article_text.length,0)<=120000);
   for(const a of articles){assert.match(a.article_text,/Certification remains pending at the end\.$/);seen++;}
   answer={tldr:'Certification remains pending.',summaries:articles.map(a=>({i:a.i,summary:'Certification remains pending.'}))};
  }else answer={tldr:'Certification remains pending.'};
  return Response.json({id:'test',type:'message',role:'assistant',model:'test',content:[{type:'text',text:JSON.stringify(answer)}],usage:{input_tokens:1,output_tokens:1},stop_reason:'end_turn'});
 };
 try{
  const news=Array.from({length:3},(_,i)=>({title:`Release ${i}`,source:'Publisher',url:`https://long-digest.test/${i}`,articleText:'Evidence. '.repeat(5000)+'Certification remains pending at the end.',articleReadAt:new Date().toISOString()}));
  const result=await digestCompany({name:'Example',posts:[],news});assert.equal(seen,3);assert.equal(calls,3);assert.equal(result.summaries.size,3);
 }finally{globalThis.fetch=original;for(const[k,v]of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});

test('publisher homepages, member landing pages and gated social mirrors are not articles',()=>{
 const {filterCompanyNews}=require('../lib/companyWebsiteNews.ts');
 const make=(url,title,articleText='Example appears in the latest podcast.')=>({url,title,articleText,excerpt:articleText,published:new Date().toISOString(),source:'Publisher'});
 const items=[make('https://publisher.test/','Publisher home'),make('https://publisher.test/lounge/','Executive Lounge Members'),make('https://mirror.test/signals/example-launch','Example launches a product','Public source Publisher name Public post Example announces a product. Continue reading the complete original post'),make('https://publisher.test/podcast/example','Interview with Example')];
 assert.deepEqual(filterCompanyNews(items,'Example','example.test').map(x=>x.url),['https://publisher.test/podcast/example']);
});

test('a truncated verification response never becomes a completed identity decision',async()=>{
 const {verifyCompanyNews,classifyFailures}=require('../lib/marketIntelSummarize.ts');const original=globalThis.fetch;
 const saved={ANTHROPIC_API_KEY:process.env.ANTHROPIC_API_KEY,AGENT_FORCE_MOCK:process.env.AGENT_FORCE_MOCK,PERPLEXITY_API_KEY:process.env.PERPLEXITY_API_KEY};
 process.env.ANTHROPIC_API_KEY='isolated';delete process.env.AGENT_FORCE_MOCK;delete process.env.PERPLEXITY_API_KEY;
 globalThis.fetch=async(input,init)=>{assert.equal(new URL(String(input)).hostname,'api.anthropic.com');assert.ok(JSON.parse(init.body).max_tokens>=4096);return Response.json({id:'test',type:'message',role:'assistant',model:'test',content:[{type:'text',text:'{"items":[{"i":0,"accept":true}]}'}],usage:{input_tokens:1,output_tokens:1},stop_reason:'max_tokens'});};
 try{const result=await verifyCompanyNews('Example','https://example.test',[{kind:'news',title:'Example launches a product',text:'A release from Example.'}]);assert.equal(result.size,0);assert.match(classifyFailures.note,/response limit/);}
 finally{globalThis.fetch=original;for(const[k,v]of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});

test('one declined source stays pending without stranding unrelated publishers',async()=>{
 const {verifyCompanyNews}=require('../lib/marketIntelSummarize.ts');const original=globalThis.fetch;
 const saved={ANTHROPIC_API_KEY:process.env.ANTHROPIC_API_KEY,AGENT_FORCE_MOCK:process.env.AGENT_FORCE_MOCK,PERPLEXITY_API_KEY:process.env.PERPLEXITY_API_KEY};
 process.env.ANTHROPIC_API_KEY='isolated';delete process.env.AGENT_FORCE_MOCK;delete process.env.PERPLEXITY_API_KEY;
 let calls=0;
 globalThis.fetch=async(input,init)=>{
  assert.equal(new URL(String(input)).hostname,'api.anthropic.com');calls++;
  const prompt=JSON.parse(init.body).messages[0].content;const items=JSON.parse(prompt.split('Candidate evidence:\n')[1]);
  const declined=items.length>1||items[0].title==='Declined source';
  return Response.json({id:'test',type:'message',role:'assistant',model:'test',content:declined?[]:[{type:'text',text:'{"items":[{"i":0,"accept":true}]}'}],usage:{input_tokens:1,output_tokens:1},stop_reason:declined?'refusal':'end_turn'});
 };
 try{const result=await verifyCompanyNews('Example',undefined,[{kind:'post',title:'Post',text:'Post'},{kind:'news',title:'Declined source',text:'Unavailable verification'},{kind:'news',title:'Example release',text:'A public company release'}]);assert.deepEqual([...result],[[2,true]]);assert.equal(calls,3);}
 finally{globalThis.fetch=original;for(const[k,v]of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});

test('publisher response speed does not reorder the collection',async()=>{
 const {hydrateCompanyNews}=require('../lib/companyWebsiteNews.ts');const original=globalThis.fetch;
 globalThis.fetch=async(input)=>{const url=new URL(String(input));await new Promise(resolve=>setTimeout(resolve,url.pathname==='/slow'?20:1));return new Response(`<meta property="article:published_time" content="${new Date().toISOString()}"><h1>Example release ${url.pathname}</h1><article>${'Example announced a new platform. '.repeat(20)}</article>`);};
 try{const items=['slow','fast'].map(name=>({url:`https://ordered-publisher.test/${name}`,title:`Example release ${name}`,source:'Publisher'}));const result=await hydrateCompanyNews(items,'Example','example.test',false);assert.deepEqual(result.map(n=>n.url),items.map(n=>n.url));}
 finally{globalThis.fetch=original;}
});

test('hidden encoded subscriber content is excluded and the visible excerpt is marked partial',async()=>{
 const {hydrateCompanyNews}=require('../lib/companyWebsiteNews.ts');const original=globalThis.fetch;
 globalThis.fetch=async()=>new Response(`<meta property="article:published_time" content="${new Date().toISOString()}"><h1>Example announces a new product</h1><article><p>${'Example announced a beta product for regulatory teams. '.repeat(8)}</p><noscript>Enable JavaScript to read subscriber content.</noscript><div class="subscriber-only encrypted-content" style="display:none">kAm${'ENCODED_PAYLOAD'.repeat(100)}</div></article>`);
 try{const unread=[];const news=await hydrateCompanyNews([{url:'https://partial-publisher.test/release',title:'Example announces a new product',source:'Publisher'}],'Example','example.test',false,url=>unread.push(url));assert.equal(news.length,1);assert.equal(news[0].articleTextPartial,true);assert.doesNotMatch(news[0].articleText,/ENCODED_PAYLOAD|Enable JavaScript|kAm/);assert.equal(unread.length,1);}
 finally{globalThis.fetch=original;}
});

test('a later full read replaces a partial excerpt and old encoded evidence is discarded',()=>{
 const {dedupeCompanyNews}=require('../lib/companyWebsiteNews.ts');
 const base={url:'https://upgrade-publisher.test/release',title:'Example release',source:'Publisher'};
 const partial={...base,articleText:'Visible introduction',articleTextPartial:true};
 const full={...base,articleText:'The complete readable article',articleTextPartial:false};
 assert.equal(dedupeCompanyNews([partial,full])[0].articleText,full.articleText);
 assert.equal(dedupeCompanyNews([full,partial])[0].articleText,full.articleText);
 assert.equal(dedupeCompanyNews([{...base,articleText:'Old clipped text'},full])[0].articleText,full.articleText);
 const result=dedupeCompanyNews([{...base,articleText:'kAm ENCODED k^Am',summary:'Untrusted old summary'},partial])[0];
 assert.equal(result.articleText,partial.articleText);assert.equal(result.summary,undefined);assert.equal(result.articleTextPartial,true);
});

test('company-specific analysis late in a long article reaches verification',()=>{
 const {companyVerificationEvidence}=require('../lib/marketIntelSummarize.ts');
 const text='A comparison of regulatory platforms. '+'General background. '.repeat(750)+'Example capabilities include native device registration and UDI controls. '+'Additional context. '.repeat(800)+'Example limitations include device-only scope.';
 const evidence=companyVerificationEvidence('Example',text);
 assert.ok(evidence.length<=8000);assert.match(evidence,/A comparison/);assert.match(evidence,/native device registration/);assert.match(evidence,/device-only scope/);assert.match(evidence,/excerpt gap/);
});

test('briefing payloads keep long publisher evidence on the server',()=>{
 const {buildBriefing}=require('../lib/marketIntelFeed.ts');
 const news={title:'Example release',source:'Publisher',url:'https://payload-publisher.test/release',published:new Date().toISOString(),summary:'Example announced a beta.',articleText:'Long source body. '.repeat(1000),articleReadAt:new Date().toISOString(),articleTextPartial:true};
 const company={id:'example',name:'Example',group:'competitor',posts:[],news:[news],site:[],fetchedAt:new Date().toISOString()};
 const briefing=buildBriefing(company,[]);assert.equal(briefing.news[0].articleText,undefined);assert.equal(briefing.news[0].articleReadAt,undefined);assert.equal(briefing.news[0].articleTextPartial,true);assert.equal(briefing.news[0].summary,news.summary);assert.ok(company.news[0].articleText.length>10000);
});

for(const primaryAvailable of [true,false])test(`initial discovery retains complementary publishers when the primary index is ${primaryAvailable?'available':'unavailable'}`,async()=>{
 const {discoverInitialCompanyNews}=require('../lib/companyNewsDiscovery.ts');
 const original=globalThis.fetch;
 const env=Object.fromEntries(['NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','OPENAI_API_KEY'].map(k=>[k,process.env[k]]));
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://diversity-test.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='isolated-test';delete process.env.OPENAI_API_KEY;
 const rows=new Map();let runs=0,newsRuns=0;const date=new Date().toISOString();
 const title='Example announces a new regulatory planning platform';
 globalThis.fetch=async(input,init={})=>{
  const u=new URL(String(input));
  if(u.hostname==='api.perplexity.ai')return primaryAvailable?Response.json({results:[{url:'https://first-outlet.test/news/launch',title,date},...Array.from({length:9},(_,i)=>({url:`https://irrelevant-${i}.test/news/`,title:'General news archive',date}))]}):Response.json({error:'Unavailable'},{status:403});
  if(u.hostname.startsWith('irrelevant-'))return new Response('<main>No matching stories</main>');
  if(u.hostname==='api.apify.com'){
   if(u.pathname.includes('/actor-runs/')){const id=u.pathname.split('/').pop();return Response.json({data:{id,status:'SUCCEEDED',usageTotalUsd:.02,defaultDatasetId:id==='news-run'?'news-data':id.replace('run-','data-')}});}
   if(u.pathname.includes('s-r~google-news/runs')){newsRuns++;assert.equal(JSON.parse(init.body).q,'Example');return Response.json({data:{id:'news-run',status:'SUCCEEDED',usageTotalUsd:.04,defaultDatasetId:'news-data'}});}
   if(u.pathname.includes('/datasets/news-data/'))return Response.json([{url:'https://news-outlet.test/news/launch',title,published:date,source:'News Outlet'}]);
   if(u.pathname.endsWith('/runs')){
    runs++;if(runs===2){assert.match(JSON.parse(init.body).queries,/-site:first-outlet.test/);assert.equal(JSON.parse(init.body).maxPagesPerQuery,4);}
    assert.ok(runs<=2,'Publisher diversification is bounded to one additional run');
    return Response.json({data:{id:`run-${runs}`,status:'SUCCEEDED',usageTotalUsd:.02,defaultDatasetId:`data-${runs}`}});
   }
   const host=u.pathname.includes('data-2')?'second-outlet.test':'first-outlet.test';
   return Response.json([{organicResults:[{url:`https://${host}/${host==='second-outlet.test'?'news/':'news/launch'}`,title,date}]}]);
  }
  if(u.hostname==='second-outlet.test'&&u.pathname==='/news/')return new Response(`<main><a href='/news/bpage/2/'>2</a></main>`);
  if(u.hostname==='second-outlet.test'&&u.pathname==='/news/bpage/2/')return new Response(`<main><a href='/news/launch'>${title}</a></main>`);
  if(['first-outlet.test','second-outlet.test','news-outlet.test'].includes(u.hostname))return new Response(`<meta property="article:published_time" content="${date}"><h1>${title}</h1><article>${'Example announced a regulatory planning platform for medical device manufacturers. '.repeat(12)}</article>`);
  assert.equal(u.hostname,'diversity-test.invalid','No real database or unmocked provider is allowed');
  const id=u.searchParams.get('id')?.replace(/^eq\./,'');
  if(!init.method||init.method==='GET')return Response.json(rows.get(id)||null);
  const body=JSON.parse(init.body);rows.set(id||body.id,body);return Response.json([{id:id||body.id}]);
 };
 try{
  let releaseWebsite;
  const website=new Promise(resolve=>{releaseWebsite=resolve;});
  const running=discoverInitialCompanyNews('Example','example.test','test',website,undefined,'test');
  // Initial external search must not wait for the website collector.
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.ok([...rows.keys()].some(id=>id.includes('search')), 'external search starts while website is unresolved');
  releaseWebsite([]);
  const result=await running;
  assert.equal(runs,2);assert.equal(newsRuns,primaryAvailable?0:1);assert.deepEqual(result.news.map(n=>new URL(n.url).hostname).sort(),primaryAvailable?['first-outlet.test','second-outlet.test']:['first-outlet.test','news-outlet.test','second-outlet.test']);
 }finally{globalThis.fetch=original;for(const [k,v]of Object.entries(env)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});

test('Google redirect metadata is decoded even without an article-length visible body',async()=>{
 const {decodeGoogleNewsUrl}=require('../lib/marketIntelSummarize.ts');const original=globalThis.fetch;let decoded=false;
 globalThis.fetch=async(input,init={})=>{
  const u=new URL(String(input));assert.equal(u.hostname,'news.google.com');
  if(init.method==='POST'){decoded=true;return new Response('"garturlres","https://publisher.test/news/verified"');}
  return new Response('<html><title>Google News</title><body><c-wiz data-n-a-sg="signature" data-n-a-ts="12345"></c-wiz></body></html>');
 };
 try{assert.equal(await decodeGoogleNewsUrl('https://news.google.com/rss/articles/example'),'https://publisher.test/news/verified');assert.equal(decoded,true);}finally{globalThis.fetch=original;}
});

test('paginated publisher archives remain indexes, not articles',()=>{
 const {isNewsIndex}=require('../lib/companyWebsiteNews.ts');
 assert.equal(isNewsIndex('https://publisher.test/news/bpage/2/'),true);
 assert.equal(isNewsIndex('https://publisher.test/tag/technology/page/3/'),true);
 assert.equal(isNewsIndex('https://publisher.test/news/new-product-launch'),false);
});


test('article reader rejects PDFs and cancels oversized bodies before HTML parsing',async()=>{
 const {resolveArticleEvidence}=require('../lib/marketIntelSummarize.ts');const original=globalThis.fetch;let cancelled=false;
 globalThis.fetch=async(input)=>{
  const path=new URL(String(input)).pathname;
  if(path==='/binary.pdf')return new Response('%PDF-1.7 '+ 'binary'.repeat(1000),{headers:{'content-type':'application/pdf'}});
  if(path==='/untyped')return new Response('%PDF-1.7 '+ 'binary'.repeat(1000));
  return new Response(new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(1_000_001));},cancel(){cancelled=true;}}),{headers:{'content-type':'text/html'}});
 };
 try{assert.equal(await resolveArticleEvidence('https://bounded-reader.test/binary.pdf'),null);assert.equal(await resolveArticleEvidence('https://bounded-reader.test/untyped'),null);assert.equal(await resolveArticleEvidence('https://bounded-reader.test/oversize'),null);assert.equal(cancelled,true);}finally{globalThis.fetch=original;}
});

test('Firecrawl web discovery reuses credits and falls back only for a failed query',async()=>{
 const original=globalThis.fetch,env={NEXT_PUBLIC_SUPABASE_URL:process.env.NEXT_PUBLIC_SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY:process.env.SUPABASE_SERVICE_ROLE_KEY,FIRECRAWL_API_KEY:process.env.FIRECRAWL_API_KEY};
 Object.assign(process.env,{NEXT_PUBLIC_SUPABASE_URL:'https://firecrawl-search-test.invalid',SUPABASE_SERVICE_ROLE_KEY:'test',FIRECRAWL_API_KEY:'test'});
 const rows=new Map();let searches=0,actors=0;
 globalThis.fetch=async(input,init={})=>{
  const u=new URL(String(input));
  if(u.hostname==='api.firecrawl.dev'){
   searches++;const body=JSON.parse(init.body);assert.equal(body.limit,20);assert.deepEqual(body.sources,['web']);
   if(body.query==='Broken search')return Response.json({success:false},{status:503});
   return Response.json({success:true,creditsUsed:4,data:{web:[{title:'Clinical study',url:'https://publisher.test/article'},{title:'Unsafe',url:'javascript:alert(1)'}]}});
  }
  if(u.hostname==='api.apify.com'){
   if(u.pathname.endsWith('/runs')){actors++;assert.equal(JSON.parse(init.body).queries,'Broken search');return Response.json({data:{id:'fallback-run',status:'SUCCEEDED',usageTotalUsd:.02,defaultDatasetId:'fallback-data'}});}
   if(u.pathname.includes('/actor-runs/'))return Response.json({data:{id:'fallback-run',status:'SUCCEEDED',usageTotalUsd:.02,defaultDatasetId:'fallback-data'}});
   return Response.json([{organicResults:[{title:'Fallback study',url:'https://second.test/article'}]}]);
  }
  assert.equal(u.hostname,'firecrawl-search-test.invalid');
  const id=u.searchParams.get('id')?.replace(/^eq\./,'');
  if(!init.method||init.method==='GET')return Response.json(rows.get(id)||null);
  const body=JSON.parse(init.body),key=id||body.id;rows.set(key,body);return Response.json([{id:key}]);
 };
 try{
  const a=await requestMarketIntelWebSearch(['Good search'],'test','Example');assert.equal(a.pages[0].organicResults.length,1);
  await requestMarketIntelWebSearch(['Good search'],'test','Example');assert.equal(searches,1);assert.equal(actors,0);
  const b=await requestMarketIntelWebSearch(['Good search','Broken search'],'test','Example');assert.equal(b.pages.length,2);assert.equal(actors,1);assert.equal(searches,2);
  assert.equal([...rows.values()].find(r=>r.catalog?.creditsUsed===4)?.catalog.company,'Example');
 }finally{globalThis.fetch=original;for(const[k,v]of Object.entries(env)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});

test('a short title does not discard a dated article with explicit article metadata',()=>{
 const {articleFromHtml}=require('../lib/companyWebsiteNews.ts');
 const date=new Date(Date.now()-86400000).toISOString();
 const html=`<meta property="og:type" content="article"><meta property="article:published_time" content="${date}"><h1>ABC 2026</h1><main>Our upcoming industry event.</main>`;
 assert.equal(articleFromHtml(html,'https://example.test/events/abc-2026/','example.test')?.title,'ABC 2026');
 assert.equal(articleFromHtml(`<h1>News</h1>`,'https://example.test/news/','example.test'),null);
});

test('embedded CAPTCHA widget titles do not block an otherwise valid rendered article',async()=>{
 const original=globalThis.fetch;const saved={url:process.env.NEXT_PUBLIC_SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY};
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://readers-test.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='isolated-test';
 const rows=new Map();let reads=0;
 const html='<html><head><title>A valid company announcement</title></head><body><article><h1>A valid company announcement</h1><p>The company announced a clinical research partnership.</p></article><svg><title>reCAPTCHA</title></svg></body></html>';
 globalThis.fetch=async(input,init={})=>{
  const u=new URL(String(input));
  if(u.hostname==='api.firecrawl.dev'){reads++;return Response.json({success:true,data:{rawHtml:html,metadata:{statusCode:200,title:'A valid company announcement',creditsUsed:1}}});}
  assert.equal(u.hostname,'readers-test.invalid');
  const id=u.searchParams.get('id')?.replace(/^eq\./,'');
  if(!init.method||init.method==='GET')return Response.json(rows.get(id)||null);
  const body=JSON.parse(init.body);const key=id||body.id;rows.set(key,body);return Response.json([{id:key}]);
 };
 try {assert.equal(await requestRenderedNewsPage('https://publisher.test/widget-article','test-key'),html);assert.equal(reads,1);}
 finally {globalThis.fetch=original;if(saved.url===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=saved.url;if(saved.key===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=saved.key;}
});

test('a bare company-name app listing is not treated as news',()=>{
 const {filterCompanyNews}=require('../lib/companyWebsiteNews.ts');
 assert.equal(filterCompanyNews([{title:'Allucent',url:'https://play.google.com/store/apps/details?id=allucent',published:new Date().toISOString(),articleTextPartial:true}],'Allucent','allucent.com').length,0);
 assert.equal(filterCompanyNews([{title:'Allucent',url:'https://publisher.test/news/allucent',published:new Date().toISOString(),articleText:'Allucent announced a new clinical research network with 250 sites.',articleTextPartial:false}],'Allucent','allucent.com').length,1);
});
