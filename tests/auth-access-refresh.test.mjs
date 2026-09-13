import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Module = require('node:module'), original = Module._load;
let principal = {id:'fixture', email:'fixture@example.com'}, state = 'approved';
const mocks = {
  '@/lib/accessControl': {ACCESS_COOKIE:'freyr_access_v2', ACCESS_TTL_SECONDS:900, isApprovalGateEnabled:()=>true, signAccessGrant:async()=>'fresh-grant'},
  '@/lib/appSession': {requestUsesHttps:()=>false},
  '@/lib/requestPrincipal': {authenticatedRequestPrincipal:async()=>principal},
  '@/lib/accessStore': {resolveWorkspaceAccess:async()=> {if(state==='outage')throw Error('service unavailable');return {status:state,userId:'member',workspaceId:'dev',role:'bd_member'};}},
  '@/lib/authOrigin': {browserRedirectOrigin:()=> 'http://localhost:3006'},
  '@/lib/appHome': {appHomePath:()=>'/offerings'},
};
Module._load=function(id,...args){return mocks[id]??original.call(this,id,...args)};
const {POST}=require('../app/api/auth/access/route.ts');
const {GET}=require('../app/api/auth/resolve/route.ts');
const {NextRequest}=require('next/server');
Module._load=original;
for(const endpoint of ['refresh','resolve'])for(const scenario of ['signed-out','pending','approved','outage']) {
 test(`${endpoint}: ${scenario}`,async()=>{
  principal=scenario==='signed-out'?null:{id:'fixture',email:'fixture@example.com'};
  state=scenario;
  const response=await(endpoint==='refresh'?POST:GET)(new NextRequest('http://localhost:3006/api/auth/'+endpoint+'?next=/agent'));
  const cookie=response.cookies.get('freyr_access_v2');
  if(scenario==='signed-out'||scenario==='pending'){
   assert.equal(cookie?.value,'');assert.equal(cookie.maxAge,0);
   assert.equal(response.status,endpoint==='refresh'?(scenario==='signed-out'?401:403):307);
  }else if(scenario==='approved') {assert.equal(cookie?.value,'fresh-grant');assert.equal(cookie.maxAge,900);}
  else {assert.equal(cookie,undefined);assert.equal(response.status,endpoint==='refresh'?503:307);}
 });
}
