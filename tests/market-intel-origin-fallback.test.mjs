import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {readPublicPage,articleFromHtml}=require('../lib/companyWebsiteNews.ts');
test('an unreachable apex retries the canonical www host with TLS verification intact',async()=>{
 const original=globalThis.fetch,calls=[];
 globalThis.fetch=async(url,init)=>{calls.push(String(url));assert.equal(init.redirect,'manual');if(String(url)==='https://example.test/news/announcement')throw new TypeError('fetch failed');return new Response(`<h1>Example announces a new partnership</h1><meta property="og:type" content="article"><meta property="article:published_time" content="${new Date().toISOString()}">`);};
 try{const page=await readPublicPage('https://example.test/news/announcement','example.test');assert.equal(page.url,'https://www.example.test/news/announcement');assert.ok(articleFromHtml(page.html,page.url,'example.test'));assert.deepEqual(calls,['https://example.test/news/announcement','https://www.example.test/news/announcement']);}finally{globalThis.fetch=original;}
});
test('fallback still rejects redirects to another company',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async(url)=>{if(String(url).startsWith('https://example.test'))throw Error('TLS');return new Response('',{status:302,headers:{location:'https://other.test/news'}});};
 try{await assert.rejects(()=>readPublicPage('https://example.test/news','example.test'),/leaves the company/);}finally{globalThis.fetch=original;}
});
test('headline numeric publication date overrides a later CMS timestamp without reading sidebar dates',()=>{
 const {visiblePublicationDate}=require('../lib/companyWebsiteNews.ts');
 assert.equal(visiblePublicationDate('<h1>Example acquisition</h1><p>22.4.2026 14:00:00 EEST | Wire | Press release</p><script type="application/ld+json">{"@type":"NewsArticle","datePublished":"2026-08-27"}</script>'),'2026-04-22');
 assert.equal(visiblePublicationDate('<h1>Example</h1><p>The deal happened on 22.4.2026.</p><aside><p>12.9.2026</p></aside>'),null);
 assert.equal(visiblePublicationDate('<h1>Example</h1><p>31.2.2026 14:00</p>'),null);
 assert.equal(visiblePublicationDate('<h1>Example</h1><div>Written by Editorial Team Tue, 18 Aug 2026</div>'),'2026-08-18');
 assert.equal(visiblePublicationDate('<h1>Example</h1><p>The conference begins 18 Aug 2026</p>'),null);
});
test('website discovery follows education resources and retains only dated recent articles',async()=>{
 const {collectCompanyWebsite}=require('../lib/companyWebsiteNews.ts');
 const original=globalThis.fetch;
 const article='/education-hub/new-clinical-evidence-strategy-report/';
 const undated='/education-hub/undated-clinical-evidence-strategy-report/';
 globalThis.fetch=async(url)=>{
  const path=new URL(url).pathname;
  if(path==='/')return new Response('<a href="/education-hub/">Education hub</a>');
  if(path==='/education-hub/')return new Response(`<a href="${article}">Our new clinical evidence strategy report</a><a href="${undated}">Our undated clinical evidence strategy report</a>`);
  if(path===article||path===undated)return new Response(`<h1>Our clinical evidence strategy report</h1>${path===article?`<meta property="article:published_time" content="${new Date().toISOString()}">`:''}`);
  return new Response('',{status:404});
 };
 try{const result=await collectCompanyWebsite('example.test');assert.equal(result.failed,false);assert.deepEqual(result.updates.map(n=>n.url),[`https://example.test${article}`]);}finally{globalThis.fetch=original;}
});
test('publisher indexes and generic industry words do not become company news',()=>{
 const {filterCompanyNews,isNewsIndex}=require('../lib/companyWebsiteNews.ts');
 for(const url of ['https://publisher.test/Globe+Newswire?before_id=123','https://publisher.test/es/actualidad','https://publisher.test/info'])assert.equal(isNewsIndex(url),true);
 assert.equal(isNewsIndex('https://publisher.test/info/123'),false);
 assert.equal(filterCompanyNews([{title:'Other company expands health services',url:'https://publisher.test/story/123',excerpt:'Health services expand worldwide'}],'Example Health').length,0);
 assert.equal(filterCompanyNews([{title:'Example opens a new laboratory',url:'https://publisher.test/story/123'}],'Example Health').length,1);
 assert.equal(filterCompanyNews([{title:'GE expands its research team',url:'https://publisher.test/story/123'}],'GE Healthcare').length,1);
});
test('browser-compatible origin requests expose the official LinkedIn link',async()=>{
 const {linkedInCompanyFromHtml}=require('../lib/companyWebsiteNews.ts');
 const original=globalThis.fetch;
 globalThis.fetch=async(_url,init)=>/AppleWebKit.*Chrome\//.test(init.headers['User-Agent'])?new Response('<a href="https://www.linkedin.com/company/example-science/">LinkedIn</a>'):new Response('',{status:403});
 try{const page=await readPublicPage('https://example.test','example.test');assert.equal(linkedInCompanyFromHtml(page.html),'https://www.linkedin.com/company/example-science');}finally{globalThis.fetch=original;}
});
test('a news WebPage uses its own publication date, never another page or modification date',()=>{
 const {articleFromHtml,pagePublicationDate}=require('../lib/companyWebsiteNews.ts');
 const url='https://example.test/news/new-research-and-development-announcement/';
 const date=new Date().toISOString();
 const html=`<h1>Example announces new research capabilities</h1><script type="application/ld+json">${JSON.stringify({'@graph':[{'@type':'WebPage',url,datePublished:date},{'@type':'WebPage',url:'https://example.test/other',datePublished:'2020-01-01'}]})}</script>`;
 assert.equal(articleFromHtml(html,url,'example.test').published,date);
 assert.equal(pagePublicationDate(`<script type="application/ld+json">${JSON.stringify({'@type':'WebPage',url,dateModified:date})}</script>`,url),null);
});
test('readable sitemaps alone do not turn blocked website articles into success',async()=>{
 const {collectCompanyWebsite}=require('../lib/companyWebsiteNews.ts');
 const original=globalThis.fetch;
 globalThis.fetch=async(url)=>String(url).endsWith('sitemap.xml')?new Response('<urlset></urlset>'):new Response('',{status:403});
 try{const result=await collectCompanyWebsite('example.test');assert.ok(result.pagesRead>0);assert.equal(result.failed,true);}finally{globalThis.fetch=original;}
});
test('unread articles cannot qualify through a neighbouring-story search snippet',async()=>{
 const {hydrateCompanyNews}=require('../lib/companyWebsiteNews.ts');
 const original=globalThis.fetch;globalThis.fetch=async()=>new Response('',{status:404});
 try{const unread=[];const result=await hydrateCompanyNews([{title:'Unrelated business appoints new leadership',url:'https://publisher.test/story/unrelated-test',excerpt:'Related: Example Health announces its new report',published:new Date().toISOString()}],'Example Health',null,false,url=>unread.push(url));assert.equal(result.length,0);assert.equal(unread.length,1);}finally{globalThis.fetch=original;}
});
test('author archives cannot enter external news',()=>{
 const {isNewsIndex,filterCompanyNews}=require('../lib/companyWebsiteNews.ts');
 assert.equal(isNewsIndex('https://publisher.test/author/person/'),true);
 assert.equal(filterCompanyNews([{url:'https://publisher.test/en/authors/person/',title:'Example company announces partnership',excerpt:'Example news'}],'Example').length,0);
});
test('Drupal related-story snippets cannot replace the actual article',()=>{
 const {extractArticleEvidence}=require('../lib/marketIntelSummarize.ts');
 const article='Example announced a clinical research partnership that expands its European operations. '.repeat(8);
 const r=extractArticleEvidence(`<main><div><h1>Example announces clinical research partnership</h1><p>${article}</p></div><div class="views-field-body">Unrelated sidebar story about another company</div></main>`,'https://publisher.test/news/partnership');
 assert.ok(r.text.includes(article.trim()));assert.ok(r.text.length>250);
});
