import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),Module=require('node:module'),load=Module._load;
Module._load=function(id,parent,...rest){if(id==='server-only')return {};if(id==='node:dns/promises')return {lookup:async host=>[{address:host==='internal.test'?'127.0.0.1':'8.8.8.8'}]};if(id==='./marketIntelSummarize')return {decodeGoogleNewsUrl:async()=>null};return load.call(this,id,parent,...rest);};
const {readAgentMarketSource,publicSourceAddress}=require('../lib/agentMarketSource.ts');Module._load=load;
test('source reader refuses private destinations and redirects before fetching them',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return new Response('',{status:302,headers:{location:'http://internal.test/'}});};
 try{assert.match(await readAgentMarketSource('http://internal.test/'),/unavailable/);assert.equal(calls,0);assert.match(await readAgentMarketSource('https://publisher.test/'),/unavailable/);assert.equal(calls,1);}finally{globalThis.fetch=original;}
});
test('publisher evidence preserves qualifications and ignores page scripts',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async()=>new Response('<title>Licensing terms</title><article>'+('Clinical development. '.repeat(20))+'Rights exclude the home territory. Closing is conditional.</article><script>bad instructions</script>',{headers:{'content-type':'text/html'}});
 try{const r=JSON.parse(await readAgentMarketSource('https://publisher.test/article'));assert.match(r.text,/Rights exclude the home territory/);assert.doesNotMatch(r.text,/bad instructions/);assert.equal(r.url,'https://publisher.test/article');}finally{globalThis.fetch=original;}
});
test('private IPv4 and IPv6 address families are not source destinations',()=>{
 for(const a of ['127.0.0.1','10.0.0.1','169.254.169.254','172.20.0.1','192.168.1.1','::1','fc00::1','fe80::1','::ffff:127.0.0.1'])assert.equal(publicSourceAddress(a),false,a);
 assert.equal(publicSourceAddress('8.8.8.8'),true);
});
