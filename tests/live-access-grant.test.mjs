import test from 'node:test';
import assert from 'node:assert/strict';
import { accessGrantMemberIsActive } from '../lib/liveAccessGrant.ts';
const grant={userId:'reserved-member',workspaceId:'reserved-workspace',role:'admin'};
const originalFetch=globalThis.fetch;
const originalUrl=process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
test('live membership is scoped and bypasses caches', async()=>{
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://reserved.example.invalid';
 process.env.SUPABASE_SERVICE_ROLE_KEY='reserved-test-key';
 try {
  globalThis.fetch=async(url,options)=>{
   assert.equal(url.searchParams.get('id'),'eq.reserved-member');
   assert.equal(url.searchParams.get('workspace_id'),'eq.reserved-workspace');
   assert.equal(url.searchParams.get('active'),'eq.true');
   assert.equal(url.searchParams.get('app_role'),'eq.admin');
   assert.equal(options.cache,'no-store');
   return {ok:true,json:async()=>[{id:grant.userId}]};
  };
  assert.equal(await accessGrantMemberIsActive(grant),true);
  for(const rows of [[],[{id:'different-member'}]]) {
   globalThis.fetch=async()=>({ok:true,json:async()=>rows});
   assert.equal(await accessGrantMemberIsActive(grant),false);
  }
  globalThis.fetch=async()=>({ok:false});
  assert.equal(await accessGrantMemberIsActive(grant),false);
  globalThis.fetch=async()=>{throw Error('Unavailable');};
  assert.equal(await accessGrantMemberIsActive(grant),false);
 } finally {
  globalThis.fetch=originalFetch;
  if(originalUrl===undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL=originalUrl;
  if(originalKey===undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY=originalKey;
 }
});
