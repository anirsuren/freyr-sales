import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {agentSourceReferences}=createRequire(import.meta.url)('../lib/agentSourceReferences.ts');
test('long source URLs survive generation via request-local references',()=>{
 const refs=agentSourceReferences();
 const url='https://news.example.test/rss/'+ 'A'.repeat(900)+'?oc=5';
 assert.equal(refs.compact(`[Publisher](${url})`),'[Publisher](/agent-source/1)');
 assert.equal(refs.compact(`[Again](${url})`),'[Again](/agent-source/1)');
 assert.equal(refs.expand('See [Publisher](/agent-source/1).'),`See [Publisher](${url}).`);
 assert.equal(refs.expand('[Invented](/agent-source/999)'), 'Invented');
 assert.equal(agentSourceReferences().expand('[Other request](/agent-source/1)'), 'Other request');
});
