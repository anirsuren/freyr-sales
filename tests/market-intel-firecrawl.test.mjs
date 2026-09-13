import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),Module=require('node:module'),original=Module._load;
const rows=new Map(),scrapes=[];let htmlByUrl={};
Module._load=function(name,...args){
 if(name==='server-only')return {};
 if(name==='./companyWebsiteNews'){const real=original.call(this,name,...args);return {...real,readPublicPage:async url=>({url: url.replace('old.example.test','new.example.test'),html:''})};}
 if(name==='./marketIntelCollectionStore')return {collectionKey:x=>JSON.stringify(x),readCollectionRow:async id=>rows.has(id)?{catalog:rows.get(id)}:null,writeCollectionRow:async(id,value)=>{rows.set(id,value);return true;}};
 if(name==='./marketIntelSearch')return {requestRenderedNewsPage:async url=>{scrapes.push(url);return htmlByUrl[url]??null;}};
 return original.call(this,name,...args);
};
const {collectFirecrawlWebsite,websiteMapKey,websitePageKey,isWebsiteListing}=require('../lib/marketIntelWebsiteCrawl.ts');
Module._load=original;
const recent=new Date().toISOString();
const article=title=>`<h1>${title}</h1><meta property="og:type" content="article"><meta property="article:published_time" content="${recent}">`;
test('daily listing discovers a new article while saved articles are reused',async()=>{
 rows.clear();scrapes.length=0;
 const index='https://example.test/en/news',old='https://example.test/en/news/existing-announcement',fresh='https://example.test/en/news/new-announcement';
 rows.set(websiteMapKey('example.test'),{at:recent,links:[{url:index},{url:old},{url:'https://unrelated.test/news/injection'}]});
 rows.set(websitePageKey(old),{at:recent,item:{title:'Existing announcement',url:old,published:recent},links:[]});
 rows.set(websitePageKey(index),{at:'2020-01-01',links:[old]});
 htmlByUrl={[index]:`<h1>News</h1><a href="${fresh}">Our latest announcement</a>`,[fresh]:article('New clinical research partnership announced')};
 const result=await collectFirecrawlWebsite('example.test','test');
 assert.equal(result.updates.length,2);assert.deepEqual(result.errors,[]);
 assert.deepEqual(scrapes,[index,fresh]);
 await collectFirecrawlWebsite('example.test','test');
 assert.deepEqual(scrapes,[index,fresh],'same-cycle replay makes no more paid scrapes');
});
test('unreadable Firecrawl pages report failure without fabricating updates',async()=>{
 rows.clear();scrapes.length=0;htmlByUrl={};
 rows.set(websiteMapKey('example.test'),{at:recent,links:[{url:'https://example.test/news'}]});
 const result=await collectFirecrawlWebsite('example.test','test');
 assert.equal(result.failed,true);assert.equal(result.updates.length,0);assert.equal(result.errors.length,1);
});
test('nested newsroom is refreshed daily but article URLs are not listing pages',()=>{
 assert.ok(isWebsiteListing('https://example.test/en/news/'));
 assert.ok(isWebsiteListing('https://example.test/news/page/2'));
 assert.equal(isWebsiteListing('https://example.test/news/new-partnership'),false);
});

test('official HTTP redirect changes the discovery domain without hardcoded company names',async()=>{
 rows.clear();scrapes.length=0;
 const url='https://new.example.test/news/latest-announcement';
 rows.set(websiteMapKey('new.example.test'),{at:recent,links:[{url}]});
 htmlByUrl={[url]:article('New clinical research partnership announced')};
 const result=await collectFirecrawlWebsite('old.example.test','test');
 assert.equal(result.updates.length,1);assert.equal(result.updates[0].url,url);
 assert.deepEqual(scrapes,[url]);
});
test('newsroom links are visited before the map archive backlog',async()=>{
 rows.clear();scrapes.length=0;
 const index='https://example.test/news',old='https://example.test/news/old-announcement',fresh='https://example.test/news/latest-announcement';
 rows.set(websiteMapKey('example.test'),{at:recent,links:[{url:old},{url:index}]});
 htmlByUrl={[index]:`<h1>News</h1><a href="${fresh}">Latest announcement</a>`,[old]:article('Archived company announcement'),[fresh]:article('New clinical research partnership announced')};
 await collectFirecrawlWebsite('example.test','test');
 assert.ok(scrapes.indexOf(fresh)<scrapes.indexOf(old));
});

test('blog listings discover article links outside named news URL sections',async()=>{
 rows.clear();scrapes.length=0;
 const index='https://example.test/blog',articleUrl='https://example.test/knowledge/designing-research-around-patient-needs';
 rows.set(websiteMapKey('example.test'),{at:recent,links:[{url:index}]});
 htmlByUrl={[index]:`<h1>Blog</h1><a href="${articleUrl}">Designing clinical research around patient needs</a>`,[articleUrl]:article('Designing clinical research around patient needs')};
 const result=await collectFirecrawlWebsite('example.test','test');
 assert.equal(result.updates[0]?.url,articleUrl);
 assert.deepEqual(scrapes,[index,articleUrl]);
});

test('a blog listing with article metadata cannot become a dated story',()=>{
 const {articleFromHtml}=require('../lib/companyWebsiteNews.ts');
 assert.equal(articleFromHtml(article('Company Perspectives Blog | Clinical Research Insights'),'https://example.test/blog','example.test'),null);
});

test('latest links from separate listings are interleaved and navigation is ignored',async()=>{
 rows.clear();scrapes.length=0;
 const news='https://example.test/news',blog='https://example.test/blog';
 const archive=Array.from({length:8},(_,i)=>`https://example.test/news/story-${i}`);
 const latest='https://example.test/blog/recent-story',nav='https://example.test/news/navigation-only';
 rows.set(websiteMapKey('example.test'),{at:recent,links:[{url:news},{url:blog}]});
 htmlByUrl={[news]:`<nav><a href="${nav}">Navigation</a></nav>`+archive.map(url=>`<a href="${url}">Article</a>`).join(''),[blog]:`<a href="${latest}">Latest blog</a>`};
 for(const url of [...archive,latest])htmlByUrl[url]=article('A recent company research announcement');
 await collectFirecrawlWebsite('example.test','test');
 assert.ok(scrapes.indexOf(latest)<scrapes.indexOf(archive[1]));
 assert.ok(!scrapes.includes(nav));
});

test('slow listing discovery cannot exhaust the allowance for reading its articles',async()=>{
 rows.clear();scrapes.length=0;
 const index='https://example.test/news',story='https://example.test/news/new-story';
 rows.set(websiteMapKey('example.test'),{at:recent,links:[{url:index}]});
 htmlByUrl={[index]:`<h1>News</h1><a href="${story}">New research announcement</a>`,[story]:article('New research announcement')};
 const realNow=Date.now;let calls=0;const base=realNow();
 // Discovery advances the wall clock, while the story itself is quick.
 Date.now=()=>base+(scrapes.includes(index)?150_000:0);
 try {const result=await collectFirecrawlWebsite('example.test','test');assert.equal(result.updates[0]?.url,story);}finally{Date.now=realNow;}
});

test('a paginated archive is visited after stories on the current newsroom',async()=>{
 rows.clear();scrapes.length=0;
 const index='https://example.test/news',archive=index+'/page/2',story=index+'/new-story';
 rows.set(websiteMapKey('example.test'),{at:recent,links:[{url:archive},{url:index}]});
 htmlByUrl={[index]:`<h1>News</h1><a href="${story}">New research announcement</a>`,[story]:article('New research announcement'),[archive]:'<h1>Older news</h1>'};
 await collectFirecrawlWebsite('example.test','test');assert.ok(scrapes.indexOf(story)<scrapes.indexOf(archive));
});

test('recent dated URLs are read before undated and historical map backlog',async()=>{
 rows.clear();scrapes.length=0;
 const month=new Date().toISOString().slice(0,7).replace('-','/');
 const fresh=`https://example.test/blog/${month}/new-study`,old='https://example.test/blog/2020/01/old-study',undated='https://example.test/blog/archive-story';
 rows.set(websiteMapKey('example.test'),{at:recent,links:[{url:old},{url:undated},{url:fresh}]});
 htmlByUrl={[fresh]:article('A recent clinical study'),[old]:article('An old clinical study'),[undated]:article('An undated study')};
 await collectFirecrawlWebsite('example.test','test');assert.deepEqual(scrapes,[fresh,undated,old]);
});
