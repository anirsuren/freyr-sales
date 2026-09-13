import test from 'node:test';import assert from 'node:assert/strict';import{createRequire}from'node:module';
const require=createRequire(import.meta.url),M=require('node:module'),old=M._load;const rows=new Map();let homepage='<link rel="https://api.w.org/" href="https://example.test/wp-json/">';
M._load=function(n,...a){
 if(n==='server-only')return {};
 if(n==='./marketIntelCollectionStore')return{collectionKey:x=>x,readCollectionRow:async id=>rows.has(id)?{catalog:rows.get(id)}:null,writeCollectionRow:async(id,v)=>{rows.set(id,v);return true;}};
 if(n==='./companyWebsiteNews'){const actual=old.call(this,n,...a);return{...actual,readPublicPage:async url=>({url,html:homepage})};}
 return old.call(this,n,...a);
};
const{discoverPublishedWebsiteLinks}=require('../lib/marketIntelPublishedLinks.ts');M._load=old;
test('advertised public CMS feeds paginate recent URLs and reuse the daily result',async()=>{
 rows.clear();const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async input=>{calls++;const u=new URL(input);assert.equal(u.hostname,'example.test');
  if(u.pathname.endsWith('/types'))return Response.json({news:{slug:'news',name:'News',_links:{'wp:items':[{href:'https://example.test/wp-json/wp/v2/announcements'}]}},team:{slug:'team',name:'Team',_links:{'wp:items':[{href:'https://example.test/wp-json/wp/v2/team'}]}}});
  assert.equal(u.pathname,'/wp-json/wp/v2/announcements');assert.ok(u.searchParams.get('after'));const page=u.searchParams.get('page');
  return Response.json([{link:`https://example.test/news/story-${page}`,date_gmt:new Date(Date.now()-1000).toISOString().slice(0,19),title:{rendered:'Research &amp; Development'}}],{headers:{'x-wp-totalpages':'2'}});
 };
 try{const result=await discoverPublishedWebsiteLinks('example.test');assert.equal(result.length,2);assert.equal(result[0].title,'Research & Development');await discoverPublishedWebsiteLinks('example.test');assert.equal(calls,3);}finally{globalThis.fetch=original;}
});
test('unadvertised or off-site CMS endpoints do not trigger guessed requests',async()=>{
 rows.clear();const original=globalThis.fetch;globalThis.fetch=async()=>{throw Error('Unexpected request')};
 try{homepage='';assert.deepEqual(await discoverPublishedWebsiteLinks('example.test'),[]);homepage='<link rel="https://api.w.org/" href="https://unrelated.test/wp-json/">';assert.deepEqual(await discoverPublishedWebsiteLinks('example.test'),[]);}finally{globalThis.fetch=original;homepage='<link rel="https://api.w.org/" href="https://example.test/wp-json/">';}
});
