import test from 'node:test';
import assert from 'node:assert/strict';
import { checkInDue, validCheckInTime, dailyCheckInMessage } from '../lib/checkInSchedule.ts';
const schedule = { enabled: true, time: '08:30', timeZone: 'America/New_York' };
test('uses the chosen minute and timezone, not UTC hour', () => {
  assert.equal(checkInDue(new Date('2026-10-03T12:29:00Z'), schedule), false);
  assert.equal(checkInDue(new Date('2026-10-03T12:30:00Z'), schedule), true);
  assert.equal(checkInDue(new Date('2026-10-03T13:30:00Z'), schedule), false);
});
test('follows daylight saving offsets and pause preference', () => {
  assert.equal(checkInDue(new Date('2026-12-03T13:30:00Z'), schedule), true);
  assert.equal(checkInDue(new Date('2026-12-03T12:30:00Z'), schedule), false);
  assert.equal(checkInDue(new Date('2026-12-03T13:30:00Z'), {...schedule, enabled:false}), false);
});
test('validates full 24-hour time and supports midnight', () => {
  for (const value of ['8:00', '24:00', '12:60', '', null]) assert.equal(validCheckInTime(value), false);
  assert.equal(validCheckInTime('00:00'), true);
  assert.equal(checkInDue(new Date('2026-10-03T04:00:00Z'), {...schedule,time:'00:00'}), true);
});

test('empty days still get a personal check-in without inventing tasks', () => {
  const text = dailyCheckInMessage('Anir', []);
  assert.match(text, /Hi Anir/);
  assert.match(text, /nothing due today or overdue in the work I can see/);
  assert.match(text, /What would you like to focus on/);
});
test('daily check-in includes every due item', () => {
  const items = Array.from({length:12}, (_,i) => ({line:`Task ${i+1}`}));
  const text = dailyCheckInMessage('Anir', items);
  for (const item of items) assert.ok(text.includes(`• ${item.line}`));
  assert.ok(!text.includes('nothing due'));
});
