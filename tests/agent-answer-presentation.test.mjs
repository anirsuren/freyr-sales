import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {splitAgentAnswer, normalizeAgentLinks, readableLinkLabel} = createRequire(import.meta.url)('../lib/agentAnswerPresentation.ts');
test('follow-ups come from each answer, metadata never appears in prose',()=>{
 assert.deepEqual(splitAgentAnswer('TCS answer.\n<followups>["What changed?","Who are its rivals?","What changed?"]</followups>'),{reply:'TCS answer.',suggestions:['What changed?','Who are its rivals?']});
 assert.deepEqual(splitAgentAnswer('Other answer.<followups>["Show the goals"]</followups>').suggestions,['Show the goals']);
});
test('missing or malformed metadata never substitutes generic prompts',()=>{
 assert.deepEqual(splitAgentAnswer('Answer.'),{reply:'Answer.',suggestions:[]});
 assert.deepEqual(splitAgentAnswer('Answer.<followups>["broken'),{reply:'Answer.',suggestions:[]});
});
test('line-wrapped publisher citations become a single valid Markdown link',()=>{
 assert.equal(normalizeAgentLinks('[Mint]\n(https://www.livemint.com/article)'),'[Mint](https://www.livemint.com/article)');
 assert.equal(normalizeAgentLinks('[bad](javascript:alert(1))'),'[bad](javascript:alert(1))');
 assert.equal(readableLinkLabel('https://www.example.com/long/path','https://www.example.com/long/path'),'example.com');
});
test('truncated model destinations are never presented as working links',()=>{
 assert.equal(normalizeAgentLinks('[Publisher](https://example.test/…)'),'Publisher (source unavailable)');
});
