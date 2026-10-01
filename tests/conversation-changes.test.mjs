import test from 'node:test';import assert from 'node:assert/strict';
import {mergeConversationChanges as merge}from '../lib/conversationChanges.ts';
const a={id:'a',text:'old'},b={id:'b',text:'new'},c={id:'c',text:'other'};
test('independent additions survive stale snapshots',()=>assert.deepEqual(merge([a],[a,b],[a,c]),[a,c,b]));
test('unchanged deleted chats are not resurrected',()=>assert.deepEqual(merge([a],[a,b],[]),[b]));
test('explicit deletion preserves unseen chats',()=>assert.deepEqual(merge([a],[],[a,c]),[c]));
test('same chat edits conflict and leave inputs untouched',()=>{const remote=[{...a,text:'remote'}];assert.equal(merge([a],[{...a,text:'local'}],remote),null);assert.equal(remote[0].text,'remote')});
test('deleting a concurrently edited chat conflicts',()=>assert.equal(merge([a],[],[{...a,text:'remote'}]),null));
test('replayed identical writes are idempotent',()=>assert.deepEqual(merge([], [a], [a]),[a]));
test('browser cache with acknowledged baseline cannot revive remote deletion',()=>assert.deepEqual(merge([a],[a],[]),[]));

// TWO DOORS, ONE THREAD (Sep 30): WhatsApp and the web page both add to the same chat.
const msg = (role, text, ts, extra = {}) => ({ role, text, ts, ...extra });
const chat = (messages, extra = {}) => ({ id: 'w', title: 'WhatsApp', channel: 'whatsapp', updated: Math.max(...messages.map(m => m.ts)), messages, ...extra });
const m1 = msg('user', 'hi', 1), r1 = msg('agent', 'hello', 2);
test('both sides only added messages: both kept, in time order', () => {
  const wa1 = msg('user', 'from the phone', 10), wa2 = msg('agent', 'phone reply', 11), web = msg('user', 'typed on the web', 12);
  const merged = merge([chat([m1, r1])], [chat([m1, r1, web])], [chat([m1, r1, wa1, wa2])]);
  assert.deepEqual(merged[0].messages.map(m => m.text), ['hi', 'hello', 'from the phone', 'phone reply', 'typed on the web']);
  assert.equal(merged[0].updated, 12);
  // The page's next save starts from its own copy, which never saw the phone's messages.
  const web2 = msg('agent', 'web reply', 13);
  const again = merge([chat([m1, r1, web])], [chat([m1, r1, web, web2])], merged);
  assert.deepEqual(again[0].messages.map(m => m.text), ['hi', 'hello', 'from the phone', 'phone reply', 'typed on the web', 'web reply']);
});
test('a card decided on one side and new messages on the other both stand', () => {
  const card = msg('agent', 'Want me to go ahead?', 3, { pendingAction: { id: 'act-1', status: 'proposed' } });
  const decided = { ...card, pendingAction: { id: 'act-1', status: 'done' } };
  const wa = msg('user', 'from the phone', 10);
  const merged = merge([chat([m1, card])], [chat([m1, decided])], [chat([m1, card, wa])]);
  assert.equal(merged[0].messages[1].pendingAction.status, 'done');
  assert.equal(merged[0].messages[2].text, 'from the phone');
});
test('the same message changed two ways is still a conflict', () => {
  const card = msg('agent', 'Want me to go ahead?', 3, { pendingAction: { id: 'act-1', status: 'proposed' } });
  assert.equal(merge([chat([m1, card])], [chat([m1, { ...card, pendingAction: { id: 'act-1', status: 'done' } }])], [chat([m1, { ...card, pendingAction: { id: 'act-1', status: 'cancelled' } }])]), null);
});
test('a message removed on one side and changed on the other is a conflict', () => {
  assert.equal(merge([chat([m1, r1])], [chat([m1])], [chat([m1, { ...r1, suggestions: ['x'] }])]), null);
});
test('a rename on one side and new messages on the other both stand', () => {
  const wa = msg('user', 'from the phone', 10);
  const merged = merge([chat([m1, r1])], [chat([m1, r1], { title: 'Pfizer pilot' })], [chat([m1, r1, wa])]);
  assert.equal(merged[0].title, 'Pfizer pilot');
  assert.equal(merged[0].channel, 'whatsapp');
  assert.equal(merged[0].messages.length, 3);
});
