import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {bucketByDay}=require('../lib/chatTime.ts');
const {mergeConversationChanges}=require('../lib/conversationChanges.ts');
test('history merged in server insertion order displays newest first without mutating saved data',()=>{
 const now=Date.now();
 const old={id:'old',updated:now-60*86400000};
 const first={id:'first',updated:now-1000};
 const latest={id:'latest',updated:now};
 const merged=mergeConversationChanges([old],[latest,old],[old,first]);
 assert.deepEqual(merged.map(x=>x.id),['old','first','latest']);
 const groups=bucketByDay(merged,x=>x.updated);
 assert.equal(groups[0].label,'Today');
 assert.deepEqual(groups.flatMap(g=>g.items.map(x=>x.id)),['latest','first','old']);
 assert.equal(groups.filter(g=>g.label==='Today').length,1);
 assert.deepEqual(merged.map(x=>x.id),['old','first','latest']);
});
