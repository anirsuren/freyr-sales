import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
import test from 'node:test';
import assert from 'node:assert/strict';
const { applyBookmarkChanges } = require('../lib/marketIntelBookmarkChanges.ts');
const { linkedInIdentifier } = require('../lib/marketIntelLinks.ts');
const { MARKET_INTEL_REFRESH_MS } = require('../lib/marketIntelCadence.ts');

test('saving filtered competitors preserves customers and untouched hidden competitors',()=>{
 const original={companyIds:['customer','competitor-a','hidden'],starredIds:['customer','competitor-a','hidden']};
 const result=applyBookmarkChanges(original,[{id:'competitor-a',on:false,star:false},{id:'competitor-b',on:true,star:true}]);
 assert.deepEqual(result,{companyIds:['customer','hidden','competitor-b'],starredIds:['customer','hidden','competitor-b']});
 assert.deepEqual(original.companyIds,['customer','competitor-a','hidden']);
});
test('unstarring preserves tracking; repeated save is idempotent',()=>{
 const original={companyIds:['a','b'],starredIds:['a','b']};
 const changes=[{id:'a',on:true,star:false}];
 const result=applyBookmarkChanges(original,changes);
 assert.deepEqual(result,{companyIds:['a','b'],starredIds:['b']});
 assert.deepEqual(applyBookmarkChanges(result,changes),result);
});
test('Pfizer company links accept URL variants and reject fake LinkedIn hosts',()=>{
 for(const url of ['https://www.linkedin.com/company/pfizer/','linkedin.com/company/pfizer','https://uk.linkedin.com/company/pfizer/?x=1'])assert.equal(linkedInIdentifier(url,'company'),'pfizer');
 for(const url of ['https://notlinkedin.com/company/pfizer','https://linkedin.com.evil.test/company/pfizer','https://evil.test/linkedin.com/company/pfizer','https://linkedin.com/in/person','javascript://linkedin.com/company/pfizer'])assert.equal(linkedInIdentifier(url,'company'),null);
});
test('daily cadence means 24 hours',()=>assert.equal(MARKET_INTEL_REFRESH_MS,86400000));
