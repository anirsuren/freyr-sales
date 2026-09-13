import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),M=require('node:module'),old=M._load;
M._load=function(n,...a){return n==='server-only'?{}:old.call(this,n,...a)};
const {parseWebsiteSelection}=require('../lib/marketIntelWebsiteSelection.ts');M._load=old;
test('AI output resolves only exact discovered URLs and distinguishes listing from article',()=>{
 const links=[{url:'https://example.test/blog'},{url:'https://example.test/unknown-section/actual-article'}];
 assert.deepEqual(parseWebsiteSelection({listings:[0],articles:[0,1,1]},links),{listings:[links[0].url],articles:[links[1].url]});
 for(const id of [-1,2,'1','https://invented.test/article',1.5])assert.throws(()=>parseWebsiteSelection({listings:[],articles:[id]},links));
 assert.throws(()=>parseWebsiteSelection({articles:[1]},links));
});
