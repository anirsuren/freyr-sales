import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
import test from 'node:test';
import assert from 'node:assert/strict';
const {findCompanyDuplicate,companyDomain} = require('../lib/marketIntelDuplicates.ts');
const {articleFromHtml,newsFromXml,publishedDate,sameCompanySite,filterCompanyNews} = require('../lib/companyWebsiteNews.ts');
const {canReserveSearch,requestMarketIntelSearch} = require('../lib/marketIntelSearch.ts');

test('duplicate matching handles both inputs, subdomains, URL variants and lookalikes',()=>{
 const companies=[{id:'gsk',name:'GSK',website:'https://gsk.com',linkedinUrl:'https://www.linkedin.com/company/gsk/'}];
 for(const site of ['GSK.com','https://www.gsk.com/en-gb','https://media.gsk.com'])assert.equal(findCompanyDuplicate(companies,site,'')?.id,'gsk');
 assert.equal(findCompanyDuplicate(companies,'','linkedin.com/company/GSK?foo=1')?.id,'gsk');
 assert.equal(findCompanyDuplicate(companies,'gsk.com.evil.test',''),undefined);
 assert.equal(companyDomain('https://gsk.com@evil.test'),null);
});

test('official articles require their own publication date, reject index pages and foreign hosts',()=>{
 const date=new Date().toISOString();
 const html=`<h1>Example announces a new clinical partnership</h1><meta property="og:type" content="article"><meta property="article:published_time" content="${date}">`;
 assert.equal(articleFromHtml(html,'https://example.com/news/a-new-partnership','example.com')?.published,date);
 assert.equal(articleFromHtml(html,'https://example.com.evil.test/news/a-new-partnership','example.com'),null);
 assert.equal(articleFromHtml(html.replace('article:published_time','article:modified_time'),'https://example.com/news/a-new-partnership','example.com'),null);
 assert.equal(articleFromHtml(html.replace('Example announces a new clinical partnership','Results and presentations'),'https://example.com/investor-relations/results-and-presentations','example.com'),null);
 assert.equal(sameCompanySite('https://media.example.com/news','example.com'),true);
 assert.equal(publishedDate('not a date'),null);
 assert.equal(publishedDate('2999-01-01'),null);
});

test('RSS retains publisher title and date without inventing today for undated stories',()=>{
 const date=new Date().toUTCString();
 const rss=`<rss><channel><item><title>Study results - phase three - Publisher</title><link>https://publisher.test/story</link><pubDate>${date}</pubDate><source>Publisher</source></item><item><title>Undated</title><link>https://publisher.test/undated</link></item></channel></rss>`;
 const rows=newsFromXml(rss);assert.equal(rows.length,1);assert.equal(rows[0].title,'Study results - phase three');
 assert.deepEqual(newsFromXml(rss,'example.com'),[]);
});

test('paid-search cap accounts for in-flight reservations',()=>{
 assert.equal(canReserveSearch(.99,0,1),true);
 assert.equal(canReserveSearch(.99,.01,1),false);
 assert.equal(canReserveSearch(0,0,0),false);
});

test('news filtering rejects job listings, social posts, duplicates and stale daily results',()=>{
 const base={url:'https://news.google.com/rss/articles/a',published:new Date().toISOString(),source:'Publication'};
 const rows=[
 {...base,title:'Rimsys announces a new regulatory platform',publisherUrl:'https://businesswire.com'},
 {...base,title:'Rimsys announces a new regulatory platform',publisherUrl:'https://other-paper.test'},
 {...base,title:'Rimsys jobs and opportunities',publisherUrl:'https://linkedin.com'},
 {...base,title:'Rimsys Status. Check if Rimsys is down',publisherUrl:'https://statusgator.com'},
 {...base,title:'Rimsys announces an older partnership',published:'2020-01-01'},
 {...base,title:'Other company announces a regulatory platform'},
 ];
 assert.deepEqual(filterCompanyNews(rows,'Rimsys','rimsys.io',3*86400000).map(n=>n.title),['Rimsys announces a new regulatory platform','Rimsys announces a new regulatory platform']);
});

test('shared search cache bills once and records its actual purpose and cost',async()=>{
 const original=globalThis.fetch;
 const oldUrl=process.env.NEXT_PUBLIC_SUPABASE_URL,oldKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://search-accounting-test.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='test';
 const rows=new Map();let calls=0;
 globalThis.fetch=async(input,init)=>{
  const url=new URL(String(input));
  if(url.hostname==='api.perplexity.ai'){
   calls++;if(url.pathname==='/search')return Response.json({results:[{title:'Example news',url:'https://publisher.test/a'}]});return Response.json({choices:[{message:{content:'{"items":[]}'}}],usage:{cost:{total_cost:.006}}});
  }
  assert.equal(url.hostname,'search-accounting-test.invalid','Tests cannot touch a real database');
  const method=init?.method||'GET';const id=url.searchParams.get('id')?.replace(/^eq\./,'');
  if(method==='GET')return Response.json(rows.get(id)||null);
  const row=JSON.parse(init.body);
  if(method==='POST'){rows.set(row.id,{catalog:row.catalog,updated_at:row.updated_at});return Response.json([{id:row.id}]);}
  assert.equal(method,'PATCH');rows.set(id,row);return Response.json([{id}]);
 };
 try{
  const body={model:'sonar',messages:[{role:'user',content:'Find example news'}]};
  const first=await requestMarketIntelSearch(body,'key','website-updates','Example');
  const second=await requestMarketIntelSearch(body,'key','website-updates','Example');
  assert.equal(calls,1);assert.equal(first.usage.cost.total_cost,.006);assert.equal(second.usage.cost.total_cost,0);
  const ledger=[...rows.entries()].find(([id])=>id.includes('search-spend'))[1].catalog;
  assert.equal(ledger.spent,.006);assert.equal(ledger.requests[0].company,'Example');assert.deepEqual(ledger.reservations,{});
  const raw=await requestMarketIntelSearch({query:['Example news','Example press release']},'key','company-news-discovery','Example','search');
  const cachedRaw=await requestMarketIntelSearch({query:['Example news','Example press release']},'key','company-news-discovery','Example','search');
  assert.equal(raw.usage.cost.total_cost,.005);assert.equal(cachedRaw.usage.cost.total_cost,0);assert.equal(calls,2);
  const updatedLedger=[...rows.entries()].find(([id])=>id.includes('search-spend'))[1].catalog;
  assert.equal(updatedLedger.spent,.011);assert.deepEqual(updatedLedger.reservations,{});
  rows.set('market-intel:config',{catalog:{perplexityDailyLimitUsd:0},updated_at:'cap'});
  await assert.rejects(()=>requestMarketIntelSearch({model:'sonar',messages:[{role:'user',content:'Another company'}]},'key','website-updates','Another'),/Daily paid-search limit/);
  assert.equal(calls,2,'The cap must block the provider call, not just report overspending afterward');
 }finally{
  globalThis.fetch=original;
  if(oldUrl===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=oldUrl;
  if(oldKey===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=oldKey;
 }
});

test('company identity rejection is separate from industry relevance',()=>{
 const base={published:new Date().toISOString(),source:'Publication'};
 const rows=[
  {...base,url:'https://publisher.test/school',title:'School repair: Sitero Francisco Memorial',label:{v:3,relevant:false,industries:[],isCompanyNews:false}},
  {...base,url:'https://publisher.test/saddle',title:'Specialized Sitero Pro Saddle',label:{v:3,relevant:false,industries:[],isCompanyNews:false}},
  {...base,url:'https://publisher.test/funding',title:'Sitero announces financing',label:{v:3,relevant:false,industries:[],isCompanyNews:true}},
  {...base,url:'https://scientistlive.com/clinical',title:'Sitero extends clinical AI across the data lifecycle',label:{v:3,relevant:true,industries:['MPR'],isCompanyNews:true}},
  {...base,url:'https://ambitionbox.com/sitero',title:'Sitero annual salaries'},
  {...base,url:'https://jooble.org/sitero',title:'Sitero clinical director'},
 ];
 assert.deepEqual(filterCompanyNews(rows,'Sitero','sitero.com').map(n=>n.url),['https://publisher.test/funding','https://scientistlive.com/clinical']);
});

test('website discovery accepts one official LinkedIn company anchor, never people or ambiguous links',()=>{
 const {linkedInCompanyFromHtml}=require('../lib/companyWebsiteNews.ts');
 assert.equal(linkedInCompanyFromHtml('<a href="https://www.linkedin.com/company/siterollc/">LinkedIn</a>'),'https://www.linkedin.com/company/siterollc');
 assert.equal(linkedInCompanyFromHtml('<a href="https://www.linkedin.com/in/person">Person</a>'),null);
 assert.equal(linkedInCompanyFromHtml('<a href="https://linkedin.com/company/a">A</a><a href="https://linkedin.com/company/b">B</a>'),null);
});
test('body evidence admits a company mention absent from the headline',()=>{
 const row={title:'Reduce Live Study Risk With AI in eClinical Workflows',url:'https://prnewswire.com/news-releases/webinar',source:'PR Newswire',published:new Date().toISOString()};
 assert.equal(filterCompanyNews([row],'Sitero','sitero.com').length,0);
 assert.equal(filterCompanyNews([{...row,excerpt:'Join Joby John, Vice President, Service Delivery, Sitero, for the webinar.'}],'Sitero','sitero.com').length,1);
});

test('speaker biographies are not company news even when a former employer is mentioned',()=>{
 assert.equal(filterCompanyNews([{title:'Jeff Huntsman',url:'https://conference.test/event/contact/jeff-huntsman',source:'Conference',excerpt:'Previously Chief Commercial Officer at Sitero',published:new Date().toISOString()}],'Sitero','sitero.com').length,0);
});
test('article evidence reads body and original publication date before site navigation',async()=>{
 const {resolveArticleEvidence}=require('../lib/marketIntelSummarize.ts');
 const original=globalThis.fetch;
 globalThis.fetch=async()=>new Response(`<html><head><meta property="article:published_time" content="2026-08-18T12:08:00Z"></head><body><nav>${'Navigation '.repeat(600)}</nav><article><header><h1>A clinical company announces a new platform</h1></header><p>${'Sitero announced new clinical workflows. '.repeat(20)}</p></article></body></html>`);
 try {const r=await resolveArticleEvidence('https://publisher.test/article');assert.equal(r.title,'A clinical company announces a new platform');assert.equal(r.published,'2026-08-18T12:08:00.000Z');assert.ok(r.text.includes('Sitero'));assert.ok(!r.text.includes('Navigation'));}finally{globalThis.fetch=original;}
});

test('news deduplication joins Google/direct URLs while preserving different publishers',()=>{
 const {dedupeCompanyNews}=require('../lib/companyWebsiteNews.ts');
 const title='Example launches a comprehensive clinical data platform';const base={title,published:'2026-08-18T12:00:00Z',source:'Yahoo Finance'};
 const result=dedupeCompanyNews([{...base,url:'https://news.google.com/rss/articles/a',publisherUrl:'https://finance.yahoo.com'}, {...base,title:'Example launches a comprehensive clinical ...',url:'https://finance.yahoo.com/article/a'}, {...base,url:'https://prnewswire.com/news-releases/a',source:'PR Newswire'}]);
 assert.equal(result.length,2);assert.equal(result[0].url,'https://finance.yahoo.com/article/a');assert.equal(result[0].title,title);
});

test('date-only news keeps its calendar day without inventing midnight UTC',()=>{
 assert.equal(publishedDate('2026-08-18'),'2026-08-18');
 const {fmtWhen}=require('../lib/whenLabel.ts');assert.equal(fmtWhen(publishedDate('2026-08-18')),'Aug 18, 2026');
});

test('website collection follows linked archive pages and does not silently stop at 24 articles',async()=>{
 const {collectCompanyWebsite}=require('../lib/companyWebsiteNews.ts');
 const original=globalThis.fetch;const calls=[];const date=new Date().toISOString();
 globalThis.fetch=async(input)=>{
  const url=String(input);calls.push(url);const path=new URL(url).pathname;
  if(path==='/')return new Response('<a href="/blog">Blog</a>');
  if(path==='/blog')return new Response(Array.from({length:30},(_,i)=>`<article><a href="/blog/article-${i}">A sufficiently descriptive announcement number ${i}</a><time datetime="${date}"></time></article>`).join('')+'<a href="/blog/page/2" rel="next">Next</a>');
  if(path==='/blog/page/2')return new Response(`<article><a href="/blog/last">Another sufficiently descriptive recent announcement</a><time datetime="${date}"></time></article><article><a href="/blog/old">A sufficiently descriptive outdated announcement</a><time datetime="2020-01-01"></time></article>`);
  return new Response(`<h1>A sufficiently descriptive company announcement ${path}</h1><meta property="og:type" content="article"><meta property="article:published_time" content="${date}">`);
 };
 try {const result=await collectCompanyWebsite('example.test');assert.equal(result.updates.length,31);assert.ok(result.updates.some(n=>n.url.endsWith('/last')));assert.ok(!calls.some(u=>u.endsWith('/old')));assert.deepEqual(result.errors,[]);}finally{globalThis.fetch=original;}
});

test('future event times and static directories are not publication evidence',async()=>{
 const {resolveArticleEvidence}=require('../lib/marketIntelSummarize.ts');const original=globalThis.fetch;
 globalThis.fetch=async()=>new Response(`<h1>A forthcoming company conference</h1><main><time datetime="2027-10-12">October 12</time><p>${'Conference details. '.repeat(30)}</p></main>`);
 try{assert.equal((await resolveArticleEvidence('https://publisher.test/events/conference')).published,null);}finally{globalThis.fetch=original;}
 const base={title:'Example company information',source:'Publisher',published:new Date().toISOString()};
 assert.equal(filterCompanyNews([{...base,url:'https://publisher.test/firms/example'}],'Example').length,0);
 assert.equal(filterCompanyNews([{...base,url:'https://publisher.test/news/a',published:'2027-10-12'}],'Example').length,0);
});

test('CMS migration dates cannot turn an old visible article into recent news',()=>{
 const html=`<h1>An older company announcement</h1><div class="blog_date-wrap"><p>May 28, 2020</p><p>4 min read</p></div><script type="application/ld+json">${JSON.stringify({'@type':'BlogPosting',headline:'An older company announcement',datePublished:new Date().toISOString()})}</script>`;
 assert.equal(articleFromHtml(html,'https://example.test/blog/old','example.test'),null);
});

test('a related article mentioning the company cannot qualify an unrelated main story',async()=>{
 const {hydrateCompanyNews}=require('../lib/companyWebsiteNews.ts');const original=globalThis.fetch;
 globalThis.fetch=async()=>new Response(`<h1>An unrelated legal proceeding</h1><main><div class="article-body">${'A court heard the legal case. '.repeat(30)}</div><div class="article-body">Example launched a new platform.</div></main>`);
 try{assert.deepEqual(await hydrateCompanyNews([{title:'An unrelated legal proceeding',url:'https://publisher.test/news/court-case',published:new Date().toISOString(),source:'Publisher',excerpt:'Related: Example launched a new platform'}],'Example','example.test'),[]);}finally{globalThis.fetch=original;}
});

test('resolved articles replace publisher homepages for verification and reading',async()=>{
 const {hydrateCompanyNews}=require('../lib/companyWebsiteNews.ts');const original=globalThis.fetch;
 const url='https://publisher.test/news/example-launch';
 globalThis.fetch=async()=>new Response(`<h1>Example launches a new platform</h1><article>${'Example announced its new platform today. '.repeat(12)}</article>`);
 try {
  const [article]=await hydrateCompanyNews([{title:'Example launches a new platform',url,publisherUrl:'https://publisher.test',published:new Date().toISOString(),source:'Publisher'}],'Example','example.test');
  assert.equal(article.publisherUrl,url);assert.equal(article.url,url);
 } finally {globalThis.fetch=original;}
});

test('signal labeling cannot override a rejected or unanswered identity decision',async()=>{
 const {classifyItems}=require('../lib/marketIntelSummarize.ts');
 const original=globalThis.fetch;const apiKey=process.env.ANTHROPIC_API_KEY,forced=process.env.AGENT_FORCE_MOCK;
 process.env.ANTHROPIC_API_KEY='isolated-test-key';delete process.env.AGENT_FORCE_MOCK;
 let call=0;
 globalThis.fetch=async(input)=>{
  assert.ok(String(input).includes('anthropic.com'));call++;
  const content=call===1?{items:[{i:0,accept:false},{i:1,accept:true}]}:{items:[0,1,2].map(i=>({i,signals:['others'],isCompanyNews:true,relevant:true,industries:[]}))};
  return Response.json({id:'test',type:'message',role:'assistant',model:'test',content:[{type:'text',text:JSON.stringify(content)}],usage:{input_tokens:1,output_tokens:1},stop_reason:'end_turn'});
 };
 try{const labels=await classifyItems('Example','competitor',[0,1,2].map(i=>({kind:'news',title:`Candidate ${i}`,text:'Evidence'})));assert.equal(labels.get(0).isCompanyNews,false);assert.equal(labels.get(1).isCompanyNews,true);assert.equal(labels.has(2),false);assert.equal(call,2);}finally{globalThis.fetch=original;if(apiKey===undefined)delete process.env.ANTHROPIC_API_KEY;else process.env.ANTHROPIC_API_KEY=apiKey;if(forced===undefined)delete process.env.AGENT_FORCE_MOCK;else process.env.AGENT_FORCE_MOCK=forced;}
});

test('an industry-specific query supplements rather than replaces the company-name search',async()=>{
 const {readCompanyNewsSearch}=require('../lib/companyWebsiteNews.ts');const original=globalThis.fetch;const queries=[];
 globalThis.fetch=async(input)=>{const url=new URL(String(input));queries.push(url.searchParams.get('q'));return new Response('<rss><channel></channel></rss>');};
 try{await readCompanyNewsSearch('Example','example.test','"Example" regulatory management');assert.ok(queries.includes('"Example" when:90d'));assert.ok(queries.includes('"Example" regulatory management'));}finally{globalThis.fetch=original;}
});


test('job ads and vendor rankings cannot be mistaken for company news',()=>{
 const base={source:'Publisher',published:new Date().toISOString()};
 const candidates=[
  {...base,url:'https://publisher.test/job/vice-president-operations',title:'Vice President, Operations',excerpt:'Example is recruiting a leader.'},
  {...base,url:'https://publisher.test/jobs/engineer',title:'Senior Engineer - Example'},
  {...base,url:'https://publisher.test/top-tools',title:'Top regulatory software platforms in 2026',excerpt:'Example appears among vendors.'}
 ];
 assert.deepEqual(filterCompanyNews(candidates,'Example'),[]);
 assert.equal(filterCompanyNews([{...base,url:'https://publisher.test/news/new-vp',title:'Example appoints a new Vice President of Operations'}],'Example').length,1);
});

test('publication-history comparison handles clipped headlines without equating different deals',()=>{
 const {sameAnnouncementTitle}=require('../lib/companyNewsDiscovery.ts');
 const title="Example Acquires Partner's Clinical Technology Suite to Expand Its Platform";
 assert.equal(sameAnnouncementTitle(title,'Example Acquires Partners Clinical Technology Suite to Expand ...'),true);
 assert.equal(sameAnnouncementTitle(title,'Example Acquires Another Clinical Technology Suite to Expand Its Platform'),false);
 assert.equal(sameAnnouncementTitle('Example acquires assets','Example acquires assets again'),false);
});
